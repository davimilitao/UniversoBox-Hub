/**
 * @file ImageStudio.jsx
 * @description Hub centralizado de edição de fotos de produtos.
 *   • Busca por SKU ou EAN → carrega produto do Bling
 *   • Galeria de fotos com overlay de edição
 *   • Integra ImageEditor (Padrão / Recortar / Remover Fundo)
 *   • Salva imagens editadas de volta no Bling
 *   • Suporte a deep-link via ?sku= ou ?ean=
 * @version 1.0.0
 * @date 2026-04-06
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Loader2, ImageIcon, Sparkles, Plus, Save,
  CheckCircle, AlertCircle, Camera, Trash2, ExternalLink,
  Info,
} from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';
import { ImageEditor } from '../../components/ImageEditor';

// ─── Left sidebar ─────────────────────────────────────────────────────────────
function Sidebar({ q, setQ, buscar, buscando, searchErr, produto }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const imgCount = produto?.imagens?.length || 0;

  return (
    <div className="w-72 shrink-0 border-r border-white/[0.05] flex flex-col h-full" style={{ background: 'var(--bg-sidebar, #020617)' }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Camera size={13} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-200 leading-none">Image Studio</h1>
            <p className="text-[9px] text-slate-600 mt-0.5">Edição centralizada de fotos</p>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            className="flex-1 bg-slate-800 border border-white/[0.07] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-violet-500/50 placeholder:text-slate-600 transition-colors"
            placeholder="SKU ou código EAN..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscar()}
          />
          <button
            onClick={() => buscar()}
            disabled={buscando}
            title="Buscar"
            className="px-2.5 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-white transition-colors disabled:opacity-50 shrink-0"
          >
            {buscando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          </button>
        </div>

        {searchErr && (
          <p className="text-[10px] text-red-400 mt-1.5 flex items-center gap-1">
            <AlertCircle size={10} className="shrink-0" /> {searchErr}
          </p>
        )}
      </div>

      {/* Product mini-card */}
      {produto ? (
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          {/* Thumbnail + info */}
          <div className="flex items-start gap-2.5">
            <div className="w-14 h-14 rounded-lg bg-slate-800 border border-white/[0.07] overflow-hidden shrink-0">
              {produto.imagens?.[0]
                ? <img src={produto.imagens[0]} alt="" className="w-full h-full object-contain p-1" />
                : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={16} className="text-slate-700" /></div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-200 leading-tight line-clamp-2">{produto.nome}</p>
              <p className="text-[10px] font-mono text-violet-400 mt-0.5">{produto.codigo}</p>
              {produto.gtin && <p className="text-[10px] text-slate-600 font-mono">{produto.gtin}</p>}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-slate-800/60 rounded-lg px-2.5 py-2 text-center">
              <p className="text-[18px] font-black text-violet-400 leading-none">{imgCount}</p>
              <p className="text-[9px] text-slate-600 mt-0.5">foto{imgCount !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-slate-800/60 rounded-lg px-2.5 py-2 text-center">
              <p className={`text-[11px] font-bold leading-none mt-1 ${produto.situacao === 'A' ? 'text-emerald-400' : 'text-slate-500'}`}>
                {produto.situacao === 'A' ? 'Ativo' : 'Inativo'}
              </p>
              <p className="text-[9px] text-slate-600 mt-0.5">situação</p>
            </div>
          </div>

          {produto.categoria?.nome && (
            <p className="text-[10px] text-slate-600 truncate">
              <span className="text-slate-700">Categoria:</span> {produto.categoria.nome}
            </p>
          )}

          {produto.marca && (
            <p className="text-[10px] text-slate-600">
              <span className="text-slate-700">Marca:</span> {produto.marca}
            </p>
          )}

          <a
            href={`https://www.bling.com.br/produtos.php#edit/${produto.id}`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            <ExternalLink size={9} /> Ver no Bling
          </a>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <Camera size={28} className="mx-auto mb-3 text-slate-700" />
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Busque por SKU ou EAN<br />para carregar as fotos
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Image card ───────────────────────────────────────────────────────────────
function ImageCard({ url, idx, onEdit, onRemove }) {
  return (
    <div className="group relative aspect-square rounded-xl overflow-hidden border border-white/[0.07]"
      style={{ background: '#0f172a' }}>
      <img
        src={url}
        alt={`Foto ${idx + 1}`}
        className="w-full h-full object-contain p-2"
        onError={e => { e.target.style.opacity = '0.3'; }}
      />
      {idx === 0 && (
        <span className="absolute top-1.5 left-1.5 text-[8px] font-bold bg-violet-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wide">
          Principal
        </span>
      )}
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
        <button
          onClick={() => onEdit(idx)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-white text-[11px] font-bold transition-colors"
        >
          <Sparkles size={12} /> Editar
        </button>
        <button
          onClick={() => onRemove(idx)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/80 hover:bg-red-500/80 rounded-lg text-slate-300 hover:text-white text-[11px] transition-colors"
        >
          <Trash2 size={11} /> Remover
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ImageStudio() {
  const [searchParams] = useSearchParams();

  const [q,          setQ]          = useState('');
  const [buscando,   setBuscando]   = useState(false);
  const [searchErr,  setSearchErr]  = useState('');
  const [produto,    setProduto]    = useState(null);
  const [editorImg,  setEditorImg]  = useState(null); // { url, idx }
  const [salvando,   setSalvando]   = useState(false);
  const [salvoOk,    setSalvoOk]    = useState(false);
  const [saveErr,    setSaveErr]    = useState('');
  const [urlEdits,   setUrlEdits]   = useState(false); // show url list

  // Auto-search from URL params on mount
  useEffect(() => {
    const sku = searchParams.get('sku') || searchParams.get('ean');
    if (sku) {
      setQ(sku);
      buscar(sku);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function buscar(query) {
    const term = (query || q).trim();
    if (!term || term.length < 3) { setSearchErr('Mínimo 3 caracteres'); return; }
    setBuscando(true); setSearchErr(''); setProduto(null); setSalvoOk(false); setSaveErr('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/catalogo/buscar?q=${encodeURIComponent(term)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Produto não encontrado');
      setProduto(data);
    } catch (e) {
      setSearchErr(e.message);
    } finally {
      setBuscando(false);
    }
  }

  async function salvarNoBling() {
    if (!produto) return;
    setSalvando(true); setSaveErr(''); setSalvoOk(false);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/catalogo/produto/${produto.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(produto),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Falha ao salvar');
      setSalvoOk(true);
      setTimeout(() => setSalvoOk(false), 3000);
    } catch (e) {
      setSaveErr(e.message);
    } finally {
      setSalvando(false);
    }
  }

  function onImageSaved(newUrl, idx) {
    setProduto(prev => {
      const imagens = [...(prev.imagens || [])];
      imagens[idx] = newUrl;
      return { ...prev, imagens };
    });
    setEditorImg(null);
  }

  function removeImage(idx) {
    setProduto(prev => ({ ...prev, imagens: (prev.imagens || []).filter((_, j) => j !== idx) }));
  }

  function updateImageUrl(idx, val) {
    setProduto(prev => {
      const arr = [...(prev.imagens || [])];
      arr[idx] = val;
      return { ...prev, imagens: arr };
    });
  }

  const imagens = produto?.imagens || [];

  return (
    <div className="h-full overflow-hidden flex">

      {/* LEFT SIDEBAR */}
      <Sidebar
        q={q} setQ={setQ}
        buscar={buscar}
        buscando={buscando}
        searchErr={searchErr}
        produto={produto}
      />

      {/* MAIN PANEL */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {!produto ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-xs">
              <div className="w-20 h-20 rounded-2xl bg-violet-500/[0.07] border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles size={32} className="text-violet-400/40" />
              </div>
              <p className="text-slate-400 text-sm font-semibold mb-1">Image Studio</p>
              <p className="text-slate-600 text-xs leading-relaxed">
                Busque um produto pela barra lateral para editar as fotos.<br />
                Você pode navegar aqui diretamente de qualquer tela com imagens.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">

            {/* ── Product header ── */}
            <div className="sticky top-0 z-10 border-b border-white/[0.05] px-6 py-3 flex items-center justify-between gap-4"
              style={{ background: 'var(--bg-app, #020617)' }}>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white truncate">{produto.nome}</h2>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                  <span className="font-mono text-violet-400">{produto.codigo}</span>
                  {produto.gtin && <span>· EAN {produto.gtin}</span>}
                  {produto.marca && <span>· {produto.marca}</span>}
                  <span className="text-slate-700">·</span>
                  <span>{imagens.length} foto{imagens.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {saveErr && (
                  <span className="text-[10px] text-red-400 flex items-center gap-1">
                    <AlertCircle size={10} /> {saveErr}
                  </span>
                )}
                <button
                  onClick={salvarNoBling}
                  disabled={salvando || !produto.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all disabled:opacity-50"
                >
                  {salvando
                    ? <Loader2 size={12} className="animate-spin" />
                    : salvoOk
                    ? <CheckCircle size={12} />
                    : <Save size={12} />
                  }
                  {salvoOk ? 'Salvo!' : 'Salvar no Bling'}
                </button>
              </div>
            </div>

            {/* ── Gallery ── */}
            <div className="p-6 space-y-6">

              {imagens.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-600">
                  <ImageIcon size={48} className="opacity-20" />
                  <p className="text-sm">Nenhuma foto cadastrada para este produto</p>
                  <p className="text-xs text-slate-700">Adicione URLs de imagens abaixo</p>
                </div>
              )}

              {imagens.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-3">
                    Fotos ({imagens.length}) — passe o mouse para editar
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {imagens.map((url, i) => (
                      <ImageCard
                        key={i}
                        url={url}
                        idx={i}
                        onEdit={(idx) => setEditorImg({ url: imagens[idx], idx })}
                        onRemove={removeImage}
                      />
                    ))}

                    {/* Add slot */}
                    <button
                      onClick={() => {
                        setProduto(prev => ({ ...prev, imagens: [...(prev.imagens || []), ''] }));
                        setUrlEdits(true);
                      }}
                      className="aspect-square rounded-xl border-2 border-dashed border-white/[0.07] hover:border-violet-500/40 text-slate-700 hover:text-violet-400 transition-all flex flex-col items-center justify-center gap-1.5 text-[10px] font-medium"
                    >
                      <Plus size={16} />
                      Adicionar
                    </button>
                  </div>
                </div>
              )}

              {/* ── URL list (toggle) ── */}
              <div>
                <button
                  onClick={() => setUrlEdits(v => !v)}
                  className="flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors mb-2"
                >
                  <Info size={10} />
                  {urlEdits ? 'Ocultar' : 'Editar'} URLs das fotos
                </button>

                {(urlEdits || imagens.length === 0) && (
                  <div className="space-y-1.5 bg-slate-900/60 border border-white/[0.05] rounded-xl p-4">
                    {imagens.map((url, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-700 font-mono w-4 text-right shrink-0">{i + 1}</span>
                        <input
                          className="flex-1 bg-slate-800 border border-white/[0.05] rounded-lg px-3 py-1.5 text-[11px] text-slate-400 font-mono outline-none focus:border-violet-500/30 transition-colors"
                          value={url}
                          onChange={e => updateImageUrl(i, e.target.value)}
                          placeholder="https://..."
                        />
                        {url && (
                          <button
                            onClick={() => setEditorImg({ url, idx: i })}
                            title="Editar no studio"
                            className="text-slate-600 hover:text-violet-400 transition-colors shrink-0"
                          >
                            <Sparkles size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => removeImage(i)}
                          className="text-slate-700 hover:text-red-400 transition-colors shrink-0 text-xs"
                        >✕</button>
                      </div>
                    ))}

                    <button
                      onClick={() => setProduto(prev => ({ ...prev, imagens: [...(prev.imagens || []), ''] }))}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-white/[0.08] hover:border-violet-500/30 text-slate-700 hover:text-violet-400 text-xs transition-colors mt-1"
                    >
                      <Plus size={11} /> Adicionar URL
                    </button>
                  </div>
                )}
              </div>

              {/* ── Tips ── */}
              <div className="bg-violet-500/[0.04] border border-violet-500/10 rounded-xl p-4 space-y-2">
                <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Como funciona</p>
                <ul className="space-y-1 text-[11px] text-slate-500 leading-relaxed">
                  <li>• <strong className="text-slate-400">Padrão</strong>: aplica fundo branco 1200×1200 via Cloudinary</li>
                  <li>• <strong className="text-slate-400">Recortar</strong>: corte quadrado 1:1 ideal para marketplace</li>
                  <li>• <strong className="text-slate-400">Remover Fundo</strong>: IA no navegador, sem custo, ilimitado</li>
                  <li>• Clique em "Salvar no Bling" após editar para sincronizar</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* IMAGE EDITOR MODAL */}
      {editorImg && (
        <ImageEditor
          url={editorImg.url}
          sku={produto?.codigo || 'produto'}
          kind="stock"
          onSaved={(newUrl) => onImageSaved(newUrl, editorImg.idx)}
          onClose={() => setEditorImg(null)}
        />
      )}
    </div>
  );
}
