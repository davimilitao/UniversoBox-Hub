/**
 * @file AdminProdutos.jsx
 * @description Admin de Produtos — migração completa de admin.html
 *   • Aba Produtos: busca SKU/EAN/nome, filtros, navegação prev/next
 *   • Aba Marcas: normalização de marca (sem-marca, nova marca, delete)
 *   • Painel direito: Bling (read-only), Localização, Fotos, Notas, Embalagens
 *   • Modal de Marca
 *   • Auto-seleciona via ?sku= na URL
 * @version 3.0.0
 * @date 2026-04-05
 */

import { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Search, X, Image, MapPin, StickyNote, Box, Package,
  Weight, Barcode, DollarSign, Loader2, Save, Camera,
  CheckCircle2, ChevronLeft, ChevronRight, Plus, Trash2,
  Eye, Hash, Boxes, Ruler, ShoppingBag, Tag, RefreshCw,
  AlertTriangle, Layers, ArrowUpDown, ExternalLink,
  Sparkles, Crop, Eraser, Wand2,
} from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';
import { ImageEditor } from '../../components/ImageEditor';
import { Toast } from '../../components/ui';

// ─── API ─────────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const token = await getAuthToken();
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `HTTP ${res.status}`);
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
  if (p.displayImage || p.images?.length || p.stockPhotos?.length) s += 25;
  if (p.ean)                              s += 20;
  if (p.width && p.height && p.depth)    s += 20;
  if (p.preco)                            s += 20;
  if (p.weight)                           s += 15;
  return s;
}

// ─── Embalagens — lógica de tolerância idêntica ao legado ─────────────────────
function embalagemFit(emb, p) {
  if (!p.width || !p.height) return false;
  const pw = parseFloat(p.width) || 0;
  const ph = parseFloat(p.height) || 0;
  const pd = parseFloat(p.depth) || 0;
  const mg = 1.25;
  if (emb.type === 'saco') {
    const mid = [pw, ph, pd].sort((a, b) => a - b)[1];
    const max = Math.max(pw, ph, pd);
    return mid <= (emb.width || 0) * mg && max <= (emb.height || 0) * mg;
  }
  return pw <= (emb.width || 0) * mg && ph <= (emb.height || 0) * mg && pd <= (emb.depth || 0) * mg;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// ── Score Dots ────────────────────────────────────────────────────────────────
function StatusDots({ hasStockPhoto, hasBinPhoto }) {
  return (
    <div className="flex gap-1 mt-0.5">
      <span className={`w-1.5 h-1.5 rounded-full ${hasStockPhoto ? 'bg-emerald-400' : 'bg-slate-700 border border-slate-600'}`} title={hasStockPhoto ? 'Tem foto' : 'Sem foto'} />
      <span className={`w-1.5 h-1.5 rounded-full ${hasBinPhoto  ? 'bg-amber-400'   : 'bg-slate-700 border border-slate-600'}`} title={hasBinPhoto  ? 'Tem foto prateleira' : 'Sem foto prateleira'} />
    </div>
  );
}

// ── Product List Item ─────────────────────────────────────────────────────────
function ProdListItem({ p, active, onClick }) {
  const img = p.displayImage || p.images?.[0] || p.stockPhotos?.[0] || null;
  const hasStockPhoto = !!(p.stockPhotos?.length || p.images?.length || p.displayImage);
  const hasBinPhoto   = !!p.binPhoto;
  return (
    <button onClick={onClick}
      className={[
        'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-r-2 group',
        active ? 'bg-blue-500/[0.07] border-blue-400' : 'hover:bg-white/[0.025] border-transparent',
      ].join(' ')}
    >
      <div className="w-9 h-9 rounded-lg bg-slate-800 border border-white/[0.06] overflow-hidden shrink-0">
        {img
          ? <img src={img} alt="" className="w-full h-full object-contain" />
          : <div className="flex h-full items-center justify-center"><Image size={13} className="text-slate-700" /></div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono text-blue-400 leading-none truncate">{p.sku}</p>
        <p className="text-[11px] text-slate-400 truncate mt-0.5 leading-snug">{p.name}</p>
        <StatusDots hasStockPhoto={hasStockPhoto} hasBinPhoto={hasBinPhoto} />
      </div>
    </button>
  );
}

// ── Photo Strip ───────────────────────────────────────────────────────────────
function PhotoStrip({ photos, kind, sku, onUploaded, onDelete, onReplace }) {
  const [uploading,  setUploading]  = useState(false);
  const [editorOpen, setEditorOpen] = useState(null); // url being edited
  const fileRef = useRef();

  async function handleUpload(file) {
    if (!file || !sku) return;
    setUploading(true);
    try {
      const token = await getAuthToken();
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch(`/admin/save-photo-cloudinary/${encodeURIComponent(sku)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Falha no upload');
      onUploaded(kind, data.url);
    } catch (e) {
      alert('Erro no upload: ' + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      {/* Image editor modal */}
      {editorOpen && (
        <ImageEditor
          url={editorOpen}
          sku={sku}
          kind={kind}
          onSaved={newUrl => { onReplace && onReplace(kind, editorOpen, newUrl); }}
          onClose={() => setEditorOpen(null)}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <div key={i} className="relative group w-[88px] h-[88px] rounded-xl overflow-hidden border border-white/[0.08] bg-slate-800 shrink-0">
            <img src={url} alt="" className="w-full h-full object-contain p-0.5"
              onError={e => { e.target.style.opacity = '0.3'; }} />
            <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
              {/* Top row: ver + editar */}
              <div className="flex gap-1">
                <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors" title="Ver original">
                  <Eye size={11} />
                </a>
                <button onClick={e => { e.stopPropagation(); setEditorOpen(url); }}
                  className="p-1 rounded-md bg-blue-500/30 hover:bg-blue-500/50 text-blue-200 transition-colors" title="Editar imagem">
                  <Wand2 size={11} />
                </button>
                <button onClick={() => onDelete(kind, i)}
                  className="p-1 rounded-md bg-red-500/30 hover:bg-red-500/50 text-red-200 transition-colors" title="Remover">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {photos.length < 10 && (
          <>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-[88px] h-[88px] rounded-xl border-2 border-dashed border-slate-700 hover:border-emerald-500/60 hover:bg-emerald-500/[0.04] flex flex-col items-center justify-center gap-1 text-slate-700 hover:text-emerald-400 transition-all shrink-0 disabled:opacity-40">
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              <span className="text-[9px] font-semibold uppercase tracking-wide">{uploading ? 'Enviando' : 'Adicionar'}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => handleUpload(e.target.files?.[0])} />
          </>
        )}
      </div>
    </>
  );
}

// ── Bin Photo ─────────────────────────────────────────────────────────────────
function BinPhotoSlot({ url, sku, updatedAtMs, onUploaded, onDelete }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  async function handleUpload(file) {
    if (!file || !sku) return;
    setUploading(true);
    try {
      const token = await getAuthToken();
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'bin');
      const res = await fetch(`/admin/save-photo-cloudinary/${encodeURIComponent(sku)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Falha');
      onUploaded('bin', data.url);
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  const dateStr = updatedAtMs
    ? new Date(updatedAtMs).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="flex gap-3 items-start flex-wrap">
      {url && (
        <div className="relative group w-28 h-24 rounded-xl overflow-hidden border border-white/[0.08] bg-slate-800 shrink-0">
          <img src={url} alt="Prateleira" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <a href={url} target="_blank" rel="noreferrer"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"><Eye size={13} /></a>
            <button onClick={() => onDelete('bin', 0)}
              className="p-1.5 rounded-lg bg-red-500/30 hover:bg-red-500/50 text-red-200 transition-colors"><Trash2 size={13} /></button>
          </div>
          {dateStr && <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-slate-300 px-1.5 py-0.5">📅 {dateStr}</div>}
        </div>
      )}
      {!url && <div className="text-xs text-slate-600 self-center">Sem foto</div>}
      <>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex flex-col items-center justify-center gap-1 w-24 h-24 rounded-xl border-2 border-dashed border-slate-700 hover:border-amber-500/50 hover:bg-amber-500/[0.04] text-slate-600 hover:text-amber-400 transition-all shrink-0 disabled:opacity-40">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          <span className="text-[10px] font-medium">{uploading ? 'Enviando…' : url ? 'Atualizar' : 'Tirar foto'}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => handleUpload(e.target.files?.[0])} />
      </>
    </div>
  );
}

// ── Section Card ──────────────────────────────────────────────────────────────
function Section({ emoji, title, badge, right, children }) {
  return (
    <div className="rounded-xl border border-white/[0.07] overflow-hidden bg-slate-900/40">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05] bg-slate-900/60">
        {emoji && <span className="text-sm">{emoji}</span>}
        <span className="text-[11px] font-bold text-slate-300 tracking-wide">{title}</span>
        {badge && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase tracking-wider">
            {badge}
          </span>
        )}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Bling Data Grid ────────────────────────────────────────────────────────────
function BlingField({ label, value, warn }) {
  return (
    <div className="bg-slate-800/60 rounded-lg px-3 py-2.5 border border-white/[0.05]">
      <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{label}</p>
      <p className={`font-mono text-sm font-bold mt-0.5 ${warn ? 'text-amber-400' : value ? 'text-slate-200' : 'text-slate-700'}`}>
        {value || '—'}
      </p>
    </div>
  );
}

// ── Save Button ───────────────────────────────────────────────────────────────
function SaveBtn({ saving, saved, onClick, label = 'Salvar', size = 'sm' }) {
  const base = size === 'sm'
    ? 'px-3 py-1.5 text-xs rounded-lg'
    : 'px-4 py-2 text-sm rounded-xl w-full justify-center';
  return (
    <button onClick={onClick} disabled={saving}
      className={[
        `flex items-center gap-1.5 font-bold transition-all ${base}`,
        saved
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/25 active:scale-95',
      ].join(' ')}
    >
      {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <CheckCircle2 size={12} /> : <Save size={12} />}
      {saved ? 'Salvo ✓' : label}
    </button>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminProdutos() {
  const [searchParams] = useSearchParams();

  // ── Left panel ────────────────────────────────────────────────────────────
  const [leftTab,    setLeftTab]    = useState('produtos'); // 'produtos' | 'marcas'
  const [query,      setQuery]      = useState('');
  const [filter,     setFilter]     = useState(null);       // null | 'sem-foto' | 'sem-marca'
  const [results,    setResults]    = useState([]);
  const [allProds,   setAllProds]   = useState([]);
  const [loadingAll, setLoadingAll] = useState(true);
  const [searching,  setSearching]  = useState(false);
  const [navIdx,     setNavIdx]     = useState(-1);

  // ── Right panel ───────────────────────────────────────────────────────────
  const [produto,    setProduto]    = useState(null);
  const [loadingP,   setLoadingP]   = useState(false);

  // Editable state — saved independently per section
  const [binName,    setBinName]    = useState('');
  const [binPhoto,   setBinPhoto]   = useState('');
  const [notes,      setNotes]      = useState('');
  const [stockPhotos,setStockPhotos]= useState([]);
  const [boxPhotos,  setBoxPhotos]  = useState([]);
  const [updatedAtMs,setUpdatedAtMs]= useState(null);

  // Save states (per section)
  const [savingBin,  setSavingBin]  = useState(false);
  const [savedBin,   setSavedBin]   = useState(false);
  const [savingNotes,setSavingNotes]= useState(false);
  const [savedNotes, setSavedNotes] = useState(false);

  // ── Marcas tab ────────────────────────────────────────────────────────────
  const [semMarca,    setSemMarca]    = useState([]);
  const [marcasList,  setMarcasList]  = useState([]);
  const [loadingMarca,setLoadingMarca]= useState(false);
  const [marcaFilter, setMarcaFilter] = useState('');
  const [marcaPage,   setMarcaPage]   = useState(0);
  const MARCA_PER = 20;

  // ── Modal marca ───────────────────────────────────────────────────────────
  const [modalMarca, setModalMarca] = useState(false);
  const [marcaSel,   setMarcaSel]   = useState('');
  const [marcaNova,  setMarcaNova]  = useState('');
  const [savingMarca,setSavingMarca]= useState(false);

  // ── Embalagens ────────────────────────────────────────────────────────────
  const [embalagens, setEmbalagens] = useState([]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2800);
  }

  const debRef  = useRef(null);
  const activeResults = results.length ? results : allProds;

  // ── Load all products ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/products/all')
      .then(r => r.json())
      .then(d => setAllProds(Array.isArray(d) ? d : (d.items || [])))
      .catch(() => {})
      .finally(() => setLoadingAll(false));
    fetch('/embalagens/list')
      .then(r => r.json())
      .then(d => setEmbalagens(Array.isArray(d) ? d : (d.items || [])));
  }, []);

  // ── Auto-select via URL param ─────────────────────────────────────────────
  useEffect(() => {
    const sku = searchParams.get('sku');
    if (sku) selectProduct(decodeURIComponent(sku));
  }, []); // eslint-disable-line

  // ── Search ────────────────────────────────────────────────────────────────
  function handleQuery(v) {
    setQuery(v);
    setFilter(null);
    clearTimeout(debRef.current);
    if (v.trim().length < 2) { setResults([]); return; }
    debRef.current = setTimeout(() => doSearch(v.trim()), 280);
  }

  async function doSearch(q) {
    setSearching(true);
    try {
      const res  = await fetch(`/admin/products/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const items = data.items || [];
      setResults(items);
      const idx = items.findIndex(p => p.sku === produto?.sku);
      setNavIdx(idx);
    } catch {}
    setSearching(false);
  }

  async function applyFilter(f) {
    if (filter === f) { setFilter(null); setResults([]); return; }
    setFilter(f);
    setQuery('');
    setResults([]);
    setSearching(true);
    try {
      if (f === 'sem-foto') {
        const d = await fetch('/products/all').then(r => r.json());
        const all = Array.isArray(d) ? d : (d.items || []);
        const filtered = all.filter(p => !(p.stockPhotos?.length > 0) && !p.displayImage);
        setResults(filtered);
        setNavIdx(filtered.findIndex(p => p.sku === produto?.sku));
      } else if (f === 'sem-marca') {
        const d = await fetch('/products/sem-marca?limit=500').then(r => r.json());
        const items = d.items || [];
        setResults(items);
        setNavIdx(items.findIndex(p => p.sku === produto?.sku));
      }
    } catch {}
    setSearching(false);
  }

  // ── Select product ────────────────────────────────────────────────────────
  async function selectProduct(sku) {
    setLoadingP(true);
    setProduto(null);
    setSavedBin(false); setSavedNotes(false);
    try {
      const res  = await fetch(`/admin/products/${encodeURIComponent(sku)}`);
      const data = await res.json();
      const p    = data.item || data.produto || data;
      setProduto(p);
      const ov = p.override || {};
      setBinName(ov.customBinName || p.bin || '');
      setBinPhoto(ov.binPhoto || '');
      setNotes(ov.notes || '');
      setStockPhotos(ov.stockPhotos || []);
      setBoxPhotos(ov.boxPhotos || []);
      setUpdatedAtMs(ov.updatedAtMs || null);
      // sync nav index
      const list = results.length ? results : allProds;
      setNavIdx(list.findIndex(p2 => p2.sku === sku));
    } catch (e) {
      showToast('Erro ao carregar: ' + e.message, 'err');
    }
    setLoadingP(false);
  }

  function navProd(dir) {
    const list = activeResults;
    const next = navIdx + dir;
    if (next < 0 || next >= list.length) return;
    setNavIdx(next);
    selectProduct(list[next].sku);
  }

  // ── Save bin ──────────────────────────────────────────────────────────────
  async function saveBin() {
    if (!produto) return;
    setSavingBin(true);
    try {
      await apiFetch(`/admin/products/${encodeURIComponent(produto.sku)}`, {
        method: 'PATCH',
        body: JSON.stringify({ customBinName: binName }),
      });
      setSavedBin(true);
      showToast('Localização salva ✓');
      setTimeout(() => setSavedBin(false), 3000);
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
    setSavingBin(false);
  }

  // ── Save notes ────────────────────────────────────────────────────────────
  async function saveNotes() {
    if (!produto) return;
    setSavingNotes(true);
    try {
      await apiFetch(`/admin/products/${encodeURIComponent(produto.sku)}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
      });
      setSavedNotes(true);
      showToast('Notas salvas ✓');
      setTimeout(() => setSavedNotes(false), 3000);
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
    setSavingNotes(false);
  }

  // ── Photo callbacks ───────────────────────────────────────────────────────
  function onPhotoUploaded(kind, url) {
    if (kind === 'stock') { setStockPhotos(p => [...p, url]); }
    if (kind === 'box')   { setBoxPhotos(p => [...p, url]);   }
    if (kind === 'bin')   { setBinPhoto(url); }
    showToast('Foto salva ✓');
  }

  async function replacePhoto(kind, oldUrl, newUrl) {
    if (!produto) return;
    let patch = {};
    if (kind === 'stock') {
      const n = stockPhotos.map(u => u === oldUrl ? newUrl : u);
      patch.stockPhotos = n;
      setStockPhotos(n);
    }
    if (kind === 'box') {
      const n = boxPhotos.map(u => u === oldUrl ? newUrl : u);
      patch.boxPhotos = n;
      setBoxPhotos(n);
    }
    if (kind === 'bin') { patch.binPhoto = newUrl; setBinPhoto(newUrl); }
    try {
      await apiFetch(`/admin/products/${encodeURIComponent(produto.sku)}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      });
      showToast('Imagem atualizada ✓');
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
  }

  async function deletePhoto(kind, idx) {
    if (!produto) return;
    let patch = {};
    if (kind === 'bin')   { patch.binPhoto = ''; setBinPhoto(''); }
    if (kind === 'stock') { const n = stockPhotos.filter((_, i) => i !== idx); patch.stockPhotos = n; setStockPhotos(n); }
    if (kind === 'box')   { const n = boxPhotos.filter((_, i) => i !== idx);   patch.boxPhotos   = n; setBoxPhotos(n);   }
    try {
      await apiFetch(`/admin/products/${encodeURIComponent(produto.sku)}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      });
      showToast('Foto removida', 'info');
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
  }

  // ── Buscar fotos no Bling ────────────────────────────────────────────────
  const [blingImgs,       setBlingImgs]       = useState([]);
  const [loadingBlingImg, setLoadingBlingImg] = useState(false);
  const [blingImgOpen,    setBlingImgOpen]    = useState(true); // always open
  const [sendingToBling,  setSendingToBling]  = useState(false);

  async function fetchBlingImages() {
    if (!produto) return;
    setLoadingBlingImg(true); setBlingImgs([]);
    try {
      const ean = produto.ean || produto.eanBox;
      const q   = ean ? `ean=${encodeURIComponent(ean)}` : `sku=${encodeURIComponent(produto.sku)}`;
      const data = await apiFetch(`/bling/product-images?${q}`);
      setBlingImgs(data.images || []);
      if (!(data.images || []).length) showToast('Nenhuma imagem no Bling', 'info');
    } catch (e) {
      if (e.message?.includes('não autenticado')) showToast('Bling não conectado — acesse /bling/auth', 'err');
      else showToast('Erro: ' + e.message, 'err');
    }
    setLoadingBlingImg(false);
  }

  // Auto-fetch Bling images when product changes
  useEffect(() => {
    if (produto?.sku) fetchBlingImages();
  }, [produto?.sku]); // eslint-disable-line

  async function importBlingImage(url) {
    try {
      const token = await getAuthToken();
      const imgRes = await fetch(url);
      const blob   = await imgRes.blob();
      const fd = new FormData();
      fd.append('file', blob, 'bling_import.jpg');
      fd.append('kind', 'stock');
      const res  = await fetch(`/admin/save-photo-cloudinary/${encodeURIComponent(produto.sku)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      onPhotoUploaded('stock', data.url);
      showToast('Imagem importada do Bling ✓');
    } catch (e) { showToast('Erro ao importar: ' + e.message, 'err'); }
  }

  async function sendPhotosToBling() {
    if (!produto) return;
    const allLocal = [...stockPhotos, ...boxPhotos].filter(Boolean);
    if (!allLocal.length) { showToast('Nenhuma foto local para enviar', 'err'); return; }
    setSendingToBling(true);
    try {
      // Busca blingId do produto
      const ean = produto.ean || produto.eanBox;
      const q = ean ? `ean=${encodeURIComponent(ean)}` : `sku=${encodeURIComponent(produto.sku)}`;
      const searchData = await apiFetch(`/bling/product-images?${q}`);
      const blingProd = searchData.produtos?.[0];
      if (!blingProd?.id) throw new Error('Produto não encontrado no Bling');

      // Envia via PUT com as imagens externas
      const token = await getAuthToken();
      const res = await fetch(`/api/catalogo/produto/${blingProd.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagens: allLocal }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Falha ao enviar');
      showToast(`${allLocal.length} foto(s) enviada(s) ao Bling ✓`);
      fetchBlingImages(); // refresh
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
    setSendingToBling(false);
  }

  // ── Marca modal ───────────────────────────────────────────────────────────
  async function openMarcaModal() {
    if (!marcasList.length) {
      const d = await fetch('/products/marcas-list').then(r => r.json()).catch(() => ({}));
      setMarcasList(d.items || []);
    }
    setMarcaSel(produto?.marca || '');
    setMarcaNova('');
    setModalMarca(true);
  }

  async function saveMarca() {
    if (!produto) return;
    const marca = marcaSel === '__nova__' ? marcaNova.trim() : marcaSel.trim();
    if (!marca) { showToast('Selecione ou digite uma marca', 'err'); return; }
    setSavingMarca(true);
    try {
      await apiFetch(`/products/${encodeURIComponent(produto.sku)}/marca`, {
        method: 'PATCH', body: JSON.stringify({ marca }),
      });
      showToast(`Marca → "${marca}" ✓`);
      setProduto(p => ({ ...p, marca }));
      setModalMarca(false);
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
    setSavingMarca(false);
  }

  // ── Marcas Tab ────────────────────────────────────────────────────────────
  async function loadMarcasTab() {
    if (semMarca.length) return;
    setLoadingMarca(true);
    try {
      const [prodRes, marcasRes] = await Promise.all([
        fetch('/products/sem-marca?limit=500').then(r => r.json()),
        fetch('/products/marcas-list').then(r => r.json()),
      ]);
      setSemMarca(prodRes.items || []);
      setMarcasList(marcasRes.items || []);
    } catch {}
    setLoadingMarca(false);
  }

  function handleLeftTab(t) {
    setLeftTab(t);
    if (t === 'marcas') loadMarcasTab();
  }

  async function saveMarcaItem(sku, marca) {
    if (!marca) return;
    try {
      await apiFetch(`/products/${encodeURIComponent(sku)}/marca`, {
        method: 'PATCH', body: JSON.stringify({ marca }),
      });
      showToast(`"${marca}" salva ✓`);
      setSemMarca(p => p.filter(x => x.sku !== sku));
      if (!marcasList.find(m => m.marca === marca)) {
        setMarcasList(p => [{ marca, count: 1 }, ...p]);
      }
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
  }

  async function deleteProd(sku) {
    if (!confirm(`Deletar "${sku}" permanentemente?`)) return;
    try {
      const token = await getAuthToken();
      await fetch(`/products/${encodeURIComponent(sku)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      showToast(sku + ' deletado', 'info');
      setSemMarca(p => p.filter(x => x.sku !== sku));
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const listShown = (query.trim().length >= 2 || filter) ? results : allProds;
  const embsFit   = embalagens.filter(e => produto && embalagemFit(e, produto)).slice(0, 6);
  const score     = produto ? calcScore(produto) : 0;
  const thumbUrl  = produto?.displayImage || produto?.images?.[0] || stockPhotos[0] || null;

  const marcaFiltrada = semMarca.filter(p =>
    !marcaFilter || p.name.toLowerCase().includes(marcaFilter) || p.sku.toLowerCase().includes(marcaFilter)
  );
  const marcaPageItems = marcaFiltrada.slice(marcaPage * MARCA_PER, (marcaPage + 1) * MARCA_PER);
  const marcaTotalPages = Math.ceil(marcaFiltrada.length / MARCA_PER);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-slate-950 animate-fade-in">

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} position="center" />}

      {/* ══ ESQUERDA ══════════════════════════════════════════════════════════ */}
      <aside className="flex flex-col w-[260px] shrink-0 border-r border-white/[0.06] overflow-hidden bg-slate-950">

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-white/[0.05]">
          {[
            { id: 'produtos', label: 'Produtos' },
            { id: 'marcas',   label: 'Marcas', badge: semMarca.length || null },
          ].map(t => (
            <button key={t.id} onClick={() => handleLeftTab(t.id)}
              className={[
                'flex-1 py-2.5 text-[12px] font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5',
                leftTab === t.id
                  ? 'text-blue-400 border-blue-400'
                  : 'text-slate-600 border-transparent hover:text-slate-400',
              ].join(' ')}
            >
              {t.label}
              {t.badge > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── ABA: PRODUTOS ──────────────────────────────────────────────────── */}
        {leftTab === 'produtos' && (
          <>
            <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-white/[0.05] space-y-2">
              {/* Search */}
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                <input value={query} onChange={e => handleQuery(e.target.value)}
                  placeholder="SKU, EAN ou nome…"
                  className="w-full pl-7 pr-6 py-1.5 rounded-lg bg-slate-800 border border-white/[0.07] text-[12px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 transition-all" />
                {searching && <Loader2 size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 animate-spin" />}
                {query && !searching && (
                  <button onClick={() => { setQuery(''); setResults([]); setFilter(null); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Filtros */}
              <div className="flex gap-1">
                {[
                  { id: 'sem-foto',  label: 'Sem foto' },
                  { id: 'sem-marca', label: 'Sem marca' },
                ].map(f => (
                  <button key={f.id} onClick={() => applyFilter(f.id)}
                    className={[
                      'text-[10px] px-2.5 py-0.5 rounded-full border font-bold transition-colors',
                      filter === f.id
                        ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                        : 'bg-slate-800/60 text-slate-600 border-white/[0.06] hover:text-slate-400 hover:border-slate-600',
                    ].join(' ')}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Count + nav */}
              {listShown.length > 0 && (
                <div className="flex items-center justify-between text-[10px] text-slate-600">
                  <span>{listShown.length} produto{listShown.length !== 1 ? 's' : ''}</span>
                  {navIdx >= 0 && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => navProd(-1)} disabled={navIdx <= 0}
                        className="p-0.5 rounded disabled:opacity-30 hover:text-slate-300 transition-colors"><ChevronLeft size={13} /></button>
                      <span className="tabular-nums">{navIdx + 1} / {listShown.length}</span>
                      <button onClick={() => navProd(1)} disabled={navIdx >= listShown.length - 1}
                        className="p-0.5 rounded disabled:opacity-30 hover:text-slate-300 transition-colors"><ChevronRight size={13} /></button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-white/[0.03]">
              {loadingAll && !listShown.length && (
                <div className="space-y-px p-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex gap-2 p-2.5">
                      <div className="w-9 h-9 rounded-lg bg-white/[0.04] animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2 bg-white/[0.04] rounded animate-pulse w-1/3" />
                        <div className="h-2.5 bg-white/[0.03] rounded animate-pulse w-3/4" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!loadingAll && listShown.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-700">
                  <Package size={22} />
                  <p className="text-[11px]">Nenhum produto</p>
                </div>
              )}
              {listShown.map(p => (
                <ProdListItem key={p.sku} p={p}
                  active={p.sku === produto?.sku}
                  onClick={() => selectProduct(p.sku)} />
              ))}
            </div>
          </>
        )}

        {/* ── ABA: MARCAS ────────────────────────────────────────────────────── */}
        {leftTab === 'marcas' && (
          <>
            <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-white/[0.05] space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-bold">{semMarca.length} sem marca</span>
                <button onClick={() => { setSemMarca([]); setMarcasList([]); loadMarcasTab(); }}
                  className="text-slate-600 hover:text-slate-300 transition-colors">
                  <RefreshCw size={12} />
                </button>
              </div>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                <input value={marcaFilter} onChange={e => { setMarcaFilter(e.target.value.toLowerCase()); setMarcaPage(0); }}
                  placeholder="Filtrar…"
                  className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-slate-800 border border-white/[0.07] text-[12px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 transition-all" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingMarca && (
                <div className="flex items-center justify-center py-12 gap-2 text-slate-600">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-xs">Carregando…</span>
                </div>
              )}
              {!loadingMarca && marcaFiltrada.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-700">
                  <Tag size={22} />
                  <p className="text-[11px]">Todos com marca ✓</p>
                </div>
              )}
              <div className="divide-y divide-white/[0.03]">
                {marcaPageItems.map(p => (
                  <MarcaCard key={p.sku} p={p} marcasList={marcasList}
                    onSave={saveMarcaItem} onDelete={deleteProd} />
                ))}
              </div>
              {marcaTotalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-white/[0.05] text-[10px] text-slate-600">
                  <button disabled={marcaPage === 0} onClick={() => setMarcaPage(p => p - 1)}
                    className="p-1 rounded disabled:opacity-30 hover:text-slate-300 transition-colors"><ChevronLeft size={13} /></button>
                  <span>{marcaPage + 1} / {marcaTotalPages} ({marcaFiltrada.length})</span>
                  <button disabled={marcaPage >= marcaTotalPages - 1} onClick={() => setMarcaPage(p => p + 1)}
                    className="p-1 rounded disabled:opacity-30 hover:text-slate-300 transition-colors"><ChevronRight size={13} /></button>
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {/* ══ PAINEL DIREITO ══════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 overflow-y-auto">

        {/* Empty */}
        {!produto && !loadingP && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-700 p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-white/[0.05] flex items-center justify-center">
              {leftTab === 'marcas' ? <Tag size={26} /> : <Search size={26} />}
            </div>
            <p className="text-sm text-slate-500 font-medium">
              {leftTab === 'marcas' ? 'Normalização de marcas' : 'Selecione um produto'}
            </p>
            <p className="text-xs text-slate-700 max-w-xs">
              {leftTab === 'marcas'
                ? 'Produtos com marca vazia aparecem na lista ao lado. Selecione a marca e clique OK.'
                : 'Busque pelo SKU, EAN ou nome na lista ao lado.'}
            </p>
          </div>
        )}

        {/* Loading */}
        {loadingP && (
          <div className="p-5 max-w-2xl space-y-4">
            {[130, 90, 180, 80].map((h, i) => (
              <div key={i} className={`h-[${h}px] bg-white/[0.03] rounded-xl animate-pulse`} style={{ height: h }} />
            ))}
          </div>
        )}

        {/* ── Product Panel ────────────────────────────────────────────────── */}
        {produto && !loadingP && (
          <div className="max-w-2xl p-4 space-y-3 animate-fade-in pb-10">

            {/* ── Header ── */}
            <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-900 border border-white/[0.07]">
              <div className="w-20 h-20 rounded-xl bg-slate-800 border border-white/[0.07] overflow-hidden shrink-0">
                {thumbUrl
                  ? <img src={thumbUrl} alt="" className="w-full h-full object-contain p-1" />
                  : <div className="flex h-full items-center justify-center"><Image size={24} className="text-slate-700" /></div>
                }
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-slate-100 leading-snug">{produto.name}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {/* SKU */}
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
                  {binName && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <MapPin size={9}/>{binName}
                    </span>
                  )}
                  {produto.stock != null && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${
                      produto.stock === 0 ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      produto.stock < 5  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      'bg-slate-700/50 text-slate-400 border-white/[0.06]'}`}>
                      <Boxes size={9}/>{produto.stock}
                    </span>
                  )}
                  {/* Marca — clicável */}
                  <button onClick={openMarcaModal}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-700/40 text-slate-400 border border-dashed border-slate-600 hover:border-blue-500/50 hover:text-blue-400 transition-colors">
                    <Tag size={9}/>
                    {produto.marca || <span className="italic opacity-60">sem marca</span>}
                  </button>
                </div>

                {/* Checklist + score */}
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { ok: !!thumbUrl,                                          label: 'Foto'  },
                      { ok: !!produto.ean,                                        label: 'EAN'   },
                      { ok: !!(produto.width && produto.height && produto.depth), label: 'Dims'  },
                      { ok: !!produto.preco,                                      label: 'Preço' },
                      { ok: !!produto.weight,                                     label: 'Peso'  },
                    ].map(({ ok, label }) => (
                      <span key={label} className={`flex items-center gap-1 text-[10px] ${ok ? 'text-emerald-400' : 'text-slate-700'}`}>
                        <CheckCircle2 size={10} className={ok ? '' : 'opacity-0'} />
                        {!ok && <span className="w-2.5 h-2.5 rounded-full border border-slate-700 shrink-0 inline-block" />}
                        {label}
                      </span>
                    ))}
                  </div>
                  <span className={`ml-auto text-[11px] font-black tabular-nums ${score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {score}%
                  </span>
                </div>
              </div>
            </div>

            {/* ── Dados do Bling ── */}
            <Section emoji="📋" title="Dados do Bling" right={
              <span className="text-[10px] text-slate-700 italic">somente leitura — reimporte o CSV para atualizar</span>
            }>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <BlingField label="Peso líq."  value={fmtKg(produto.weight)}     warn={!produto.weight} />
                <BlingField label="Peso bruto" value={fmtKg(produto.weightBruto)} />
                <BlingField label="Largura"    value={fmtCm(produto.width)}      warn={!produto.width} />
                <BlingField label="Altura"     value={fmtCm(produto.height)}     warn={!produto.height} />
                <BlingField label="Profund."   value={fmtCm(produto.depth)}      warn={!produto.depth} />
                <BlingField label="Local Bling" value={produto.bin} />
                <BlingField label="Estoque"    value={produto.stock != null ? String(produto.stock) : null}
                  warn={produto.stock === 0} />
                <BlingField label="Itens/cx"   value={produto.itensPorCaixa ? String(produto.itensPorCaixa) : null} />
              </div>
              {(produto.preco || produto.precoCusto) && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <BlingField label="Preço"   value={fmtBrl(produto.preco)}      warn={!produto.preco} />
                  <BlingField label="Custo"   value={fmtBrl(produto.precoCusto)} />
                </div>
              )}
            </Section>

            {/* ── Localização ── */}
            <Section emoji="📍" title="Localização" badge="Sistema">
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">
                    Nome do local (prateleira, rua, caixa…)
                  </label>
                  <div className="flex gap-2">
                    <input value={binName} onChange={e => setBinName(e.target.value)}
                      placeholder="Ex: Rua A — Prateleira 2 — Caixa 3"
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-white/[0.07] text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/40 transition-all" />
                    <SaveBtn saving={savingBin} saved={savedBin} onClick={saveBin} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">
                    Foto da prateleira
                  </label>
                  <BinPhotoSlot
                    url={binPhoto} sku={produto.sku} updatedAtMs={updatedAtMs}
                    onUploaded={onPhotoUploaded} onDelete={deletePhoto}
                  />
                </div>
              </div>
            </Section>

            {/* ── Fotos do Bling ── */}
            <Section emoji="🔗" title="Fotos do Bling" badge="Bling"
              right={
                <button onClick={fetchBlingImages} disabled={loadingBlingImg}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/[0.06] text-blue-400 hover:bg-blue-500/15 transition-colors disabled:opacity-40">
                  {loadingBlingImg ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />}
                  Atualizar
                </button>
              }
            >
              {loadingBlingImg ? (
                <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-blue-400" /></div>
              ) : blingImgs.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {blingImgs.map((img, i) => (
                    <button key={i} onClick={() => importBlingImage(img.url)}
                      className="relative group w-[88px] h-[88px] rounded-lg overflow-hidden border border-blue-500/20 bg-slate-800 hover:border-blue-400/50 transition-colors"
                      title="Importar para o sistema local">
                      <img src={img.url} alt="" className="w-full h-full object-contain p-0.5" />
                      <div className="absolute inset-0 bg-blue-500/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5">
                        <Plus size={14} className="text-white" />
                        <span className="text-[8px] text-white font-bold">Importar</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600">Nenhuma imagem no Bling</p>
              )}
            </Section>

            {/* ── Fotos Locais (Sistema) ── */}
            <Section emoji="📦" title="Fotos Locais" badge="Sistema"
              right={
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-600">{stockPhotos.length + boxPhotos.length}/20</span>
                  <button onClick={sendPhotosToBling} disabled={sendingToBling || !(stockPhotos.length + boxPhotos.length)}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400 hover:bg-emerald-500/15 transition-colors disabled:opacity-40"
                    title="Enviar fotos locais para o Bling">
                    {sendingToBling ? <Loader2 size={9} className="animate-spin" /> : <ExternalLink size={9} />}
                    Enviar ao Bling
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">Produto (sem embalagem)</p>
                  <PhotoStrip photos={stockPhotos} kind="stock" sku={produto.sku}
                    onUploaded={onPhotoUploaded} onDelete={deletePhoto} onReplace={replacePhoto} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">Produto embalado</p>
                  <PhotoStrip photos={boxPhotos} kind="box" sku={produto.sku}
                    onUploaded={onPhotoUploaded} onDelete={deletePhoto} onReplace={replacePhoto} />
                </div>
              </div>
            </Section>

            {/* ── Notas Operacionais ── */}
            <Section emoji="📝" title="Notas Operacionais" badge="Sistema">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">
                  Notas para o separador (aparece no pedido)
                </label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  placeholder="Ex: Produto frágil — embalar com bolha."
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-white/[0.07] text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-emerald-500/40 transition-all leading-relaxed" />
                <SaveBtn saving={savingNotes} saved={savedNotes} onClick={saveNotes} label="Salvar notas" />
              </div>
            </Section>

            {/* ── Embalagens Compatíveis ── */}
            <Section emoji="🎁" title="Embalagens Compatíveis"
              right={
                <Link to="/expedicao/insumos" className="text-[11px] text-blue-400 hover:text-blue-300 font-bold transition-colors">
                  Gerenciar →
                </Link>
              }
            >
              {!produto.width || !produto.height ? (
                <p className="text-xs text-slate-600">Produto sem dimensões no Bling — impossível sugerir embalagens.</p>
              ) : embsFit.length === 0 ? (
                <p className="text-xs text-slate-600">
                  Nenhuma embalagem compatível com {produto.width}×{produto.height}×{produto.depth || '?'} cm.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {embsFit.map((e, i) => {
                    const stock = e.stock ?? e.estoque ?? 0;
                    const sc = stock <= e.stockMin ? 'text-red-400' : stock <= (e.stockMin || 0) * 1.5 ? 'text-amber-400' : 'text-emerald-400';
                    const dims = [e.width, e.height, e.depth].filter(Boolean).join('×');
                    return (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/60 border border-white/[0.05]">
                        <span className="text-lg">{e.type === 'saco' ? '🛍️' : '📦'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-slate-300 truncate">{e.name}</p>
                          {dims && <p className="text-[10px] text-slate-600">{dims} cm</p>}
                        </div>
                        <span className={`text-[11px] font-bold tabular-nums ${sc}`}>Estq: {stock}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

          </div>
        )}
      </div>

      {/* ══ MODAL MARCA ═══════════════════════════════════════════════════════ */}
      {modalMarca && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalMarca(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-slate-900 border border-white/[0.08] shadow-2xl p-5 space-y-4 animate-scale-in">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Tag size={14} className="text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-100">Editar Marca</p>
                <p className="text-[10px] text-slate-600 font-mono">{produto?.sku}</p>
              </div>
              <button onClick={() => setModalMarca(false)} className="ml-auto text-slate-600 hover:text-slate-300 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Selecionar</label>
              <select value={marcaSel} onChange={e => setMarcaSel(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-white/[0.07] text-sm text-slate-200 focus:outline-none focus:border-blue-500/40 transition-all">
                <option value="">— Selecionar —</option>
                <option value="__nova__">+ Nova marca…</option>
                <optgroup label="Cadastradas">
                  {marcasList.map(m => <option key={m.marca} value={m.marca}>{m.marca}</option>)}
                </optgroup>
              </select>
              {marcaSel === '__nova__' && (
                <input value={marcaNova} onChange={e => setMarcaNova(e.target.value)}
                  placeholder="Nome da nova marca"
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-white/[0.07] text-sm text-slate-200 focus:outline-none focus:border-blue-500/40 transition-all mt-2"
                  autoFocus />
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setModalMarca(false)}
                className="flex-1 py-2 rounded-xl border border-white/[0.08] text-slate-500 hover:text-slate-300 text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={saveMarca} disabled={savingMarca}
                className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50">
                {savingMarca ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MarcaCard ────────────────────────────────────────────────────────────────
function MarcaCard({ p, marcasList, onSave, onDelete }) {
  const [sel,  setSel]  = useState('');
  const [nova, setNova] = useState('');
  const [saving, setSaving] = useState(false);
  const img = p.displayImage || p.images?.[0] || null;

  async function handle() {
    const marca = sel === '__nova__' ? nova.trim() : sel.trim();
    if (!marca) return;
    setSaving(true);
    await onSave(p.sku, marca);
    setSaving(false);
  }

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-slate-800 border border-white/[0.06] overflow-hidden shrink-0">
          {img ? <img src={img} alt="" className="w-full h-full object-contain" />
               : <div className="flex h-full items-center justify-center"><Image size={13} className="text-slate-700" /></div>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-blue-400 leading-none truncate">{p.sku}</p>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">{p.name}</p>
        </div>
        <button onClick={() => onDelete(p.sku)} className="text-slate-700 hover:text-red-400 transition-colors p-1 shrink-0">
          <Trash2 size={11} />
        </button>
      </div>
      <div className="flex gap-1.5">
        <select value={sel} onChange={e => { setSel(e.target.value); if (e.target.value !== '__nova__') setNova(''); }}
          className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-slate-800 border border-white/[0.07] text-[11px] text-slate-300 focus:outline-none focus:border-blue-500/40 transition-all">
          <option value="">— marca —</option>
          <option value="__nova__">+ Nova…</option>
          {marcasList.map(m => <option key={m.marca} value={m.marca}>{m.marca}</option>)}
        </select>
        <button onClick={handle} disabled={saving || !sel}
          className="px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[11px] font-bold disabled:opacity-30 hover:bg-blue-500/25 transition-colors shrink-0">
          {saving ? '…' : 'OK'}
        </button>
      </div>
      {sel === '__nova__' && (
        <input value={nova} onChange={e => setNova(e.target.value)} placeholder="Nova marca"
          className="w-full px-2 py-1 rounded-lg bg-slate-800 border border-white/[0.07] text-[11px] text-slate-200 focus:outline-none focus:border-blue-500/40 transition-all" />
      )}
    </div>
  );
}
