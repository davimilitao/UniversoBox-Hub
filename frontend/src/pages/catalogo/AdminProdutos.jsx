/**
 * @file AdminProdutos.jsx
 * @description Migração React de admin.html — gestão completa de produtos:
 *              localização, fotos (Cloudinary), notas operacionais, embalagens.
 * @version 1.0.0
 * @date 2026-04-04
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, X, Image, MapPin, StickyNote, Box, Package, Ruler,
  Weight, Barcode, Tag, DollarSign, Upload, Trash2, RefreshCw,
  CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight,
  ExternalLink, Star, Layers, Edit3, Save, Loader2,
  Camera, Plus, ShoppingBag, Info, Eye, Hash, Boxes,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function apiHeaders(extra = {}) {
  const token = localStorage.getItem('expedicao_token') || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra };
}
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('expedicao_token') || '';
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  return res.json();
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function fmtBrl(v) { return v ? BRL.format(v) : '—'; }
function fmtNum(v, unit = '') { return v ? `${v}${unit}` : '—'; }

function calcScore(p) {
  let s = 0;
  const hasImg = !!(p.displayImage || p.images?.length || p.stockPhotos?.length);
  if (hasImg)                               s += 25;
  if (p.ean)                                s += 20;
  if (p.width && p.height && p.depth)       s += 20;
  if (p.preco)                              s += 20;
  if (p.weight)                             s += 15;
  return s;
}

// ─── Score Badge ──────────────────────────────────────────────────────────────
function ScorePill({ score }) {
  const c = score >= 80 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
          : score >= 50 ? 'text-amber-400 bg-amber-500/10 border-amber-500/25'
          :               'text-red-400 bg-red-500/10 border-red-500/25';
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border tabular-nums ${c}`}>{score}%</span>;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Sk({ h = 'h-4', w = 'w-full', cls = '' }) {
  return <div className={`${h} ${w} rounded-md bg-white/[0.05] animate-pulse ${cls}`} />;
}

// ─── PhotoSlot ───────────────────────────────────────────────────────────────
function PhotoSlot({ url, label, onUpload, onDelete, uploading }) {
  const ref = useRef();
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[9px] text-slate-600 uppercase tracking-widest font-semibold">{label}</p>
      {url ? (
        <div className="relative group rounded-xl overflow-hidden bg-slate-800 aspect-square border border-white/[0.07]">
          <img src={url} alt={label} className="w-full h-full object-contain p-1" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <a href={url} target="_blank" rel="noreferrer" className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
              <Eye size={14} />
            </a>
            <button onClick={onDelete} className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="aspect-square rounded-xl border-2 border-dashed border-slate-700 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-2 text-slate-600 hover:text-emerald-400 transition-all disabled:opacity-50"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          <span className="text-[10px]">{uploading ? 'Enviando…' : 'Adicionar'}</span>
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => onUpload(e.target.files?.[0])} />
    </div>
  );
}

// ─── InfoLine ─────────────────────────────────────────────────────────────────
function InfoLine({ icon: Icon, label, value, mono = false, highlight }) {
  const valCls = [
    mono ? 'font-mono text-[11px]' : 'text-sm',
    highlight === 'warn' ? 'text-amber-400' :
    highlight === 'ok'   ? 'text-emerald-400' : 'text-slate-200',
  ].join(' ');
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-white/[0.04] last:border-0">
      <Icon size={13} className="text-slate-600 mt-0.5 shrink-0" />
      <span className="text-[11px] text-slate-500 w-24 shrink-0 mt-0.5">{label}</span>
      <span className={`flex-1 min-w-0 ${valCls}`}>{value || '—'}</span>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, badge, children, accent = 'emerald' }) {
  const colors = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    blue:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
    amber:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
    slate:   'text-slate-400 bg-slate-500/10 border-slate-500/20',
  };
  return (
    <div className="rounded-xl border border-white/[0.07] bg-slate-900/60 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06]">
        <div className={`w-6 h-6 rounded-md flex items-center justify-center border ${colors[accent]}`}>
          <Icon size={13} />
        </div>
        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{title}</span>
        {badge && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-500 border border-white/[0.05]">
            {badge}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── ProductListItem ──────────────────────────────────────────────────────────
function ProductListItem({ p, active, onClick }) {
  const img = p.displayImage || p.images?.[0] || p.stockPhotos?.[0] || null;
  const score = calcScore(p);
  return (
    <button
      onClick={onClick}
      className={[
        'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
        active
          ? 'bg-blue-500/10 border-r-2 border-blue-400'
          : 'hover:bg-white/[0.03] border-r-2 border-transparent',
      ].join(' ')}
    >
      {/* Thumb */}
      <div className="w-9 h-9 rounded-lg bg-slate-800 border border-white/[0.06] overflow-hidden shrink-0">
        {img
          ? <img src={img} alt="" className="w-full h-full object-contain p-0.5" />
          : <div className="flex items-center justify-center h-full"><Image size={14} className="text-slate-700" /></div>
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono text-blue-400 leading-none">{p.sku}</p>
        <p className="text-[11px] text-slate-300 truncate mt-0.5 leading-snug">{p.name}</p>
      </div>

      {/* Score */}
      <ScorePill score={score} />
    </button>
  );
}

// ─── AdminProdutos ────────────────────────────────────────────────────────────
export default function AdminProdutos() {
  // ── Left: search & list ──────────────────────────────────────────────────
  const [query,       setQuery]       = useState('');
  const [activeFilter, setFilter]     = useState('todos'); // todos|semfoto|semmarca|semlocal
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [page,        setPage]        = useState(0);
  const PER_PAGE = 20;

  // ── Right: product detail ─────────────────────────────────────────────────
  const [selected,    setSelected]    = useState(null); // produto carregado
  const [loadingProd, setLoadingProd] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);

  // Editable fields
  const [binName,     setBinName]     = useState('');
  const [notes,       setNotes]       = useState('');
  const [stockPhotos, setStockPhotos] = useState([]);
  const [boxPhotos,   setBoxPhotos]   = useState([]);
  const [binPhoto,    setBinPhoto]    = useState('');
  const [uploading,   setUploading]   = useState({}); // key → bool

  // Embalagens
  const [embalagens,  setEmbalagens]  = useState([]);

  // Debounced search
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q, filter) => {
    setSearching(true);
    try {
      let url = `/admin/products/search?q=${encodeURIComponent(q)}&limit=100`;
      if (filter && filter !== 'todos') url += `&filter=${filter}`;
      const data = await apiFetch(url);
      setResults(Array.isArray(data) ? data : (data.items || data.results || []));
      setPage(0);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Load all on mount
  useEffect(() => { doSearch('', 'todos'); }, [doSearch]);

  // Load embalagens
  useEffect(() => {
    apiFetch('/embalagens/list').then(d => setEmbalagens(Array.isArray(d) ? d : (d.items || [])));
  }, []);

  function handleQueryChange(v) {
    setQuery(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v, activeFilter), 350);
  }

  function handleFilterChange(f) {
    setFilter(f);
    doSearch(query, f);
  }

  // ── Load product ──────────────────────────────────────────────────────────
  async function loadProduct(sku) {
    setLoadingProd(true);
    setSaved(false);
    try {
      const data = await apiFetch(`/admin/products/${sku}`);
      const p = data.produto || data;
      setSelected(p);
      setBinName(p.customBinName || p.bin || '');
      setNotes(p.notes || '');
      setStockPhotos(p.stockPhotos || []);
      setBoxPhotos(p.boxPhotos || []);
      setBinPhoto(p.binPhoto || '');
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProd(false);
    }
  }

  // ── Save overrides ────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/products/${selected.sku}`, {
        method: 'PATCH',
        body: JSON.stringify({ customBinName: binName, notes, stockPhotos, boxPhotos, binPhoto }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      // Refresh na lista
      doSearch(query, activeFilter);
    } catch {}
    setSaving(false);
  }

  // ── Photo upload ──────────────────────────────────────────────────────────
  async function uploadPhoto(file, kind, index) {
    if (!file || !selected) return;
    const key = `${kind}-${index}`;
    setUploading(u => ({ ...u, [key]: true }));
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    try {
      const token = localStorage.getItem('expedicao_token') || '';
      const r = await fetch(`/admin/save-photo-cloudinary/${selected.sku}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await r.json();
      if (data.ok && data.url) {
        if (kind === 'stock') {
          const next = [...stockPhotos];
          if (index < next.length) next[index] = data.url; else next.push(data.url);
          setStockPhotos(next);
        } else if (kind === 'box') {
          const next = [...boxPhotos];
          if (index < next.length) next[index] = data.url; else next.push(data.url);
          setBoxPhotos(next);
        } else if (kind === 'bin') {
          setBinPhoto(data.url);
        }
      }
    } catch {}
    setUploading(u => ({ ...u, [key]: false }));
  }

  function removePhoto(kind, index) {
    if (kind === 'stock') { const n = [...stockPhotos]; n.splice(index, 1); setStockPhotos(n); }
    if (kind === 'box')   { const n = [...boxPhotos];   n.splice(index, 1); setBoxPhotos(n); }
    if (kind === 'bin')   setBinPhoto('');
  }

  // ── Compatible packaging ──────────────────────────────────────────────────
  const embalagensFit = embalagens.filter(e => {
    if (!selected?.width || !selected?.height || !selected?.depth) return false;
    const fits = (dim, box) => box === 0 || dim <= box;
    return fits(selected.width, e.largura || 0)
        && fits(selected.height, e.altura || 0)
        && fits(selected.depth, e.profundidade || 0);
  }).slice(0, 6);

  // ── Pagination ────────────────────────────────────────────────────────────
  const pageResults = results.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages  = Math.ceil(results.length / PER_PAGE);

  const FILTERS = [
    { id: 'todos',     label: 'Todos' },
    { id: 'semfoto',   label: 'Sem foto' },
    { id: 'semmarca',  label: 'Sem marca' },
    { id: 'semlocal',  label: 'Sem local' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-slate-950 animate-fade-in">

      {/* ── Left: Search + List ─────────────────────────────────────────── */}
      <div className="flex flex-col w-72 shrink-0 border-r border-white/[0.06] bg-slate-950 overflow-hidden">

        {/* Header */}
        <div className="shrink-0 px-3 pt-3 pb-2 border-b border-white/[0.05]">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Layers size={13} className="text-blue-400" />
            </div>
            <span className="text-[12px] font-bold text-slate-200">Admin Produtos</span>
            <span className="ml-auto text-[10px] text-slate-600">{results.length} produtos</span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
            {searching && <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 animate-spin" />}
            <input
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="SKU, EAN ou nome…"
              className="w-full pl-7 pr-7 py-1.5 rounded-lg bg-slate-800/80 border border-white/[0.07] text-[12px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/15 transition-all"
            />
            {query && (
              <button onClick={() => { setQuery(''); doSearch('', activeFilter); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-1 mt-2 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => handleFilterChange(f.id)}
                className={[
                  'text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-colors',
                  activeFilter === f.id
                    ? 'bg-blue-500/15 text-blue-300 border-blue-500/35'
                    : 'bg-slate-800 text-slate-500 border-white/[0.06] hover:border-slate-600',
                ].join(' ')}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
          {pageResults.length === 0 && !searching && (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-600">
              <Package size={24} />
              <p className="text-xs">Nenhum produto</p>
            </div>
          )}
          {pageResults.map(p => (
            <ProductListItem
              key={p.sku}
              p={p}
              active={selected?.sku === p.sku}
              onClick={() => loadProduct(p.sku)}
            />
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-white/[0.05] text-[10px] text-slate-500">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1 rounded hover:bg-white/[0.05] disabled:opacity-30 transition-colors">
              <ChevronLeft size={13} />
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="p-1 rounded hover:bg-white/[0.05] disabled:opacity-30 transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ── Right: Product Detail ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">

        {/* Empty state */}
        {!selected && !loadingProd && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-700 p-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-white/[0.06] flex items-center justify-center">
              <Search size={28} />
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-500 font-medium">Selecione um produto</p>
              <p className="text-xs text-slate-700 mt-1">Busque pelo SKU, EAN ou nome na lista ao lado</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loadingProd && (
          <div className="p-5 space-y-4 max-w-3xl">
            <div className="space-y-2"><Sk h="h-7" w="w-3/4" /><Sk h="h-4" w="w-1/2" /></div>
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Sk key={i} h="h-4" />)}</div>
            <Sk h="h-32" />
            <Sk h="h-24" />
          </div>
        )}

        {/* Product Panel */}
        {selected && !loadingProd && (
          <div className="p-4 max-w-3xl space-y-3 animate-fade-in">

            {/* ── Header ── */}
            <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-900 border border-white/[0.07]">
              {/* Thumbnail */}
              <div className="w-16 h-16 rounded-xl bg-slate-800 border border-white/[0.06] overflow-hidden shrink-0">
                {(selected.displayImage || selected.images?.[0] || selected.stockPhotos?.[0])
                  ? <img src={selected.displayImage || selected.images?.[0] || selected.stockPhotos?.[0]} alt="" className="w-full h-full object-contain p-1" />
                  : <div className="flex items-center justify-center h-full"><Image size={22} className="text-slate-700" /></div>
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[11px] font-mono font-bold text-blue-400">{selected.sku}</span>
                  {selected.situacao && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                      selected.situacao.toLowerCase().includes('ativo')
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                        : 'bg-slate-700 text-slate-400 border-slate-600'
                    }`}>{selected.situacao}</span>
                  )}
                  {selected.marca && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 border border-white/[0.06]">{selected.marca}</span>
                  )}
                  <ScorePill score={calcScore(selected)} />
                </div>
                <p className="text-sm font-semibold text-slate-100 leading-snug">{selected.name}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/admin?sku=${selected.sku}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-colors"
                  title="Abrir admin legado"
                >
                  <ExternalLink size={14} />
                </a>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    saved
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25',
                  ].join(' ')}
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <CheckCircle2 size={12} /> : <Save size={12} />}
                  {saved ? 'Salvo!' : 'Salvar'}
                </button>
              </div>
            </div>

            {/* ── Dados do Bling (read-only) ── */}
            <SectionCard icon={Info} title="Dados do Bling" badge="somente leitura" accent="slate">
              <div className="divide-y divide-white/[0.04]">
                <InfoLine icon={Barcode}     label="EAN"         value={selected.ean}    mono />
                <InfoLine icon={Hash}        label="EAN Caixa"   value={selected.eanBox} mono />
                <InfoLine icon={DollarSign}  label="Preço"       value={fmtBrl(selected.preco)}
                  highlight={selected.preco ? 'ok' : 'warn'} />
                <InfoLine icon={DollarSign}  label="Custo"       value={fmtBrl(selected.precoCusto)} />
                <InfoLine icon={Boxes}       label="Estoque"     value={fmtNum(selected.stock, ' un')}
                  highlight={selected.stock === 0 ? 'warn' : selected.stock < 5 ? 'warn' : undefined} />
                <InfoLine icon={Weight}      label="Peso líq."   value={fmtNum(selected.weight, ' kg')} />
                <InfoLine icon={Weight}      label="Peso bruto"  value={fmtNum(selected.weightBruto, ' kg')} />
                <InfoLine icon={Ruler}       label="Dimensões"
                  value={(selected.width && selected.height && selected.depth)
                    ? `${selected.width} × ${selected.height} × ${selected.depth} cm`
                    : null}
                  highlight={(!selected.width || !selected.height || !selected.depth) ? 'warn' : undefined}
                />
                <InfoLine icon={ShoppingBag} label="Itens/cx"   value={fmtNum(selected.itensPorCaixa)} />
              </div>

              {selected.tagsRaw && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/[0.04]">
                  {selected.tagsRaw.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-white/[0.05]">{tag}</span>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* ── Localização ── */}
            <SectionCard icon={MapPin} title="Localização" accent="amber">
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 uppercase tracking-widest font-semibold">
                    Nome do local (prateleira, rua, caixa…)
                  </label>
                  <input
                    value={binName}
                    onChange={e => setBinName(e.target.value)}
                    placeholder="Ex: Rua A — Prateleira 2 — Caixa 3"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/[0.07] text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/15 transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 uppercase tracking-widest font-semibold">
                    Foto da prateleira
                  </label>
                  <PhotoSlot
                    url={binPhoto}
                    label="Prateleira"
                    onUpload={f => uploadPhoto(f, 'bin', 0)}
                    onDelete={() => removePhoto('bin', 0)}
                    uploading={uploading['bin-0']}
                  />
                </div>
              </div>
            </SectionCard>

            {/* ── Fotos do Produto ── */}
            <SectionCard icon={Camera} title="Fotos do Produto" accent="blue">
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-2">Produto (sem embalagem)</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[...Array(4)].map((_, i) => (
                      <PhotoSlot
                        key={i}
                        url={stockPhotos[i] || null}
                        label={`Foto ${i + 1}`}
                        onUpload={f => uploadPhoto(f, 'stock', i)}
                        onDelete={() => removePhoto('stock', i)}
                        uploading={uploading[`stock-${i}`]}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-2">Produto embalado</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[...Array(4)].map((_, i) => (
                      <PhotoSlot
                        key={i}
                        url={boxPhotos[i] || null}
                        label={`Foto ${i + 1}`}
                        onUpload={f => uploadPhoto(f, 'box', i)}
                        onDelete={() => removePhoto('box', i)}
                        uploading={uploading[`box-${i}`]}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* ── Notas Operacionais ── */}
            <SectionCard icon={StickyNote} title="Notas Operacionais" accent="emerald">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Instruções para o separador — fragilidade, orientação de embalagem, atenção especial…"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-white/[0.07] text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/15 transition-all leading-relaxed"
              />
              {notes && (
                <p className="text-[10px] text-slate-600 mt-1.5">
                  {notes.length} caracteres
                </p>
              )}
            </SectionCard>

            {/* ── Embalagens Compatíveis ── */}
            {(selected.width || selected.height || selected.depth) && (
              <SectionCard icon={Box} title="Embalagens Compatíveis" badge={`${embalagensFit.length} opções`} accent="slate">
                {embalagensFit.length === 0 ? (
                  <p className="text-xs text-slate-600">
                    Nenhuma embalagem cadastrada com dimensões compatíveis.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {embalagensFit.map((e, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/60 border border-white/[0.05]">
                        <Box size={13} className="text-slate-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-slate-300 truncate">{e.nome || e.name}</p>
                          {(e.largura || e.altura || e.profundidade) && (
                            <p className="text-[10px] text-slate-600">{e.largura}×{e.altura}×{e.profundidade} cm</p>
                          )}
                        </div>
                        <span className={`text-[10px] font-semibold tabular-nums ${
                          (e.estoque || e.stock) > 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {e.estoque ?? e.stock ?? 0} un
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {/* Save floating button (mobile) */}
            <div className="pb-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className={[
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  saved
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-900/30',
                ].join(' ')}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
                {saved ? 'Alterações salvas!' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
