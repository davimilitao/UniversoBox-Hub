/**
 * @file BatchImageStudio.jsx
 * @description Estúdio de Processamento de Fotos em Lote.
 *   • Carrega múltiplas fotos locais (Drag & Drop ou File Selector)
 *   • Processa no Canvas local para 1200x1200px, fundo branco, mantendo proporção e margem de 5%
 *   • Extrai SKU do nome do arquivo automaticamente (e permite ajuste manual)
 *   • Realiza busca no Bling para garantir que o SKU existe
 *   • Envia a foto padronizada para o Cloudinary e vincula diretamente ao produto no Bling em lote
 * @version 1.0.0
 * @date 2026-05-23
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  UploadCloud, CheckCircle, AlertCircle, Trash2, Play,
  Loader2, Sparkles, ArrowRight, Search, Camera, Check, X, RefreshCw
} from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';

// Auxiliar para formatar moeda
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function brl(v) { return BRL.format(v || 0); }

// Suffixes regex to strip from filename (e.g. _1, _principal, -2)
const SUFFIX_REGEX = /([-_](principal|frente|verso|lado|detalhe|costas|box|embalagem|\d+))+$/i;

/**
 * Filtra e limpa o nome do arquivo para encontrar o SKU provável
 */
function parseSkuFromFilename(filename) {
  const dotIdx = filename.lastIndexOf('.');
  let base = dotIdx !== -1 ? filename.substring(0, dotIdx) : filename;
  base = base.trim();
  // Strip suffixes
  base = base.replace(SUFFIX_REGEX, '');
  return base.toUpperCase().trim();
}

/**
 * Desenha a imagem no Canvas 1200x1200px com fundo branco
 */
function processImageToCanvas(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const SIZE = 1200;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');

        // Pinta fundo branco
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, SIZE, SIZE);

        // Define margem de 5% (60px de cada lado)
        const pad = SIZE * 0.05;
        const maxSide = SIZE - pad * 2;

        // Escala mantendo proporção
        const scale = Math.min(maxSide / img.naturalWidth, maxSide / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;

        // Desenha centralizado
        ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Falha ao gerar blob do Canvas'));
            return;
          }
          const previewUrl = URL.createObjectURL(blob);
          resolve({
            width: img.naturalWidth,
            height: img.naturalHeight,
            blob,
            previewUrl
          });
        }, 'image/jpeg', 0.92);
      };
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

export default function BatchImageStudio() {
  const [queue, setQueue] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [autoProcess, setAutoProcess] = useState(false);
  const fileInputRef = useRef(null);
  
  // Ref para sempre acessar a fila mais recente nos loops assíncronos
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Carrega configuração de autoProcess do localStorage
  useEffect(() => {
    try {
      const val = localStorage.getItem('batch_auto_process');
      if (val) setAutoProcess(val === 'true');
    } catch {}
  }, []);

  const toggleAutoProcess = () => {
    setAutoProcess(prev => {
      const next = !prev;
      try { localStorage.setItem('batch_auto_process', String(next)); } catch {}
      return next;
    });
  };

  // ── Drag and Drop Handlers ──────────────────────────────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      await addFilesToQueue(files);
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      await addFilesToQueue(files);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Adiciona arquivos na fila e inicia padronização local
  const addFilesToQueue = async (files) => {
    const newItems = files.map(file => {
      const parsedSku = parseSkuFromFilename(file.name);
      return {
        id: Math.random().toString(36).substring(2, 9),
        file,
        filename: file.name,
        originalUrl: URL.createObjectURL(file),
        parsedSku,
        status: 'pending', // 'pending' | 'searching' | 'uploading' | 'saving' | 'success' | 'error'
        errorMsg: '',
        width: 0,
        height: 0,
        blob: null,
        previewUrl: '',
        blingProduct: null
      };
    });

    setQueue(prev => [...prev, ...newItems]);

    // Processa os itens localmente para gerar o canvas 1200x1200px
    for (const item of newItems) {
      try {
        const result = await processImageToCanvas(item.file);
        setQueue(prev => prev.map(it => it.id === item.id ? {
          ...it,
          width: result.width,
          height: result.height,
          blob: result.blob,
          previewUrl: result.previewUrl
        } : it));

        // Se auto-processar estiver ativo, inicia o fluxo do Bling/Cloudinary imediatamente
        if (autoProcess) {
          triggerProcessItem(item.id);
        }
      } catch (err) {
        setQueue(prev => prev.map(it => it.id === item.id ? {
          ...it,
          status: 'error',
          errorMsg: 'Falha no redimensionamento: ' + err.message
        } : it));
      }
    }
  };

  // Limpa a fila e libera as URLs temporárias de preview
  const clearQueue = () => {
    if (processing) return;
    queue.forEach(item => {
      if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setQueue([]);
  };

  // Remove um item específico da fila
  const removeItem = (id) => {
    const item = queue.find(it => it.id === id);
    if (item) {
      if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    setQueue(prev => prev.filter(it => it.id !== id));
  };

  // Altera o SKU manualmente
  const handleSkuChange = (id, newSku) => {
    setQueue(prev => prev.map(it => it.id === id ? { ...it, parsedSku: newSku.toUpperCase().trim() } : it));
  };

  // Executa individualmente a busca e validação do Bling
  const searchProductInBling = async (id) => {
    const item = queueRef.current.find(it => it.id === id);
    if (!item) return null;

    setQueue(prev => prev.map(it => it.id === id ? { ...it, status: 'searching', errorMsg: '' } : it));

    try {
      const res = await fetch(`/api/catalogo/buscar?q=${encodeURIComponent(item.parsedSku)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Produto não cadastrado no Bling');
      }

      setQueue(prev => prev.map(it => it.id === id ? { ...it, status: 'pending', blingProduct: data } : it));
      return data;
    } catch (err) {
      setQueue(prev => prev.map(it => it.id === id ? { ...it, status: 'error', errorMsg: err.message } : it));
      return null;
    }
  };

  // Processa um item específico (Bling Search -> Cloudinary Upload -> Bling Save)
  const triggerProcessItem = async (id) => {
    let item = queueRef.current.find(it => it.id === id);
    if (!item) return;

    // Se ainda não temos a imagem processada no Canvas, aguarda
    if (!item.blob) {
      setQueue(prev => prev.map(it => it.id === id ? { ...it, status: 'error', errorMsg: 'Aguardando redimensionamento da imagem...' } : it));
      return;
    }

    let blingProduct = item.blingProduct;

    // Se ainda não buscou ou falhou na busca, busca agora
    if (!blingProduct) {
      blingProduct = await searchProductInBling(id);
      if (!blingProduct) return; // Erro já tratado no search
    }

    // Avança para envio de imagem
    setQueue(prev => prev.map(it => it.id === id ? { ...it, status: 'uploading', errorMsg: '' } : it));

    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append('file', item.blob, `${item.parsedSku}_standard.jpg`);
      formData.append('kind', 'stock');

      // Upload para Cloudinary (endpoint do servidor)
      const uploadRes = await fetch(`/admin/save-photo-cloudinary/${encodeURIComponent(item.parsedSku)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.ok) {
        throw new Error(uploadData.error || 'Erro ao enviar para o Cloudinary');
      }

      const cloudUrl = uploadData.url;

      // Avança para gravação no Bling
      setQueue(prev => prev.map(it => it.id === id ? { ...it, status: 'saving' } : it));

      // Mescla a foto Cloudinary como primeira (principal) no Bling
      const currentImgs = blingProduct.imagens || [];
      const updatedImgs = currentImgs.includes(cloudUrl)
        ? currentImgs
        : [cloudUrl, ...currentImgs]; // Insere na primeira posição

      const updatedProduct = {
        ...blingProduct,
        imagens: updatedImgs
      };

      // Salva de volta no Bling via API
      const saveRes = await fetch(`/api/catalogo/produto/${blingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProduct),
      });
      const saveData = await saveRes.json();

      if (!saveRes.ok || !saveData.ok) {
        throw new Error(saveData.error || 'Falha ao vincular foto no Bling');
      }

      // Sucesso!
      setQueue(prev => prev.map(it => it.id === id ? {
        ...it,
        status: 'success',
        blingProduct: updatedProduct
      } : it));

    } catch (err) {
      setQueue(prev => prev.map(it => it.id === id ? { ...it, status: 'error', errorMsg: err.message } : it));
    }
  };

  // Processa toda a fila sequencialmente
  const processAll = async () => {
    if (processing) return;
    setProcessing(true);

    const itemsToProcess = queue.filter(it => it.status === 'pending' || it.status === 'error');
    
    for (const item of itemsToProcess) {
      // Re-busca o item da ref atualizada para garantir os valores corretos
      const currentItem = queueRef.current.find(it => it.id === item.id);
      if (currentItem) {
        await triggerProcessItem(currentItem.id);
      }
    }

    setProcessing(false);
  };

  // Métricas para render do painel
  const stats = queue.reduce((acc, it) => {
    acc.total++;
    if (it.status === 'success') acc.success++;
    else if (it.status === 'error') acc.error++;
    else if (it.status === 'pending') acc.pending++;
    else acc.running++;
    return acc;
  }, { total: 0, success: 0, error: 0, pending: 0, running: 0 });

  const progressPercent = stats.total > 0 ? Math.round(((stats.success + stats.error) / stats.total) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 text-white overflow-hidden">
      
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 border-b border-white/[0.05] bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shadow-lg shadow-violet-900/15">
            <Sparkles size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100">Estúdio de Imagens em Lote</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">Padronize fotos de produtos locais em lote (1200x1200px, fundo branco) e salve no Bling</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/catalogo/fotos"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.03] text-[11px] text-slate-400 hover:text-white transition-all font-semibold"
          >
            <Camera size={13} />
            Editor Individual
          </Link>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 w-full">
        
        {/* ── Dropzone Area ── */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerFileSelect}
          className={[
            'relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-3',
            isDragging
              ? 'border-violet-500 bg-violet-500/5 shadow-2xl shadow-violet-500/5 scale-[0.99]'
              : 'border-white/[0.08] bg-slate-900/40 hover:border-violet-500/40 hover:bg-slate-900/60'
          ].join(' ')}
        >
          <input
            type="file"
            multiple
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-white/[0.05] flex items-center justify-center text-slate-400 group-hover:text-violet-400 transition-colors shadow-inner">
            {processing ? (
              <Loader2 size={28} className="animate-spin text-violet-400" />
            ) : (
              <UploadCloud size={28} className="text-slate-400" />
            )}
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-200">Arraste e solte fotos de produtos aqui</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Ou clique para procurar nas pastas do seu computador. Daremos fundo branco de forma automática.
            </p>
          </div>

          <div className="text-[10px] text-slate-600 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-white/[0.03] mt-1">
            <strong>Dica de ouro:</strong> Nomeie a foto com o SKU (ex: <code className="text-slate-500 font-mono text-[9px]">BUBA-1234.jpg</code>) para auto-vincular no sistema.
          </div>
        </div>

        {/* ── Queue and Controls ── */}
        {queue.length > 0 && (
          <div className="space-y-4 animate-fade-in">
            
            {/* Control Dashboard Card */}
            <div className="bg-slate-900/50 border border-white/[0.05] rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
              
              {/* Stats & Progress */}
              <div className="flex-1 w-full space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-400">Progresso da Fila</span>
                  <span className="font-mono font-bold text-violet-400">{progressPercent}% ({stats.success + stats.error}/{stats.total})</span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-white/[0.03]">
                  <div
                    className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {/* Counters row */}
                <div className="flex items-center gap-3 text-[10px] font-bold tracking-wide uppercase text-slate-500 pt-1">
                  <span>Total: <strong className="text-slate-300">{stats.total}</strong></span>
                  <span>·</span>
                  <span className="text-emerald-400">Sucesso: <strong>{stats.success}</strong></span>
                  <span>·</span>
                  <span className="text-red-400">Erros: <strong>{stats.error}</strong></span>
                  <span>·</span>
                  <span className="text-slate-400">Pendente: <strong>{stats.pending}</strong></span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 shrink-0 w-full md:w-auto justify-end">
                {/* Auto Process Toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none border border-white/[0.06] rounded-xl px-3 py-2 bg-slate-950/40 text-[11px] text-slate-400 hover:text-slate-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={autoProcess}
                    onChange={toggleAutoProcess}
                    className="rounded border-slate-700 bg-slate-800 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 focus:ring-0"
                  />
                  <span>Processar ao soltar</span>
                </label>

                <button
                  onClick={clearQueue}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.08] hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 text-slate-400 font-bold text-xs transition-all disabled:opacity-30"
                >
                  <Trash2 size={13} />
                  Limpar
                </button>

                <button
                  onClick={processAll}
                  disabled={processing || stats.pending + stats.error === 0}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-black text-xs transition-all shadow-lg shadow-violet-900/30"
                >
                  {processing ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Processando Fila...
                    </>
                  ) : (
                    <>
                      <Play size={13} />
                      PROCESSAR FILA
                    </>
                  )}
                </button>
              </div>

            </div>

            {/* Queue Table */}
            <div className="bg-slate-900/30 border border-white/[0.05] rounded-2xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.05] bg-slate-900/80 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                      <th className="px-4 py-3 w-16">Foto</th>
                      <th className="px-4 py-3">Arquivo / Dimensões</th>
                      <th className="px-4 py-3 w-48">SKU Vinculado</th>
                      <th className="px-4 py-3">Produto no Bling</th>
                      <th className="px-4 py-3 w-36 text-center">Status</th>
                      <th className="px-4 py-3 w-28 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {queue.map(item => {
                      const isItemProcessing = ['searching', 'uploading', 'saving'].includes(item.status);
                      return (
                        <tr key={item.id} className="hover:bg-white/[0.01] transition-colors text-xs">
                          {/* Photo Preview Column */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {/* Original */}
                              <div className="relative w-12 h-12 rounded-lg bg-slate-950 border border-white/[0.05] overflow-hidden shrink-0 group" title="Original">
                                <img src={item.originalUrl} alt="" className="w-full h-full object-cover" />
                              </div>
                              <ArrowRight size={10} className="text-slate-600 shrink-0" />
                              {/* Processed */}
                              <div className="relative w-12 h-12 rounded-lg bg-white border border-white/[0.08] overflow-hidden shrink-0" title="Prévia Standard">
                                {item.previewUrl ? (
                                  <img src={item.previewUrl} alt="" className="w-full h-full object-contain" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-slate-900">
                                    <Loader2 size={12} className="animate-spin text-slate-700" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* File info */}
                          <td className="px-4 py-3 max-w-[200px]">
                            <p className="font-mono text-slate-300 truncate font-semibold" title={item.filename}>{item.filename}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                              {item.width ? `${item.width}x${item.height}px` : 'Calculando...'}
                            </p>
                          </td>

                          {/* SKU Binding input */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={item.parsedSku}
                                onChange={(e) => handleSkuChange(item.id, e.target.value)}
                                disabled={isItemProcessing || item.status === 'success'}
                                placeholder="DIGITE O SKU..."
                                className="w-full bg-slate-950 border border-white/[0.07] rounded-lg px-2.5 py-1.5 text-xs text-violet-300 font-mono focus:border-violet-500/50 outline-none uppercase font-semibold disabled:opacity-50 transition-colors"
                              />
                              {!item.blingProduct && item.status !== 'success' && (
                                <button
                                  onClick={() => searchProductInBling(item.id)}
                                  disabled={isItemProcessing || !item.parsedSku}
                                  title="Validar SKU no Bling"
                                  className="p-1.5 rounded-lg bg-slate-800 border border-white/[0.05] hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors shrink-0"
                                >
                                  <Search size={12} />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Bling Product details */}
                          <td className="px-4 py-3 max-w-[280px]">
                            {item.blingProduct ? (
                              <div className="space-y-0.5">
                                <p className="font-bold text-slate-200 line-clamp-1 leading-tight">{item.blingProduct.nome}</p>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                                  {item.blingProduct.marca && <span>{item.blingProduct.marca}</span>}
                                  <span>·</span>
                                  <span className="font-mono text-emerald-400">{brl(parseFloat(item.blingProduct.preco))}</span>
                                  <span>·</span>
                                  <span>{item.blingProduct.imagens?.length || 0} foto(s)</span>
                                </div>
                              </div>
                            ) : item.status === 'searching' ? (
                              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                <Loader2 size={11} className="animate-spin text-violet-400" />
                                Buscando cadastro...
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-600 italic">Não validado</span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="px-4 py-3 text-center">
                            {item.status === 'pending' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                Na fila
                              </span>
                            )}
                            {item.status === 'searching' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                <Loader2 size={8} className="animate-spin" />
                                Buscando
                              </span>
                            )}
                            {item.status === 'uploading' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse">
                                <Loader2 size={8} className="animate-spin" />
                                Enviando foto
                              </span>
                            )}
                            {item.status === 'saving' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 animate-pulse">
                                <Loader2 size={8} className="animate-spin" />
                                Gravando Bling
                              </span>
                            )}
                            {item.status === 'success' && (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm shadow-emerald-950/20">
                                <Check size={10} />
                                Vinculado
                              </span>
                            )}
                            {item.status === 'error' && (
                              <div className="flex flex-col items-center gap-0.5" title={item.errorMsg}>
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                  <AlertCircle size={9} />
                                  Erro
                                </span>
                                <span className="text-[9px] text-red-500 max-w-[120px] truncate">{item.errorMsg}</span>
                              </div>
                            )}
                          </td>

                          {/* Individual Actions */}
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {item.status !== 'success' && (
                                <button
                                  onClick={() => triggerProcessItem(item.id)}
                                  disabled={isItemProcessing || !item.blob || !item.parsedSku}
                                  title="Processar este item"
                                  className="p-1.5 rounded-lg bg-violet-600/10 hover:bg-violet-600/20 text-violet-400 border border-violet-500/10 hover:border-violet-500/25 disabled:opacity-40 transition-all shrink-0"
                                >
                                  <Play size={12} />
                                </button>
                              )}
                              <button
                                onClick={() => removeItem(item.id)}
                                disabled={isItemProcessing}
                                title="Remover da fila"
                                className="p-1.5 rounded-lg bg-slate-800/40 hover:bg-red-500/10 hover:text-red-400 border border-white/[0.04] hover:border-red-500/20 disabled:opacity-40 transition-colors shrink-0 text-slate-500"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty State ── */}
        {queue.length === 0 && (
          <div className="bg-slate-900/20 border border-white/[0.04] rounded-2xl p-10 text-center max-w-md mx-auto space-y-3">
            <UploadCloud size={32} className="mx-auto text-slate-700" />
            <div>
              <p className="text-slate-400 text-sm font-semibold">Nenhuma foto na fila de lote</p>
              <p className="text-slate-600 text-xs leading-relaxed mt-1">
                Utilize a área de upload acima para arrastar ou selecionar imagens. O processamento padronizará todas as fotos para o formato correto.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
