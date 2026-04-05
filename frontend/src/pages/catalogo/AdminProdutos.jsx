/**
 * @file AdminProdutos.jsx
 * @description Migração React de admin.html — gestão de localização, fotos e notas.
 *              Layout fiel ao legado: sidebar esquerda (busca+lista) + painel direito.
 * @version 2.0.0
 * @date 2026-04-04
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, X, Image, MapPin, StickyNote, Box, Package,
  Weight, Barcode, Tag, DollarSign, Loader2, Save,
  CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight,
  Camera, Plus, Trash2, Eye, Info, Hash, Boxes, Ruler,
  ShoppingBag, RefreshCw, ExternalLink, Star,
} from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const token = await getAuthToken();
  const isFormData = opts.body instanceof FormData;
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(opts.headers || {}),
  };
  const res = await fetch(path, { ...opts, headers });
  return res;
}

async function apiJson(path, opts = {}) {
  const res = await apiFetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBrl = v => v ? BRL.format(v) : null;
const fmtKg  = v => v ? `${v} kg` : null;
const fmtCm  = v => v ? `${v} cm` : null;

function calcScore(p) {
  let s = 0;
  const hasImg = p.displayImage || p.images?.length || p.stockPhotos?.length;
  if (hasImg)                               s += 25;
  if (p.ean)                                s += 20;
  if (p.width && p.height && p.depth)       s += 20;
  if (p.preco)                              s += 20;
  if (p.weight)                             s += 15;
  return s;
}

// ─── Score Dot ────────────────────────────────────────────────────────────────
function ScoreDot({ score }) {
  const c = score >= 80 ? 'bg-emerald-400' : score >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${c}`} title={`Score ${score}%`} />;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ emoji, title, badge, children, muted }) {
  return (
    <div className="border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/70 border-b border-white/[0.05]">
        <span className="text-sm">{emoji}</span>
        <span className="text-[11px] font-bold text-slate-300 tracking-wide">{title}</span>
        {badge && <span className="ml-1 text-[10px] text-slate-600 border border-white/[0.06] rounded px-1.5 py-px">{badge}</span>}
        {muted && <span className="ml-auto text-[10px] text-slate-700 italic">{muted}</span>}
      </div>
      <div className="p-4 bg-slate-900/30">{children}</div>
    </div>
  );
}

// ─── DataRow (Dados do Bling) ─────────────────────────────────────────────────
function DataRow({ label, value, warn }) {
  if (!value && !warn) return null;
  return (
    <div className="flex items-baseline gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[10px] text-slate-600 w-24 shrink-0 uppercase tracking-wider font-medium">{label}</span>
      <span className={`text-[12px] font-medium flex-1 ${warn ? 'text-amber-400' : 'text-slate-200'}`}>
        {value || <span className="text-slate-700 italic text-[11px]">Não informado</span>}
      </span>
    </div>
  );
}

// ─── PhotoStrip ───────────────────────────────────────────────────────────────
function PhotoStrip({ photos, kind, onUpload, onDelete, maxSlots = 10 }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file) {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      onUpload(fd, kind, setUploading);
    } catch {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((url, i) => (
        <div key={i} className="relative group w-[88px] h-[88px] rounded-xl overflow-hidden border border-white/[0.08] bg-slate-800 shrink-0">
          <img
            src={url}
            alt=""
            className="w-full h-full object-contain p-1"
            onError={e => { e.target.src = ''; e.target.style.display = 'none'; }}
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
            <a href={url} target="_blank" rel="noreferrer"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              onClick={e => e.stopPropagation()}>
              <Eye size={12} />
            </a>
            <button onClick={() => onDelete(kind, i)}
              className="p-1.5 rounded-lg bg-red-500/30 hover:bg-red-500/50 text-red-200 transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}

      {/* Add button */}
      {photos.length < maxSlots && (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-[88px] h-[88px] rounded-xl border-2 border-dashed border-slate-700 hover:border-emerald-500/60 hover:bg-emerald-500/5 flex flex-col items-center justify-center gap-1 text-slate-700 hover:text-emerald-400 transition-all shrink-0 disabled:opacity-40"
          >
            {uploading
              ? <Loader2 size={18} className="animate-spin" />
              : <Plus size={18} />
            }
            <span className="text-[9px] font-semibold uppercase tracking-wider">
              {uploading ? 'Enviando' : 'Adicionar'}
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => handleUpload(e.target.files?.[0])} />
        </>
      )}
    </div>
  );
}

// ─── BinPhotoSlot ─────────────────────────────────────────────────────────────
function BinPhotoSlot({ url, onUpload, onDelete }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', 'bin');
    onUpload(fd, 'bin', setUploading);
  }

  if (url) {
    return (
      <div className="relative group w-full h-32 rounded-xl overflow-hidden border border-white/[0.08] bg-slate-800">
        <img src={url} alt="Prateleira" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <a href={url} target="_blank" rel="noreferrer"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
            <Eye size={14} />
          </a>
          <button onClick={() => onDelete('bin', 0)}
            className="p-2 rounded-lg bg-red-500/30 hover:bg-red-500/50 text-red-200 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full h-24 rounded-xl border-2 border-dashed border-slate-700 hover:border-amber-500/50 hover:bg-amber-500/5 flex items-center justify-center gap-2 text-slate-600 hover:text-amber-400 transition-all disabled:opacity-40"
      >
        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
        <span className="text-xs font-medium">{uploading ? 'Enviando…' : 'Tirar foto da prateleira'}</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => handleUpload(e.target.files?.[0])} />
    </>
  );
}

// ─── CheckItem ────────────────────────────────────────────────────────────────
function CheckItem({ ok, label }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${ok ? 'text-emerald-400' : 'text-slate-600'}`}>
      <CheckCircle2 size={12} className={ok ? '' : 'opacity-0'} />
      {!ok && <span className="w-3 h-3 rounded-full border border-slate-700 shrink-0" />}
      <span>{label}</span>
    </div>
  );
}

// ─── AdminProdutos ────────────────────────────────────────────────────────────
export default function AdminProdutos() {
  const [searchParams] = useSearchParams();

  // Left panel state
  const [query,      setQuery]      = useState('');
  const [results,    setResults]    = useState([]);
  const [allProds,   setAllProds]   = useState([]); // /products/all para browse
  const [loading,    setLoading]    = useState(true);
  const [searching,  setSearching]  = useState(false);
  const [filter,     setFilter]     = useState('todos');
  const [page,       setPage]       = useState(0);
  const PER = 20;

  // Right panel state
  const [sku,        setSku]        = useState(searchParams.get('sku') || '');
  const [produto,    setProduto]    = useState(null);
  const [loadingP,   setLoadingP]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [savedOk,    setSavedOk]    = useState(false);

  // Editable overrides
  const [binName,    setBinName]    = useState('');
  const [notes,      setNotes]      = useState('');
  const [stockPhotos,setStockPhotos]= useState([]);
  const [boxPhotos,  setBoxPhotos]  = useState([]);
  const [binPhoto,   setBinPhoto]   = useState('');

  // Embalagens
  const [embs, setEmbs] = useState([]);

  const debRef = useRef(null);

  // ── Load all products (browse / filter) ──────────────────────────────────
  useEffect(() => {
    fetch('/products/all')
      .then(r => r.json())
      .then(d => {
        const items = Array.isArray(d) ? d : (d.items || []);
        setAllProds(items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch('/embalagens/list')
      .then(r => r.json())
      .then(d => setEmbs(Array.isArray(d) ? d : (d.items || [])));
  }, []);

  // ── Load initial SKU from URL param ──────────────────────────────────────
  useEffect(() => {
    if (sku) loadProduct(sku);
  }, []); // eslint-disable-line

  // ── Search ───────────────────────────────────────────────────────────────
  async function doSearch(q) {
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/admin/products/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : (data.items || []));
    } catch { setResults([]); }
    setSearching(false);
  }

  function handleQuery(v) {
    setQuery(v);
    setPage(0);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => doSearch(v), 320);
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const list = (() => {
    const base = query.trim().length >= 2 ? results : allProds;
    let arr = [...base];
    if (filter === 'semfoto')   arr = arr.filter(p => !p.displayImage && !p.images?.length && !p.stockPhotos?.length);
    if (filter === 'semmarca')  arr = arr.filter(p => !p.marca);
    if (filter === 'semlocal')  arr = arr.filter(p => !p.bin && !p.customBinName);
    return arr;
  })();

  const pageItems = list.slice(page * PER, (page + 1) * PER);
  const totalPages = Math.ceil(list.length / PER);

  // ── Load product detail ───────────────────────────────────────────────────
  async function loadProduct(s) {
    setSku(s);
    setLoadingP(true);
    setSavedOk(false);
    try {
      const res = await fetch(`/admin/products/${encodeURIComponent(s)}`);
      const data = await res.json();
      const p = data.item || data.produto || data;
      setProduto(p);
      setBinName(p.customBinName || p.bin || '');
      setNotes(p.notes || '');
      setStockPhotos(p.stockPhotos || []);
      setBoxPhotos(p.boxPhotos || []);
      setBinPhoto(p.binPhoto || '');
    } catch {}
    setLoadingP(false);
  }

  // ── Save overrides ────────────────────────────────────────────────────────
  async function handleSave() {
    if (!produto) return;
    setSaving(true);
    try {
      await apiJson(`/admin/products/${encodeURIComponent(produto.sku)}`, {
        method: 'PATCH',
        body: JSON.stringify({ customBinName: binName, notes, stockPhotos, boxPhotos, binPhoto }),
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (e) {
      alert('Erro ao salvar: ' + e.message);
    }
    setSaving(false);
  }

  // ── Photo upload ──────────────────────────────────────────────────────────
  async function handlePhotoUpload(fd, kind, setUploading) {
    if (!produto) return;
    try {
      const res = await apiFetch(`/admin/save-photo-cloudinary/${encodeURIComponent(produto.sku)}`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (data.ok && data.url) {
        if (kind === 'stock') setStockPhotos(p => [...p, data.url]);
        if (kind === 'box')   setBoxPhotos(p => [...p, data.url]);
        if (kind === 'bin')   setBinPhoto(data.url);
      } else {
        alert(data.error || 'Erro no upload');
      }
    } catch (e) {
      alert('Erro no upload: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  function handleDeletePhoto(kind, idx) {
    if (kind === 'stock') setStockPhotos(p => p.filter((_, i) => i !== idx));
    if (kind === 'box')   setBoxPhotos(p => p.filter((_, i) => i !== idx));
    if (kind === 'bin')   setBinPhoto('');
  }

  // ── Compatible packaging ──────────────────────────────────────────────────
  const embsFit = embs.filter(e => {
    if (!produto?.width || !produto?.height || !produto?.depth) return false;
    const fits = (prod, box) => !box || prod <= box;
    return fits(produto.width, e.largura) && fits(produto.height, e.altura) && fits(produto.depth, e.profundidade);
  }).slice(0, 8);

  const score = produto ? calcScore(produto) : 0;
  const thumbUrl = produto?.displayImage || produto?.images?.[0] || stockPhotos[0] || null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-slate-950 animate-fade-in">

      {/* ══ LEFT: Search + List ═══════════════════════════════════════════════ */}
      <aside className="flex flex-col w-[260px] shrink-0 border-r border-white/[0.06] overflow-hidden">

        {/* Header + busca */}
        <div className="shrink-0 border-b border-white/[0.05] px-3 pt-3 pb-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-slate-200">Admin Produtos</span>
            <span className="ml-auto text-[10px] text-slate-700 tabular-nums">{list.length}</span>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
            <input
              value={query}
              onChange={e => handleQuery(e.target.value)}
              placeholder="SKU, EAN ou nome…"
              className="w-full pl-7 pr-6 py-1.5 rounded-lg bg-slate-800 border border-white/[0.07] text-[12px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
            />
            {searching && <Loader2 size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 animate-spin" />}
            {query && !searching && (
              <button onClick={() => { setQuery(''); setResults([]); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors">
                <X size={11} />
              </button>
            )}
          </div>
          {query.length > 0 && query.length < 2 && (
            <p className="text-[10px] text-slate-700 px-1">Digite ao menos 2 letras</p>
          )}

          {/* Filter chips */}
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'todos',    label: 'Todos' },
              { id: 'semfoto',  label: 'Sem foto' },
              { id: 'semmarca', label: 'Sem marca' },
              { id: 'semlocal', label: 'Sem local' },
            ].map(f => (
              <button key={f.id} onClick={() => { setFilter(f.id); setPage(0); }}
                className={[
                  'text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-colors',
                  filter === f.id
                    ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                    : 'bg-slate-800/60 text-slate-600 border-white/[0.06] hover:border-slate-600 hover:text-slate-400',
                ].join(' ')}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-px p-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 bg-white/[0.04] rounded animate-pulse w-1/3" />
                    <div className="h-2 bg-white/[0.03] rounded animate-pulse w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && pageItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-700">
              <Package size={22} />
              <p className="text-[11px]">Nenhum produto</p>
            </div>
          )}

          {!loading && pageItems.map(p => {
            const img = p.displayImage || p.images?.[0] || p.stockPhotos?.[0] || null;
            const sc  = calcScore(p);
            const isActive = p.sku === produto?.sku;
            return (
              <button key={p.sku} onClick={() => loadProduct(p.sku)}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-r-2',
                  isActive
                    ? 'bg-blue-500/[0.08] border-blue-400'
                    : 'hover:bg-white/[0.025] border-transparent',
                ].join(' ')}
              >
                {/* Thumb */}
                <div className="w-9 h-9 rounded-lg bg-slate-800 border border-white/[0.06] overflow-hidden shrink-0">
                  {img
                    ? <img src={img} alt="" className="w-full h-full object-contain" />
                    : <div className="flex h-full items-center justify-center"><Image size={13} className="text-slate-700" /></div>
                  }
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono text-blue-400 leading-none truncate">{p.sku}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5 leading-snug">{p.name}</p>
                </div>
                <ScoreDot score={sc} />
              </button>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-white/[0.05]">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="p-1 rounded text-slate-600 hover:text-slate-300 disabled:opacity-30 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-[10px] text-slate-600">{page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              className="p-1 rounded text-slate-600 hover:text-slate-300 disabled:opacity-30 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </aside>

      {/* ══ RIGHT: Product Panel ══════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 overflow-y-auto">

        {/* Empty */}
        {!produto && !loadingP && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-700 p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-white/[0.05] flex items-center justify-center">
              <Search size={26} />
            </div>
            <p className="text-sm text-slate-500 font-medium">Selecione um produto</p>
            <p className="text-xs text-slate-700 max-w-xs">Busque por SKU, EAN ou nome na lista ao lado — ou use o filtro rápido</p>
          </div>
        )}

        {/* Loading */}
        {loadingP && (
          <div className="p-5 max-w-2xl space-y-4">
            <div className="h-8 bg-white/[0.04] rounded-xl animate-pulse w-2/3" />
            <div className="h-5 bg-white/[0.03] rounded animate-pulse w-1/3" />
            <div className="h-32 bg-white/[0.03] rounded-xl animate-pulse" />
            <div className="h-24 bg-white/[0.03] rounded-xl animate-pulse" />
          </div>
        )}

        {/* Panel */}
        {produto && !loadingP && (
          <div className="max-w-2xl p-4 space-y-3 animate-fade-in">

            {/* ── Product header ─────────────────────────────────────────── */}
            <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-900 border border-white/[0.07]">

              {/* Thumb grande */}
              <div className="w-20 h-20 rounded-xl bg-slate-800 border border-white/[0.07] overflow-hidden shrink-0">
                {thumbUrl
                  ? <img src={thumbUrl} alt="" className="w-full h-full object-contain p-1" />
                  : <div className="flex h-full items-center justify-center"><Image size={24} className="text-slate-700" /></div>
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-slate-100 leading-snug">{produto.name}</p>

                {/* Tags: SKU, EAN, bin, marca */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Barcode size={9}/>{produto.sku}
                  </span>
                  {produto.ean && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-700/60 text-slate-400 border border-white/[0.06]">
                      {produto.ean}
                    </span>
                  )}
                  {produto.eanBox && produto.eanBox !== produto.ean && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-700/40 text-slate-500 border border-white/[0.05]">
                      cx: {produto.eanBox}
                    </span>
                  )}
                  {(binName || produto.bin) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <MapPin size={9}/>{binName || produto.bin}
                    </span>
                  )}
                  {produto.stock != null && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${
                      produto.stock === 0 ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      produto.stock < 5  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      'bg-slate-700/50 text-slate-400 border-white/[0.06]'
                    }`}>
                      <Boxes size={9}/>{produto.stock}
                    </span>
                  )}
                  {produto.marca && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-700/40 text-slate-500 border border-white/[0.05]">
                      <Tag size={9}/>{produto.marca}
                    </span>
                  )}
                </div>

                {/* Completude inline */}
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex gap-2">
                    <CheckItem ok={!!thumbUrl}                               label="Foto" />
                    <CheckItem ok={!!produto.ean}                            label="EAN" />
                    <CheckItem ok={!!(produto.width && produto.height && produto.depth)} label="Dims" />
                    <CheckItem ok={!!produto.preco}                          label="Preço" />
                    <CheckItem ok={!!produto.weight}                         label="Peso" />
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    <a href={`/admin?sku=${produto.sku}`} target="_blank" rel="noreferrer"
                      className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors underline">
                      legado
                    </a>
                    <button onClick={handleSave} disabled={saving}
                      className={[
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all',
                        savedOk
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 active:scale-95',
                      ].join(' ')}
                    >
                      {saving ? <Loader2 size={12} className="animate-spin" /> : savedOk ? <CheckCircle2 size={12} /> : <Save size={12} />}
                      {savedOk ? 'Salvo!' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Dados do Bling (read-only) ─────────────────────────────── */}
            <Section emoji="📋" title="Dados do Bling" muted="somente leitura — reimporte o CSV para atualizar">
              <div className="grid grid-cols-2 gap-x-8">
                <div>
                  <DataRow label="Peso líq."   value={fmtKg(produto.weight)} warn={!produto.weight} />
                  <DataRow label="Peso bruto"  value={fmtKg(produto.weightBruto)} />
                  <DataRow label="Largura"     value={fmtCm(produto.width)}  warn={!produto.width} />
                  <DataRow label="Altura"      value={fmtCm(produto.height)} warn={!produto.height} />
                  <DataRow label="Profund."    value={fmtCm(produto.depth)}  warn={!produto.depth} />
                </div>
                <div>
                  <DataRow label="Local Bling" value={produto.bin} />
                  <DataRow label="Estoque"     value={produto.stock != null ? String(produto.stock) : null}
                    warn={produto.stock === 0} />
                  <DataRow label="Itens/cx"    value={produto.itensPorCaixa ? String(produto.itensPorCaixa) : null} />
                  <DataRow label="Preço"       value={fmtBrl(produto.preco)} warn={!produto.preco} />
                  <DataRow label="Custo"       value={fmtBrl(produto.precoCusto)} />
                </div>
              </div>
            </Section>

            {/* ── Localização ──────────────────────────────────────────────── */}
            <Section emoji="📍" title="Localização" badge="Sistema">
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-1.5">
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
                  <label className="block text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-1.5">
                    Foto da prateleira
                  </label>
                  <BinPhotoSlot
                    url={binPhoto}
                    onUpload={handlePhotoUpload}
                    onDelete={handleDeletePhoto}
                  />
                </div>
              </div>
            </Section>

            {/* ── Fotos do Produto ─────────────────────────────────────────── */}
            <Section emoji="📦" title="Fotos do Produto" badge="Sistema"
              muted={`${stockPhotos.length + boxPhotos.length}/20`}>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-2">
                    📦 Produto (sem embalagem)
                  </p>
                  <PhotoStrip
                    photos={stockPhotos}
                    kind="stock"
                    onUpload={handlePhotoUpload}
                    onDelete={handleDeletePhoto}
                  />
                </div>
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-2">
                    🎁 Produto embalado
                  </p>
                  <PhotoStrip
                    photos={boxPhotos}
                    kind="box"
                    onUpload={handlePhotoUpload}
                    onDelete={handleDeletePhoto}
                  />
                </div>
              </div>
            </Section>

            {/* ── Notas Operacionais ────────────────────────────────────────── */}
            <Section emoji="📝" title="Notas Operacionais" badge="Sistema">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Instruções para o separador — fragilidade, orientação, embalagem especial…"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-white/[0.07] text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/15 transition-all leading-relaxed"
              />
            </Section>

            {/* ── Embalagens Compatíveis ────────────────────────────────────── */}
            {(produto.width || produto.height) && (
              <Section emoji="📐" title="Embalagens Compatíveis" badge={`${embsFit.length} opções`}>
                {embsFit.length === 0 ? (
                  <p className="text-xs text-slate-600">Nenhuma embalagem compatível com estas dimensões.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {embsFit.map((e, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-800/60 border border-white/[0.05]">
                        <Box size={13} className="text-slate-600 shrink-0" />
                        <div>
                          <p className="text-[11px] font-medium text-slate-300">{e.nome || e.name}</p>
                          {(e.largura || e.altura) && (
                            <p className="text-[10px] text-slate-600">{e.largura}×{e.altura}×{e.profundidade} cm</p>
                          )}
                        </div>
                        <span className={`text-[11px] font-bold ml-auto tabular-nums ${
                          (e.estoque ?? e.stock) > 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}>{e.estoque ?? e.stock ?? 0}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {/* Save bottom */}
            <div className="pb-6">
              <button onClick={handleSave} disabled={saving}
                className={[
                  'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all',
                  savedOk
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 active:scale-[0.99]',
                ].join(' ')}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : savedOk ? <CheckCircle2 size={15} /> : <Save size={15} />}
                {savedOk ? 'Alterações salvas!' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
