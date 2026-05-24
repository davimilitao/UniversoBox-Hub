/**
 * @file AutomacaoCadastro.jsx — Catálogo Studio
 * @description Busca produto por SKU ou EAN no Bling, edita todos os campos
 *              e salva de volta — sync bidirecional com o Bling.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Loader2, Save, CheckCircle, AlertCircle,
  ArrowLeft, Package, Tag, Hash, Truck, Image as ImageIcon,
  RefreshCw, ExternalLink, Plus, Sparkles, BarChart2,
  Upload, X,
} from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';

import { ImageEditor } from '../../components/ImageEditor';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function brl(v) { return BRL.format(v || 0); }

function estimateFrete(pesoBrutoKg) {
  const w = parseFloat(pesoBrutoKg) || 0;
  if (w <= 0.5) return 19.90;
  if (w <= 1.0) return 21.90;
  if (w <= 2.0) return 23.90;
  if (w <= 5.0) return 28.90;
  if (w <= 9.0) return 34.90;
  if (w <= 13.0) return 44.90;
  if (w <= 17.0) return 54.90;
  if (w <= 30.0) return 69.90;
  return 99.90;
}

// WYSIWYG Editor de Descrição Completa para compatibilidade com Bling
function EditorDescricao({ value, onChange }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const execCommand = (command, argument = null) => {
    document.execCommand(command, false, argument);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  return (
    <div className="flex flex-col gap-1 border border-white/5 bg-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-1.5 bg-slate-900 border-b border-white/5 p-2 flex-wrap">
        <button type="button" onClick={() => execCommand('bold')} className="px-2 py-1 rounded text-xs font-bold bg-white/[0.03] hover:bg-white/10 text-slate-200 transition-colors">B</button>
        <button type="button" onClick={() => execCommand('italic')} className="px-2 py-1 rounded text-xs italic bg-white/[0.03] hover:bg-white/10 text-slate-200 transition-colors">I</button>
        <button type="button" onClick={() => execCommand('underline')} className="px-2 py-1 rounded text-xs underline bg-white/[0.03] hover:bg-white/10 text-slate-200 transition-colors">U</button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button type="button" onClick={() => execCommand('insertUnorderedList')} className="px-2 py-1 rounded text-xs bg-white/[0.03] hover:bg-white/10 text-slate-200 transition-colors">Lista</button>
        <button type="button" onClick={() => execCommand('insertOrderedList')} className="px-2 py-1 rounded text-xs bg-white/[0.03] hover:bg-white/10 text-slate-200 transition-colors">Lista Num.</button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button type="button" onClick={() => execCommand('removeFormat')} className="px-2 py-1 rounded text-[10px] bg-white/[0.03] hover:bg-red-500/10 hover:text-red-400 text-slate-400 transition-colors" title="Limpar Formatação">Limpar</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="w-full bg-slate-800 px-4 py-3 text-white outline-none min-h-[160px] max-h-[300px] overflow-y-auto text-sm leading-relaxed"
        style={{ colorScheme: 'dark' }}
      />
    </div>
  );
}

// Auxiliar para padronizar fotos via Canvas a 1200x1200px com fundo branco
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

        // Fundo branco
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, SIZE, SIZE);

        const pad = SIZE * 0.05; // 5% de margem
        const maxSide = SIZE - pad * 2;
        const scale = Math.min(maxSide / img.naturalWidth, maxSide / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;

        // Desenhar centralizado
        ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);

        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Falha no Canvas'));
          resolve(blob);
        }, 'image/jpeg', 0.92);
      };
      img.onerror = () => reject(new Error('Erro ao ler imagem'));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error('Erro no arquivo'));
    reader.readAsDataURL(file);
  });
}


// ── Campo de texto genérico ───────────────────────────────────────────────────
function Campo({ label, value, onChange, mono, placeholder, area, hint }) {
  const cls = 'w-full bg-slate-800 border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/60 transition-colors ' + (mono ? 'font-mono text-emerald-400' : '');
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</label>
      {area
        ? <textarea rows={5} className={cls + ' resize-none'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        : <input className={cls} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      }
      {hint && <p className="text-[10px] text-slate-600 ml-1">{hint}</p>}
    </div>
  );
}

// ── Badge de situação ─────────────────────────────────────────────────────────
function SituacaoBadge({ sit }) {
  const ok = sit === 'A';
  return (
    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${ok ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-700 text-slate-500 border-slate-600'}`}>
      {ok ? 'Ativo' : 'Inativo'}
    </span>
  );
}

// ── Tela de busca ─────────────────────────────────────────────────────────────
function TelaBusca({ onBuscar, carregando, erro }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  function submit() { if (q.trim()) onBuscar(q.trim()); }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <Package size={28} className="text-emerald-400" />
        </div>
        <h1 className="text-white text-2xl font-black tracking-tight">Catálogo Studio</h1>
        <p className="text-slate-500 text-sm mt-1">Busque por SKU ou EAN para editar o produto</p>
      </div>

      <div className="flex gap-2 w-full max-w-lg bg-slate-900 p-2 rounded-2xl border border-slate-700 focus-within:border-emerald-500/50 transition-colors">
        <Search size={18} className="text-slate-500 self-center ml-2 shrink-0" />
        <input
          ref={ref}
          className="flex-1 bg-transparent px-2 py-3 text-white outline-none text-base font-semibold placeholder:font-normal placeholder:text-slate-600"
          placeholder="SKU ou código de barras EAN..."
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <button
          onClick={submit}
          disabled={carregando || !q.trim()}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 px-6 rounded-xl font-black text-sm transition-colors flex items-center gap-2"
        >
          {carregando ? <Loader2 size={16} className="animate-spin" /> : 'BUSCAR'}
        </button>
      </div>

      {erro && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 max-w-lg w-full">
          <AlertCircle size={16} className="shrink-0" /> {erro}
        </div>
      )}

      <p className="text-slate-600 text-xs">
        Produto não encontrado? <button className="text-emerald-500 hover:underline" onClick={() => onBuscar('__novo__')}>Cadastrar novo produto</button>
      </p>
    </div>
  );
}

// ── Componente de Upload de PDF para Autopreenchimento ──
function UploaderIA({ onFill, showToast }) {
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      showToast('Por favor, selecione um arquivo PDF.', 'err');
      return;
    }
    setFileName(file.name);
    setLoading(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = reader.result;
        try {
          const res = await fetch('/api/catalogo/ler-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdf: base64 }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Falha ao processar manual');
          onFill(data);
          showToast('Campos preenchidos por IA com sucesso! ✓');
        } catch (err) {
          showToast('Erro ao ler PDF: ' + err.message, 'err');
        } finally {
          setLoading(false);
        }
      };
    } catch (err) {
      showToast('Erro ao ler arquivo local.', 'err');
      setLoading(false);
    }
  };

  return (
    <section className="bg-slate-900 border border-violet-500/20 bg-gradient-to-r from-slate-900 via-violet-950/10 to-slate-900 rounded-2xl p-5 space-y-3">
      <h2 className="text-[11px] text-violet-400 font-bold uppercase tracking-widest flex items-center gap-2">
        <Sparkles size={12} className="text-violet-400 animate-pulse" /> Auto-Preenchimento por IA (Manual PDF Dorel)
      </h2>
      <p className="text-xs text-slate-500 font-medium">Faça o upload do manual em PDF para extrair automaticamente nome, SKU, EAN, dimensões, pesos e descrição técnica.</p>
      
      <div className="flex items-center gap-3">
        <label className="cursor-pointer bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-violet-900/30">
          <input type="file" accept=".pdf" onChange={handleFileChange} disabled={loading} className="hidden" />
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {loading ? 'Processando PDF com Gemini...' : 'Selecionar Manual PDF'}
        </label>
        {fileName && (
          <span className="text-[10px] text-slate-500 truncate max-w-xs font-mono">{fileName}</span>
        )}
      </div>
    </section>
  );
}

// ── Componente Precificadora Inteligente de Canais ──
function Precificadora({ precoVenda, setPrecoVenda, custo, setCusto, simplesNacional, setSimplesNacional, pesoBruto, onApplyPrice }) {
  const pVenda = parseFloat(precoVenda) || 0;
  const pCusto = parseFloat(custo) || 0;
  const impPct = parseFloat(simplesNacional) || 0;
  
  const freteEstimado = useMemo(() => {
    return estimateFrete(pesoBruto);
  }, [pesoBruto]);

  const mlClassico = useMemo(() => {
    const taxaPct = 0.12;
    const taxaFixa = pVenda < 79 ? 6.50 : 0;
    const frete = pVenda >= 79 ? freteEstimado : 0;
    const imposto = pVenda * (impPct / 100);
    const comissao = pVenda * taxaPct + taxaFixa;
    const liquido = pVenda - pCusto - imposto - comissao - frete;
    const margem = pVenda > 0 ? (liquido / pVenda) * 100 : 0;
    return { comissao, frete, imposto, liquido, margem };
  }, [pVenda, pCusto, impPct, freteEstimado]);

  const mlPremium = useMemo(() => {
    const taxaPct = 0.17;
    const taxaFixa = pVenda < 79 ? 6.50 : 0;
    const frete = pVenda >= 79 ? freteEstimado : 0;
    const imposto = pVenda * (impPct / 100);
    const comissao = pVenda * taxaPct + taxaFixa;
    const liquido = pVenda - pCusto - imposto - comissao - frete;
    const margem = pVenda > 0 ? (liquido / pVenda) * 100 : 0;
    return { comissao, frete, imposto, liquido, margem };
  }, [pVenda, pCusto, impPct, freteEstimado]);

  const shopee = useMemo(() => {
    const taxaPct = 0.20;
    const taxaFixa = 4.00;
    const frete = 0; 
    const imposto = pVenda * (impPct / 100);
    const comissao = pVenda * taxaPct + taxaFixa;
    const liquido = pVenda - pCusto - imposto - comissao - frete;
    const margem = pVenda > 0 ? (liquido / pVenda) * 100 : 0;
    return { comissao, frete, imposto, liquido, margem };
  }, [pVenda, pCusto, impPct]);

  return (
    <section className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
      <h2 className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
        <BarChart2 size={12} className="text-slate-500" /> Precificadora de Canais
      </h2>
      
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Custo Prod (R$)</label>
          <input
            type="number"
            step="0.01"
            value={custo}
            onChange={e => setCusto(e.target.value)}
            placeholder="0.00"
            className="w-full bg-slate-800 border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/60 font-mono text-emerald-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Simples (%)</label>
          <input
            type="number"
            step="0.1"
            value={simplesNacional}
            onChange={e => setSimplesNacional(e.target.value)}
            placeholder="6.0"
            className="w-full bg-slate-800 border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/60 font-mono text-emerald-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Preço Simulado (R$)</label>
          <input
            type="number"
            step="0.01"
            value={precoVenda}
            onChange={e => setPrecoVenda(e.target.value)}
            placeholder="0.00"
            className="w-full bg-slate-800 border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/60 font-mono text-emerald-400 font-bold"
          />
        </div>
      </div>

      <div className="text-[10px] text-slate-500 flex justify-between bg-slate-800/40 px-3 py-2 rounded-lg border border-white/[0.03]">
        <span>Peso Bruto: <strong>{pesoBruto || 0} kg</strong></span>
        <span>Frete Estimado (ML): <strong>{brl(freteEstimado)}</strong></span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* ML Classico */}
        <div className="bg-slate-950/60 rounded-xl p-3 border border-white/[0.04] flex flex-col justify-between min-h-[140px]">
          <div>
            <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">ML Clássico</p>
            <div className="space-y-1 mt-2 text-[9px] text-slate-500">
              <div className="flex justify-between"><span>Imposto:</span><span>{brl(mlClassico.imposto)}</span></div>
              <div className="flex justify-between"><span>Comissão:</span><span>{brl(mlClassico.comissao)}</span></div>
              <div className="flex justify-between"><span>Frete:</span><span>{brl(mlClassico.frete)}</span></div>
            </div>
          </div>
          <div className="border-t border-white/[0.05] pt-1.5 mt-2">
            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-slate-600">Lucro:</span>
              <span className={`text-[11px] font-black ${mlClassico.liquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {brl(mlClassico.liquido)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-slate-600">Margem:</span>
              <span className={`text-[9px] font-bold ${mlClassico.margem >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {mlClassico.margem.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* ML Premium */}
        <div className="bg-slate-950/60 rounded-xl p-3 border border-white/[0.04] flex flex-col justify-between min-h-[140px]">
          <div>
            <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">ML Premium</p>
            <div className="space-y-1 mt-2 text-[9px] text-slate-500">
              <div className="flex justify-between"><span>Imposto:</span><span>{brl(mlPremium.imposto)}</span></div>
              <div className="flex justify-between"><span>Comissão:</span><span>{brl(mlPremium.comissao)}</span></div>
              <div className="flex justify-between"><span>Frete:</span><span>{brl(mlPremium.frete)}</span></div>
            </div>
          </div>
          <div className="border-t border-white/[0.05] pt-1.5 mt-2">
            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-slate-600">Lucro:</span>
              <span className={`text-[11px] font-black ${mlPremium.liquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {brl(mlPremium.liquido)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-slate-600">Margem:</span>
              <span className={`text-[9px] font-bold ${mlPremium.margem >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {mlPremium.margem.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Shopee */}
        <div className="bg-slate-950/60 rounded-xl p-3 border border-white/[0.04] flex flex-col justify-between min-h-[140px]">
          <div>
            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">Shopee</p>
            <div className="space-y-1 mt-2 text-[9px] text-slate-500">
              <div className="flex justify-between"><span>Imposto:</span><span>{brl(shopee.imposto)}</span></div>
              <div className="flex justify-between"><span>Comissão:</span><span>{brl(shopee.comissao)}</span></div>
              <div className="flex justify-between"><span>Frete:</span><span>—</span></div>
            </div>
          </div>
          <div className="border-t border-white/[0.05] pt-1.5 mt-2">
            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-slate-600">Lucro:</span>
              <span className={`text-[11px] font-black ${shopee.liquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {brl(shopee.liquido)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-slate-600">Margem:</span>
              <span className={`text-[9px] font-bold ${shopee.margem >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {shopee.margem.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={() => onApplyPrice(precoVenda)}
          disabled={pVenda <= 0}
          className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
        >
          Aplicar Preço Simulado ao Produto
        </button>
      </div>
    </section>
  );
}

// ── Studio principal ──────────────────────────────────────────────────────────
function Studio({ produto, setProduto, categorias, onSalvar, salvando, salvoOk, onVoltar, isNovo, precoSimulado, setPrecoSimulado, custoSimulado, setCustoSimulado, simplesNacional, setSimplesNacional, onFill, showToast }) {
  const p = produto;
  const set = (campo) => (val) => setProduto(prev => ({ ...prev, [campo]: val }));
  const [uploadingImages, setUploadingImages] = useState(false);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    if (!p.codigo) {
      showToast('Por favor, defina o SKU antes de enviar imagens.', 'err');
      return;
    }

    setUploadingImages(true);
    try {
      const token = await getAuthToken();
      const updatedImgs = [...(p.imagens || [])];

      for (const file of files) {
        // 1. Process local image via Canvas
        const processedBlob = await processImageToCanvas(file);

        // 2. Upload processed blob to Cloudinary
        const fd = new FormData();
        fd.append('file', processedBlob, `${p.codigo}_standard.jpg`);
        fd.append('kind', 'stock');

        const uploadRes = await fetch(`/admin/save-photo-cloudinary/${encodeURIComponent(p.codigo)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.ok) {
          throw new Error(uploadData.error || 'Erro no upload de uma das imagens.');
        }

        updatedImgs.push(uploadData.url);
      }

      setProduto(prev => ({ ...prev, imagens: updatedImgs }));
      showToast('Fotos adicionadas e tratadas com sucesso! ✓');
    } catch (err) {
      showToast('Erro no upload das fotos: ' + err.message, 'err');
    } finally {
      setUploadingImages(false);
    }
  };

  const [editorImg, setEditorImg] = useState(null); // { url, idx }
  const navigate = useNavigate();
  const setCategoria = (id) => {
    const cat = categorias.find(c => String(c.id) === String(id));
    setProduto(prev => ({ ...prev, categoria: cat ? { id: cat.id, nome: cat.nome } : null }));
  };



  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onVoltar} className="p-2 rounded-lg bg-slate-800 border border-white/10 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-white font-black text-lg leading-tight">
              {p.nome || 'Novo Produto'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              {p.codigo && <span className="text-xs font-mono text-slate-500">{p.codigo}</span>}
              {p.gtin && <span className="text-xs text-slate-600">· EAN {p.gtin}</span>}
              <SituacaoBadge sit={p.situacao} />
              {!isNovo && (
                <a href={`https://www.bling.com.br/produtos.php#edit/${p.id}`} target="_blank" rel="noreferrer"
                  className="text-[10px] text-slate-600 hover:text-slate-400 flex items-center gap-0.5">
                  <ExternalLink size={10} /> Bling
                </a>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onSalvar}
          disabled={salvando}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all
            bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 shadow-lg shadow-emerald-500/20"
        >
          {salvando
            ? <><Loader2 size={15} className="animate-spin" /> Salvando…</>
            : salvoOk
            ? <><CheckCircle size={15} /> Salvo!</>
            : <><Save size={15} /> {isNovo ? 'Criar no Bling' : 'Salvar no Bling'}</>
          }
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-4">

          <UploaderIA onFill={onFill} showToast={showToast} />

          {/* Identificação */}
          <section className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
              <Tag size={12} /> Identificação
            </h2>
            <Campo label="Título / Nome do Produto" value={p.nome} onChange={set('nome')} placeholder="Nome completo do produto" />
            <div className="grid grid-cols-2 gap-4">
              <Campo label="SKU / Código" value={p.codigo} onChange={set('codigo')} mono placeholder="EX: BUBA-PRATO-VD" />
              <Campo label="EAN / GTIN (Unitário)" value={p.gtin} onChange={set('gtin')} mono placeholder="Código de barras unitário" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Campo label="Marca" value={p.marca} onChange={set('marca')} placeholder="Ex: Buba" />
              <Campo label="NCM" value={p.ncm} onChange={set('ncm')} mono placeholder="00000000" />
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Situação</label>
                <select
                  className="w-full bg-slate-800 border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/60"
                  value={p.situacao}
                  onChange={e => set('situacao')(e.target.value)}
                >
                  <option value="A">Ativo</option>
                  <option value="I">Inativo</option>
                </select>
              </div>
            </div>
          </section>

          {/* Preço e Categoria */}
          <section className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
              <Hash size={12} /> Preço e Categoria
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Preço de venda (R$)" value={p.preco} onChange={set('preco')} placeholder="0.00" hint="Formato: 29.90" />
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Categoria Bling</label>
                <select
                  className="w-full bg-slate-800 border border-white/5 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/60"
                  value={p.categoria?.id || ''}
                  onChange={e => setCategoria(e.target.value)}
                >
                  <option value="">Sem categoria</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                {p.categoria?.nome && (
                  <p className="text-[10px] text-slate-600 ml-1">{p.categoria.nome}</p>
                )}
              </div>
            </div>
          </section>

          <Precificadora
            precoVenda={precoSimulado}
            setPrecoVenda={setPrecoSimulado}
            custo={custoSimulado}
            setCusto={setCustoSimulado}
            simplesNacional={simplesNacional}
            setSimplesNacional={setSimplesNacional}
            pesoBruto={p.pesoBruto}
            onApplyPrice={val => {
              set('preco')(val);
              setPrecoSimulado(val);
            }}
          />

          {/* Descrição */}
          <section className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
              <Package size={12} /> Descrição
            </h2>
            <Campo
              label="Descrição curta (Bling)"
              value={p.descricaoCurta}
              onChange={set('descricaoCurta')}
              placeholder="Texto resumido para listagens e marketplaces..."
              hint="Campo descricaoCurta do Bling — aparece em cards de produto"
            />
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Descrição completa (HTML/Formatada)</label>
              <EditorDescricao value={p.descricao || ''} onChange={set('descricao')} />
            </div>
          </section>

          {/* Logística */}
          <section className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
              <Truck size={12} /> Logística
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Peso Líquido (kg)" value={p.pesoLiq} onChange={set('pesoLiq')} placeholder="0.000" />
              <Campo label="Peso Bruto (kg)" value={p.pesoBruto} onChange={set('pesoBruto')} placeholder="0.000" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Campo label="Largura (cm)" value={p.largura} onChange={set('largura')} placeholder="0" />
              <Campo label="Altura (cm)" value={p.altura} onChange={set('altura')} placeholder="0" />
              <Campo label="Profundidade (cm)" value={p.profundidade} onChange={set('profundidade')} placeholder="0" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Itens por Caixa Master" value={p.itensPorCaixa} onChange={set('itensPorCaixa')} placeholder="1" />
              <Campo label="EAN Caixa Master" value={p.gtinEmbalagem} onChange={set('gtinEmbalagem')} placeholder="Código de barras da caixa master" />
            </div>
          </section>
        </div>

        {/* ── Coluna lateral — Fotos ── */}
        <div className="space-y-4">
          <section className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                <ImageIcon size={12} /> Fotos
              </h2>
              {p.codigo && (
                <button
                  onClick={() => navigate(`/catalogo/fotos?sku=${encodeURIComponent(p.codigo)}`)}
                  className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors font-semibold"
                  title="Abrir no Image Studio"
                >
                  <Sparkles size={10} /> Editar no Studio
                </button>
              )}
            </div>

            {/* Preview da primeira foto + botão editar */}
            <div className="relative bg-slate-800 rounded-xl aspect-square flex items-center justify-center overflow-hidden group">
              {p.imagens?.[0]
                ? <>
                    <img src={p.imagens[0]} alt="Foto principal" className="w-full h-full object-contain" />
                    <button
                      onClick={() => setEditorImg({ url: p.imagens[0], idx: 0 })}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity gap-1.5 text-white text-xs font-bold"
                    >
                      <Sparkles size={14} /> Editar
                    </button>
                  </>
                : <div className="text-slate-600 text-sm text-center px-4">
                    <ImageIcon size={32} className="mx-auto mb-2 opacity-30" />
                    Sem imagem
                  </div>
              }
            </div>

            {/* Lista de URLs de imagens */}
            <div className="space-y-2">
              {(p.imagens || []).map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="flex-1 bg-slate-800 border border-white/5 rounded-lg px-3 py-2 text-xs text-slate-400 font-mono outline-none focus:border-emerald-500/40"
                    value={url}
                    onChange={e => {
                      const arr = [...(p.imagens || [])];
                      arr[i] = e.target.value;
                      setProduto(prev => ({ ...prev, imagens: arr }));
                    }}
                    placeholder="https://..."
                  />
                  {url && (
                    <button
                      onClick={() => setEditorImg({ url, idx: i })}
                      title="Editar imagem"
                      className="text-slate-600 hover:text-blue-400 transition-colors shrink-0"
                    ><Sparkles size={14} /></button>
                  )}
                  <button
                    onClick={() => setProduto(prev => ({ ...prev, imagens: prev.imagens.filter((_, j) => j !== i) }))}
                    className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                  >✕</button>
                </div>
              ))}
              {/* Canvas Drag & Drop Image Uploader */}
              <div className="border border-dashed border-white/10 hover:border-emerald-500/40 rounded-xl p-4 text-center bg-slate-950/40 hover:bg-slate-950/60 transition-all cursor-pointer relative group">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploadingImages}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                {uploadingImages ? (
                  <div className="flex flex-col items-center gap-1.5 py-1">
                    <Loader2 size={18} className="animate-spin text-emerald-400" />
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Tratando imagens...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <Upload size={18} className="text-slate-500 group-hover:text-emerald-400 transition-colors" />
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider group-hover:text-emerald-300 transition-colors">Enviar Fotos Locals</span>
                    <span className="text-[9px] text-slate-600">Canvas 1200x1200px + Fundo Branco</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setProduto(prev => ({ ...prev, imagens: [...(prev.imagens || []), ''] }))}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/10 text-slate-600 hover:text-slate-400 hover:border-white/20 text-xs transition-colors"
              >
                <Plus size={12} /> Adicionar URL de imagem
              </button>
            </div>

            {/* ImageEditor modal */}
            {editorImg && (
              <ImageEditor
                url={editorImg.url}
                sku={p.codigo || 'produto'}
                kind="stock"
                onSaved={(newUrl) => {
                  const arr = [...(p.imagens || [])];
                  arr[editorImg.idx] = newUrl;
                  setProduto(prev => ({ ...prev, imagens: arr }));
                }}
                onClose={() => setEditorImg(null)}
              />
            )}
          </section>

          {/* Resumo rápido */}
          {!isNovo && (
            <section className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-3">
              <h2 className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">Dados Bling</h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>ID Bling</span>
                  <span className="font-mono text-slate-400">{p.id}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tipo</span>
                  <span className="text-slate-400">{{ P: 'Produto', S: 'Serviço', E: 'Embalagem' }[p.tipo] || p.tipo}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Origem</span>
                  <span className="text-slate-400">{{ 0: 'Nacional', 1: 'Estrangeira' }[p.origem] || p.origem}</span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AutomacaoCadastro() {
  const [busca,      setBusca]      = useState('');
  const [status,     setStatus]     = useState('idle'); // idle | buscando | studio | salvando
  const [produto,    setProduto]    = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [erro,       setErro]       = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [salvoOk,    setSalvoOk]    = useState(false);
  const [searchParams]              = useSearchParams();
  const isNovo = produto && !produto.id;
  const [originalProduto, setOriginalProduto] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Calcula diferenças entre o produto editado e o original do Bling
  const diffs = useMemo(() => {
    if (!originalProduto || !produto) return [];
    const fields = [
      { key: 'nome', label: 'Nome' },
      { key: 'codigo', label: 'SKU/Código' },
      { key: 'gtin', label: 'EAN/GTIN' },
      { key: 'gtinEmbalagem', label: 'EAN Caixa Master' },
      { key: 'itensPorCaixa', label: 'Itens por Caixa' },
      { key: 'preco', label: 'Preço', format: v => BRL.format(parseFloat(v) || 0) },
      { key: 'marca', label: 'Marca' },
      { key: 'ncm', label: 'NCM' },
      { key: 'situacao', label: 'Situação', format: v => v === 'A' ? 'Ativo' : 'Inativo' },
      { key: 'pesoLiq', label: 'Peso Líquido', format: v => `${v} kg` },
      { key: 'pesoBruto', label: 'Peso Bruto', format: v => `${v} kg` },
      { key: 'altura', label: 'Altura', format: v => `${v} cm` },
      { key: 'largura', label: 'Largura', format: v => `${v} cm` },
      { key: 'profundidade', label: 'Profundidade', format: v => `${v} cm` },
      { key: 'categoria', label: 'Categoria', format: v => v?.nome || 'Nenhuma' },
    ];

    const list = [];
    fields.forEach(f => {
      let orig = originalProduto[f.key];
      let curr = produto[f.key];
      
      let diff = false;
      if (f.key === 'categoria') {
        diff = (orig?.id !== curr?.id);
      } else {
        diff = (String(orig ?? '') !== String(curr ?? ''));
      }

      if (diff) {
        list.push({
          label: f.label,
          orig: f.format ? f.format(orig) : (orig || '—'),
          curr: f.format ? f.format(curr) : (curr || '—'),
        });
      }
    });

    const origImgs = originalProduto.imagens || [];
    const currImgs = produto.imagens || [];
    if (JSON.stringify(origImgs) !== JSON.stringify(currImgs)) {
      list.push({
        label: 'Imagens',
        orig: `${origImgs.length} imagem(ns)`,
        curr: `${currImgs.length} imagem(ns)`,
      });
    }

    const origDesc = (originalProduto.descricao || '').trim();
    const currDesc = (produto.descricao || '').trim();
    if (origDesc !== currDesc) {
      list.push({
        label: 'Descrição',
        orig: origDesc ? 'Alterada' : 'Vazia',
        curr: currDesc ? 'Alterada' : 'Vazia',
      });
    }

    return list;
  }, [originalProduto, produto]);

  function triggerConfirm() {
    if (!produto.nome || !produto.codigo) {
      setErro('Nome e SKU são obrigatórios'); return;
    }
    setShowConfirm(true);
  }

  const [precoSimulado, setPrecoSimulado] = useState('0.00');
  const [custoSimulado, setCustoSimulado] = useState('0.00');
  const [simplesNacional, setSimplesNacional] = useState('6.0');

  // Carrega categorias uma vez
  useEffect(() => {
    fetch('/api/catalogo/categorias')
      .then(r => r.json())
      .then(d => setCategorias(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Auto-busca quando abre com ?sku= ou ?ean= na URL
  useEffect(() => {
    const sku = searchParams.get('sku') || searchParams.get('ean');
    if (sku) handleBuscar(sku);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg, type = 'ok') {
    if (type === 'err') {
      setErro(msg);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  }

  function handleFill(data) {
    setProduto(prev => ({
      ...prev,
      ...data,
      imagens: prev.imagens || []
    }));
    if (data.preco) setPrecoSimulado(data.preco);
  }

  async function handleBuscar(q) {
    if (q === '__novo__') {
      const template = { nome: '', codigo: '', gtin: '', preco: '0.00', marca: '', ncm: '',
        descricaoCurta: '', descricao: '', situacao: 'A', origem: 0, pesoLiq: '0.000', pesoBruto: '0.000',
        altura: '0', largura: '0', profundidade: '0', categoria: null, imagens: [] };
      setProduto(template);
      setOriginalProduto(template);
      setPrecoSimulado('0.00');
      setCustoSimulado('0.00');
      setStatus('studio');
      return;
    }
    setBusca(q);
    setStatus('buscando');
    setErro('');
    try {
      const res = await fetch(`/api/catalogo/buscar?q=${encodeURIComponent(q)}`);
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error || 'Produto não encontrado');
      setProduto(d);
      setOriginalProduto(d);
      setPrecoSimulado(d.preco || '0.00');
      setStatus('studio');
    } catch (e) {
      setErro(e.message);
      setStatus('idle');
    }
  }

  async function handleSalvar() {
    if (!produto.nome || !produto.codigo) {
      setErro('Nome e SKU são obrigatórios'); return;
    }
    setStatus('salvando');
    setErro('');
    try {
      const url    = isNovo ? '/api/catalogo/criar-produto' : `/api/catalogo/produto/${produto.id}`;
      const method = isNovo ? 'POST' : 'PUT';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(produto),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Falha ao salvar');
      if (isNovo && d.id) {
        setProduto(prev => ({ ...prev, id: d.id }));
        setOriginalProduto({ ...produto, id: d.id });
      } else {
        setOriginalProduto(produto);
      }
      setSalvoOk(true);
      showToast('Produto salvo no Bling com sucesso! ✓');
      setTimeout(() => setSalvoOk(false), 3000);
    } catch (e) {
      setErro(e.message);
    } finally {
      setStatus('studio');
    }
  }

  function handleVoltar() {
    setProduto(null);
    setStatus('idle');
    setErro('');
    setSalvoOk(false);
  }

  if (status === 'idle' || status === 'buscando') {
    return (
      <div className="h-full overflow-y-auto">
        <TelaBusca onBuscar={handleBuscar} carregando={status === 'buscando'} erro={erro} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {erro && (
        <div className="mx-4 mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="shrink-0" /> {erro}
          <button onClick={() => setErro('')} className="ml-auto text-red-600 hover:text-red-400">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="mx-4 mt-4 flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 animate-fade-in">
          <CheckCircle size={15} className="shrink-0" /> {successMsg}
          <button onClick={() => setSuccessMsg('')} className="ml-auto text-emerald-600 hover:text-emerald-400">✕</button>
        </div>
      )}
      <Studio
        produto={produto}
        setProduto={setProduto}
        categorias={categorias}
        onSalvar={triggerConfirm}
        salvando={status === 'salvando'}
        salvoOk={salvoOk}
        onVoltar={handleVoltar}
        isNovo={isNovo}
        precoSimulado={precoSimulado}
        setPrecoSimulado={setPrecoSimulado}
        custoSimulado={custoSimulado}
        setCustoSimulado={setCustoSimulado}
        simplesNacional={simplesNacional}
        setSimplesNacional={setSimplesNacional}
        onFill={handleFill}
        showToast={showToast}
      />

      {/* Modal de Confirmação de Sincronização */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-scale-up">
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/5 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw size={14} className="text-emerald-400 animate-spin-slow" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Confirmar Sincronização</span>
              </div>
              <button onClick={() => setShowConfirm(false)} className="text-slate-500 hover:text-slate-300">
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-slate-400">
                Revise as informações que serão gravadas no **Bling ERP** para o SKU <strong className="text-white font-mono">{produto.codigo}</strong>:
              </p>

              {isNovo ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Novo Produto a ser criado:</p>
                  <div className="bg-slate-950/60 rounded-xl p-3 border border-white/[0.04] space-y-2 text-xs">
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500">Nome:</span>
                      <span className="text-white font-semibold">{produto.nome}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500">SKU:</span>
                      <span className="text-white font-mono">{produto.codigo}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500">Preço:</span>
                      <span className="text-emerald-400 font-bold">{brl(parseFloat(produto.preco) || 0)}</span>
                    </div>
                    {produto.gtin && (
                      <div className="flex justify-between border-b border-white/5 pb-1">
                        <span className="text-slate-500">EAN/GTIN:</span>
                        <span className="text-white font-mono">{produto.gtin}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">Imagens:</span>
                      <span className="text-white">{(produto.imagens || []).length} selecionada(s)</span>
                    </div>
                  </div>
                </div>
              ) : diffs.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Alterações detectadas:</p>
                  <div className="space-y-1.5">
                    {diffs.map((d, idx) => (
                      <div key={idx} className="bg-slate-950/40 rounded-xl p-3 border border-white/[0.04] text-xs flex justify-between items-center gap-4">
                        <span className="text-slate-500 shrink-0 font-medium">{d.label}:</span>
                        <div className="flex items-center gap-2 text-right min-w-0">
                          <span className="text-slate-600 line-through truncate max-w-[140px]">{d.orig}</span>
                          <span className="text-slate-400 font-mono shrink-0">→</span>
                          <span className="text-white font-semibold truncate max-w-[180px]">{d.curr}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-950/50 text-center text-xs text-slate-500 border border-dashed border-slate-800">
                  Nenhuma alteração detectada em relação ao cadastro atual no Bling.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-white/5 bg-slate-950 flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-xl border border-white/5 hover:bg-white/[0.05] text-xs font-semibold text-slate-400 transition-all"
              >
                Voltar e Editar
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  handleSalvar();
                }}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/10"
              >
                <CheckCircle size={12} /> Confirmar e Sincronizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
