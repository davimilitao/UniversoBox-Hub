/**
 * @file ImageEditor.jsx
 * @description Editor de imagem de produto — modal completo com:
 *   • Botão "Aplicar Padrão": Cloudinary 800×800 branco, improve + sharpen
 *   • Recortar: react-image-crop com preview antes de enviar
 *   • Remover fundo: @imgly/background-removal (WASM local, sem custo por imagem)
 * @version 1.0.0
 * @date 2026-04-05
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import {
  X, Sparkles, Crop, Eraser, Loader2, Download,
  CheckCircle2, RotateCcw, Eye, Upload, AlertTriangle,
} from 'lucide-react';
import { getAuthToken } from '../utils/getAuthToken';

// ─── Proxy helper ─────────────────────────────────────────────────────────────

/**
 * Retorna a URL original para imagens Cloudinary (CORS permitido).
 * Para qualquer outro host externo, usa o proxy backend para evitar bloqueio CORS.
 */
function proxyIfNeeded(url) {
  if (!url) return url;
  if (url.includes('res.cloudinary.com')) return url;
  if (url.startsWith('/') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return `/admin/proxy-image?url=${encodeURIComponent(url)}`;
}

// ─── Cloudinary helpers ───────────────────────────────────────────────────────

/**
 * Aplica transformações de padronização numa URL do Cloudinary.
 * Insere parâmetros entre /upload/ e o restante do path.
 */
export function cloudinaryStandardize(url) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  const params = 'c_pad,b_white,w_1200,h_1200,e_improve,e_sharpen:60,f_auto,q_auto:best';
  // Evita dupla aplicação: remove transformações anteriores (tudo entre /upload/ e o public_id base)
  const match = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/);
  if (!match) return url;
  const [, base, rest] = match;
  // Remove transform block se existir (não começa com v\d ou [a-z0-9_-]+\/)
  const cleanRest = rest.replace(/^([a-z_,:/0-9]+\/)(?=v\d|[a-z0-9_-]+\.[a-z]+)/, '');
  return `${base}${params}/${cleanRest}`;
}

/**
 * Gera URL de preview do Cloudinary com watermark de "antes/depois".
 * Simplesmente adiciona transformação sem salvar.
 */
export function cloudinaryPreviewUrl(url) {
  return cloudinaryStandardize(url);
}

// ─── Canvas utils ─────────────────────────────────────────────────────────────

function getCroppedBlob(image, crop) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth  / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width  = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      image,
      crop.x * scaleX, crop.y * scaleY,
      crop.width * scaleX, crop.height * scaleY,
      0, 0, crop.width, crop.height,
    );
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('canvas empty')), 'image/jpeg', 0.92);
  });
}

function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth, mediaHeight,
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * @param {Object}   props
 * @param {string}   props.url       - URL atual da imagem
 * @param {string}   props.sku       - SKU do produto (para re-upload)
 * @param {string}   props.kind      - 'stock' | 'box' | 'bin'
 * @param {Function} props.onSaved   - callback(newUrl) após salvar
 * @param {Function} props.onClose   - fecha o modal
 */
export function ImageEditor({ url, sku, kind = 'stock', onSaved, onClose }) {
  const [activeTab,  setActiveTab]  = useState('padrao');  // 'padrao' | 'crop' | 'bg'
  const [status,     setStatus]     = useState(null);       // null | 'loading' | 'done' | 'err'
  const [statusMsg,  setStatusMsg]  = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);

  // Crop state
  const [crop,        setCrop]        = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef    = useRef(null);
  const canvasRef = useRef(null);

  // BG removal state
  const [bgBlob,   setBgBlob]   = useState(null);
  const [bgObjUrl, setBgObjUrl] = useState(null);

  // Clean up object URLs
  useEffect(() => {
    return () => { if (bgObjUrl) URL.revokeObjectURL(bgObjUrl); };
  }, [bgObjUrl]);

  // ── Tab: Cloudinary Padrão ─────────────────────────────────────────────────
  const standardPreview = cloudinaryPreviewUrl(url);

  async function applyStandard() {
    setStatus('loading'); setStatusMsg('Gerando imagem padronizada…');
    try {
      // Para Cloudinary: usa transformações; para outros hosts: baixa via proxy (evita CORS)
      const fetchUrl = proxyIfNeeded(standardPreview);
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error('Falha ao buscar imagem transformada');
      const blob = await res.blob();
      await uploadBlob(blob);
    } catch (e) {
      setStatus('err'); setStatusMsg(e.message);
    }
  }

  // ── Tab: Crop ──────────────────────────────────────────────────────────────
  function onImgLoad(e) {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }

  async function applyCrop() {
    if (!completedCrop || !imgRef.current) {
      setStatus('err');
      setStatusMsg('Selecione uma área para recortar antes de aplicar');
      return;
    }
    setStatus('loading'); setStatusMsg('Recortando imagem…');
    try {
      const blob = await getCroppedBlob(imgRef.current, completedCrop);
      if (!blob || blob.size === 0) throw new Error('Blob vazio após crop');
      console.log('[ImageEditor] Crop OK, blob size:', blob.size);
      await uploadBlob(blob);
    } catch (e) {
      setStatus('err');
      const msg = e.message || 'Erro ao recortar imagem';
      setStatusMsg(msg);
      console.error('[ImageEditor] applyCrop error:', e);
    }
  }

  // ── Tab: BG Removal ────────────────────────────────────────────────────────
  async function removeBg() {
    setStatus('loading');
    setStatusMsg('Carregando modelo de IA… (1ª vez pode levar até 30s — fica em cache)');

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: processamento demorou muito')), 120000) // 2min timeout
    );

    try {
      // Dynamic import to avoid loading 40MB unless user requests
      const { removeBackground } = await import('@imgly/background-removal');
      setStatusMsg('Removendo fundo…');

      // Usa proxy para URLs externas (S3, CDN Bling) que bloqueiam CORS no navegador
      const imageSource = proxyIfNeeded(url);

      // Race: removeBackground vs timeout
      const resultBlob = await Promise.race([
        removeBackground(imageSource, {
          progress: (key, cur, total) => {
            if (total > 0) setStatusMsg(`Processando… ${Math.round((cur / total) * 100)}%`);
          },
        }),
        timeoutPromise
      ]);

      if (!resultBlob) throw new Error('Resultado vazio da IA');

      const objUrl = URL.createObjectURL(resultBlob);
      setBgBlob(resultBlob);
      setBgObjUrl(objUrl);
      setStatus(null);
      setStatusMsg('');
      console.log('[ImageEditor] Background removal OK');
    } catch (e) {
      setStatus('err');
      const msg = e.message || 'Erro desconhecido ao remover fundo';
      setStatusMsg(msg);
      console.error('[ImageEditor] removeBg error:', e);
    }
  }

  async function saveBgResult() {
    if (!bgBlob) return;
    setStatus('loading'); setStatusMsg('Aplicando fundo branco 1200×1200…');
    try {
      // Compõe: fundo branco + imagem sem fundo → 1200×1200
      const img = new Image();
      img.src = bgObjUrl;
      await new Promise(r => { img.onload = r; });
      const SIZE = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, SIZE, SIZE);
      // Centraliza a imagem mantendo proporção com padding 5%
      const pad = SIZE * 0.05;
      const maxSide = SIZE - pad * 2;
      const scale = Math.min(maxSide / img.naturalWidth, maxSide / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      const finalBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
      setStatusMsg('Enviando para o servidor…');
      await uploadBlob(finalBlob);
    } catch (e) {
      setStatus('err'); setStatusMsg('Erro ao compor imagem: ' + e.message);
    }
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  async function uploadBlob(blob) {
    try {
      const token = await getAuthToken();
      const fd = new FormData();
      fd.append('file', blob, `${sku}_edited.jpg`);
      fd.append('kind', kind);
      const res = await fetch(`/admin/save-photo-cloudinary/${encodeURIComponent(sku)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Falha no upload');
      setStatus('done');
      setStatusMsg('Imagem salva com sucesso!');
      setTimeout(() => {
        onSaved(data.url);
        onClose();
      }, 1200);
    } catch (e) {
      setStatus('err');
      setStatusMsg('Erro no upload: ' + e.message);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'padrao', label: 'Aplicar Padrão', Icon: Sparkles },
    { id: 'crop',   label: 'Recortar',       Icon: Crop     },
    { id: 'bg',     label: 'Remover Fundo',  Icon: Eraser   },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/[0.08] shadow-2xl animate-scale-in overflow-hidden" style={{ background: 'var(--bg-surface, #0f172a)' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-0">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Sparkles size={14} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-100">Editor de Imagem</p>
            <p className="text-[10px] text-slate-600 font-mono truncate">{sku} · {kind}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 px-5 mt-4 border-b border-white/[0.05]">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setActiveTab(t.id); setStatus(null); setStatusMsg(''); }}
              className={[
                'flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold border-b-2 transition-colors',
                activeTab === t.id
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-slate-600 hover:text-slate-400',
              ].join(' ')}
            >
              <t.Icon size={12} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">

          {/* ── Status bar ── */}
          {status && (
            <div className={[
              'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm animate-fade-in',
              status === 'loading' ? 'border-blue-500/20 bg-blue-500/[0.05] text-blue-300' :
              status === 'done'    ? 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-300' :
                                    'border-red-500/20 bg-red-500/[0.05] text-red-300',
            ].join(' ')}>
              {status === 'loading' && <Loader2 size={14} className="animate-spin shrink-0" />}
              {status === 'done'    && <CheckCircle2 size={14} className="shrink-0" />}
              {status === 'err'     && <AlertTriangle size={14} className="shrink-0" />}
              <span className="text-xs">{statusMsg}</span>
            </div>
          )}

          {/* ═══════ TAB: PADRÃO ═══════ */}
          {activeTab === 'padrao' && (
            <div className="space-y-4">
              <div className="text-[12px] text-slate-500 leading-relaxed">
                Gera uma versão <strong className="text-slate-300">1200×1200px com fundo branco</strong>, melhoria automática de qualidade e nitidez via Cloudinary. Padrão marketplace.
              </div>
              {/* Before / After preview */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-2">Antes</p>
                  <div className="aspect-square rounded-xl bg-slate-800 border border-white/[0.07] overflow-hidden">
                    {url && <img src={url} alt="antes" className="w-full h-full object-contain p-2" />}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-2">Depois (preview)</p>
                  <div className="aspect-square rounded-xl bg-white border border-white/[0.1] overflow-hidden">
                    {standardPreview && (
                      <img src={standardPreview} alt="depois" className="w-full h-full object-contain"
                        onError={e => { e.target.style.display = 'none'; }} />
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-600 bg-slate-800/60 rounded-lg px-3 py-2 border border-white/[0.05]">
                <Sparkles size={10} className="text-blue-400 shrink-0" />
                <span>Transformações: <code className="text-slate-400 text-[9px]">c_pad, b_white, w_800, h_800, e_improve, e_sharpen:60, f_auto, q_auto:best</code></span>
              </div>
              <button onClick={applyStandard} disabled={status === 'loading'}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all disabled:opacity-50 active:scale-95">
                {status === 'loading' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                Aplicar Padrão e Salvar
              </button>
            </div>
          )}

          {/* ═══════ TAB: CROP ═══════ */}
          {activeTab === 'crop' && (
            <div className="space-y-4">
              <div className="text-[12px] text-slate-500 leading-relaxed">
                Arraste para selecionar a área desejada. Por padrão o corte é <strong className="text-slate-300">quadrado 1:1</strong> (ideal para marketplace).
              </div>
              <div className="flex justify-center bg-slate-800/60 rounded-xl border border-white/[0.07] p-3 overflow-auto max-h-[360px]">
                {url && (
                  <ReactCrop
                    crop={crop}
                    onChange={c => setCrop(c)}
                    onComplete={c => setCompletedCrop(c)}
                    aspect={1}
                    minWidth={50}
                    minHeight={50}
                  >
                    <img
                      ref={imgRef}
                      src={url}
                      alt="Recortar"
                      className="max-w-full max-h-[320px] object-contain"
                      onLoad={onImgLoad}
                    />
                  </ReactCrop>
                )}
              </div>
              {completedCrop?.width && completedCrop?.height && (
                <p className="text-[10px] text-slate-600 text-center tabular-nums">
                  Recorte: {Math.round(completedCrop.width)}×{Math.round(completedCrop.height)}px
                </p>
              )}
              <button onClick={applyCrop} disabled={!completedCrop?.width || status === 'loading'}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all disabled:opacity-50 active:scale-95">
                {status === 'loading' ? <Loader2 size={15} className="animate-spin" /> : <Crop size={15} />}
                Salvar com recorte
              </button>
            </div>
          )}

          {/* ═══════ TAB: REMOVER FUNDO ═══════ */}
          {activeTab === 'bg' && (
            <div className="space-y-4">
              <div className="text-[12px] text-slate-500 leading-relaxed">
                Remove o fundo <strong className="text-slate-300">100% no navegador</strong> com IA, aplica fundo branco e salva em <strong className="text-slate-300">1200×1200px</strong>. Modelo em cache após 1ª vez.
              </div>

              {!bgObjUrl && (
                <div className="flex justify-center">
                  <div className="w-48 h-48 rounded-xl bg-slate-800 border border-white/[0.07] overflow-hidden">
                    {url && <img src={url} alt="original" className="w-full h-full object-contain p-2" />}
                  </div>
                </div>
              )}

              {bgObjUrl && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-2">Original</p>
                    <div className="aspect-square rounded-xl bg-slate-800 border border-white/[0.07] overflow-hidden">
                      <img src={url} alt="original" className="w-full h-full object-contain p-2" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-2">Fundo Removido ✓</p>
                    {/* Checkerboard BG to show transparency */}
                    <div className="aspect-square rounded-xl border border-emerald-500/20 overflow-hidden"
                      style={{ background: 'repeating-conic-gradient(#2d3748 0% 25%, #1a2035 0% 50%) 0 0 / 20px 20px' }}>
                      <img src={bgObjUrl} alt="sem fundo" className="w-full h-full object-contain" />
                    </div>
                  </div>
                </div>
              )}

              {!bgObjUrl && (
                <button onClick={removeBg} disabled={status === 'loading'}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-purple-500/40 text-purple-400 hover:bg-purple-500/[0.06] font-bold text-sm transition-all disabled:opacity-50">
                  {status === 'loading'
                    ? <><Loader2 size={15} className="animate-spin" /> Processando…</>
                    : <><Eraser size={15} /> Remover fundo com IA</>
                  }
                </button>
              )}

              {bgObjUrl && !status && (
                <div className="flex gap-2">
                  <button onClick={() => { setBgBlob(null); setBgObjUrl(null); }}
                    className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl border border-white/[0.08] text-slate-500 hover:text-slate-300 text-sm transition-colors">
                    <RotateCcw size={13} /> Refazer
                  </button>
                  <button onClick={saveBgResult}
                    className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all active:scale-95">
                    <Upload size={13} /> Salvar resultado
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
