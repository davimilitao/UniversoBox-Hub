/**
 * @file AutomacaoCadastro.jsx — Catálogo Studio
 * @description Busca produto por SKU ou EAN no Bling, edita todos os campos
 *              e salva de volta — sync bidirecional com o Bling.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Search, Loader2, Save, CheckCircle, AlertCircle,
  ArrowLeft, Package, Tag, Hash, Truck, Image,
  RefreshCw, ExternalLink, Plus,
} from 'lucide-react';

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

// ── Studio principal ──────────────────────────────────────────────────────────
function Studio({ produto, setProduto, categorias, onSalvar, salvando, salvoOk, onVoltar, isNovo }) {
  const p = produto;
  const set = (campo) => (val) => setProduto(prev => ({ ...prev, [campo]: val }));
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
              {p.codigo && <span className="text-xs font-mono text-slateald-500">{p.codigo}</span>}
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

          {/* Identificação */}
          <section className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
              <Tag size={12} /> Identificação
            </h2>
            <Campo label="Título / Nome do Produto" value={p.nome} onChange={set('nome')} placeholder="Nome completo do produto" />
            <div className="grid grid-cols-2 gap-4">
              <Campo label="SKU / Código" value={p.codigo} onChange={set('codigo')} mono placeholder="EX: BUBA-PRATO-VD" />
              <Campo label="EAN / GTIN" value={p.gtin} onChange={set('gtin')} mono placeholder="Código de barras" />
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

          {/* Descrição */}
          <section className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
            <h2 className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
              <Package size={12} /> Descrição
            </h2>
            <Campo
              label="Descrição do produto"
              value={p.descricao}
              onChange={set('descricao')}
              area
              placeholder="Descrição completa para os marketplaces..."
            />
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
          </section>
        </div>

        {/* ── Coluna lateral — Fotos ── */}
        <div className="space-y-4">
          <section className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-3">
            <h2 className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
              <Image size={12} /> Fotos
            </h2>

            {/* Preview da primeira foto */}
            <div className="bg-slate-800 rounded-xl aspect-square flex items-center justify-center overflow-hidden">
              {p.imagens?.[0]
                ? <img src={p.imagens[0]} alt="Foto principal" className="w-full h-full object-contain" />
                : <div className="text-slate-600 text-sm text-center px-4">
                    <Image size={32} className="mx-auto mb-2 opacity-30" />
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
                  <button
                    onClick={() => setProduto(prev => ({ ...prev, imagens: prev.imagens.filter((_, j) => j !== i) }))}
                    className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                  >✕</button>
                </div>
              ))}
              <button
                onClick={() => setProduto(prev => ({ ...prev, imagens: [...(prev.imagens || []), ''] }))}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/10 text-slate-600 hover:text-slate-400 hover:border-white/20 text-xs transition-colors"
              >
                <Plus size={12} /> Adicionar URL de imagem
              </button>
            </div>
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
  const [salvoOk,    setSalvoOk]    = useState(false);
  const isNovo = produto && !produto.id;

  // Carrega categorias uma vez
  useEffect(() => {
    fetch('/api/catalogo/categorias')
      .then(r => r.json())
      .then(d => setCategorias(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  async function handleBuscar(q) {
    if (q === '__novo__') {
      setProduto({ nome: '', codigo: '', gtin: '', preco: '0.00', marca: '', ncm: '',
        descricao: '', situacao: 'A', origem: 0, pesoLiq: '0.000', pesoBruto: '0.000',
        altura: '0', largura: '0', profundidade: '0', categoria: null, imagens: [] });
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
      if (isNovo && d.id) setProduto(prev => ({ ...prev, id: d.id }));
      setSalvoOk(true);
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
    return <TelaBusca onBuscar={handleBuscar} carregando={status === 'buscando'} erro={erro} />;
  }

  return (
    <>
      {erro && (
        <div className="mx-4 mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="shrink-0" /> {erro}
          <button onClick={() => setErro('')} className="ml-auto text-red-600 hover:text-red-400">✕</button>
        </div>
      )}
      <Studio
        produto={produto}
        setProduto={setProduto}
        categorias={categorias}
        onSalvar={handleSalvar}
        salvando={status === 'salvando'}
        salvoOk={salvoOk}
        onVoltar={handleVoltar}
        isNovo={isNovo}
      />
    </>
  );
}
