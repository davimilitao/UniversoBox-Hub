/**
 * @file CatalogoPro.jsx
 * @description Catálogo unificado: grid inteligente + painel studio lateral.
 *              Combina catálogo.html + produto-studio.html em React.
 * @version 1.0.0
 * @date 2026-04-04
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAuthToken } from '../../utils/getAuthToken';
import {
  Search, LayoutGrid, LayoutList, SlidersHorizontal, X, ChevronRight,
  Package, Image, Tag, Weight, Ruler, DollarSign, Barcode,
  AlertTriangle, CheckCircle2, Circle, ExternalLink, RefreshCw,
  Upload, Star, Eye, MapPin, Layers, Filter, ChevronDown, ChevronUp,
  Boxes, FlaskConical, Zap, TrendingUp,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API_BASE = '';

function apiHeaders() {
  const token = localStorage.getItem('expedicao_token') || '';
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

function parseTags(raw = '') {
  const marcas = new Set();
  const mods   = new Set();
  const grupos = new Set();
  const MOD_KEYS = ['FLEX', 'FULL', 'Agência', 'Agencia'];
  raw.split(',').map(t => t.trim()).filter(Boolean).forEach(t => {
    if (MOD_KEYS.some(m => t.toLowerCase() === m.toLowerCase())) mods.add(t);
    else if (t.length <= 3 && t === t.toUpperCase()) marcas.add(t);
    else grupos.add(t);
  });
  return { marcas, mods, grupos };
}

function calcScore(p) {
  let s = 0;
  if (p.displayImage || (p.images && p.images.length > 0)) s += 25;
  if (p.ean)                                                 s += 20;
  if (p.width && p.height && p.depth)                       s += 20;
  if (p.preco)                                               s += 20;
  if (p.weight)                                              s += 15;
  return s;
}

function hasPhoto(p) {
  return !!(p.displayImage || (p.images && p.images.length > 0) || (p.stockPhotos && p.stockPhotos.length > 0));
}

function fmtBrl(v) {
  if (!v) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDims(p) {
  if (!p.width || !p.height || !p.depth) return null;
  return `${p.width}×${p.height}×${p.depth} cm`;
}

// ─── Score Badge ──────────────────────────────────────────────────────────────
function ScoreBadge({ score, size = 'sm' }) {
  const color = score >= 80 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
              : score >= 50 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
              :               'text-red-400 border-red-500/30 bg-red-500/10';
  const sz = size === 'lg' ? 'text-base px-3 py-1.5' : 'text-[10px] px-1.5 py-0.5';
  return (
    <span className={`font-bold rounded-md border tabular-nums ${color} ${sz}`}>
      {score}%
    </span>
  );
}

// ─── Completion Checklist Item ────────────────────────────────────────────────
function CheckItem({ ok, label }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${ok ? 'text-emerald-400' : 'text-slate-500'}`}>
      {ok
        ? <CheckCircle2 size={13} className="shrink-0" />
        : <Circle size={13} className="shrink-0 text-slate-600" />}
      <span>{label}</span>
    </div>
  );
}

// ─── Completion Ring (SVG circular) ──────────────────────────────────────────
function ScoreRing({ score }) {
  const r = 22, c = 28, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={56} height={56} viewBox="0 0 56 56">
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
      <circle
        cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`}
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text x={c} y={c + 1} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={11} fontWeight="700">
        {score}%
      </text>
    </svg>
  );
}

// ─── Product Card (Grid Mode) ─────────────────────────────────────────────────
function ProductCard({ produto, selected, onClick }) {
  const score = calcScore(produto);
  const foto  = produto.displayImage || (produto.images?.[0]) || null;

  return (
    <button
      onClick={onClick}
      className={[
        'group relative flex flex-col rounded-xl border overflow-hidden text-left',
        'transition-all duration-150 cursor-pointer hover:shadow-lg hover:shadow-black/30',
        selected
          ? 'border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/30'
          : 'border-white/[0.07] bg-slate-900 hover:border-white/15',
      ].join(' ')}
    >
      {/* Foto */}
      <div className="relative w-full aspect-square bg-slate-800 overflow-hidden">
        {foto
          ? <img src={foto} alt={produto.name} className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" />
          : (
            <div className="flex items-center justify-center h-full">
              <Image size={32} className="text-slate-700" />
            </div>
          )
        }
        {/* Score badge top-right */}
        <div className="absolute top-1.5 right-1.5">
          <ScoreBadge score={score} />
        </div>
        {/* Alerts */}
        {!hasPhoto(produto) && (
          <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded bg-red-500/90 flex items-center justify-center" title="Sem foto">
            <Image size={11} className="text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-3 gap-1.5">
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider leading-none">{produto.sku}</p>
        <p className="text-xs font-medium text-slate-200 leading-snug line-clamp-2">{produto.name}</p>
        <div className="flex items-center justify-between mt-auto pt-1.5">
          <span className="text-[10px] text-slate-500">
            {produto.stock != null ? `Estoque: ${produto.stock}` : 'Sem estoque'}
          </span>
          {produto.preco
            ? <span className="text-[10px] font-semibold text-emerald-400">{fmtBrl(produto.preco)}</span>
            : <span className="text-[10px] text-slate-600 italic">sem preço</span>
          }
        </div>
      </div>
    </button>
  );
}

// ─── Product Row (List Mode) ──────────────────────────────────────────────────
function ProductRow({ produto, selected, onClick }) {
  const score = calcScore(produto);
  const foto  = produto.displayImage || (produto.images?.[0]) || null;

  return (
    <button
      onClick={onClick}
      className={[
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left',
        'transition-colors duration-100 cursor-pointer',
        selected
          ? 'bg-emerald-500/10 border border-emerald-500/20'
          : 'border border-transparent hover:bg-white/[0.03]',
      ].join(' ')}
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-lg bg-slate-800 overflow-hidden shrink-0">
        {foto
          ? <img src={foto} alt="" className="w-full h-full object-contain p-1" />
          : <div className="flex items-center justify-center h-full"><Image size={18} className="text-slate-700" /></div>
        }
      </div>

      {/* SKU + Nome */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono text-slate-500 uppercase">{produto.sku}</p>
        <p className="text-xs text-slate-200 truncate">{produto.name}</p>
      </div>

      {/* Marca */}
      <span className="hidden md:block text-[10px] text-slate-500 w-16 truncate shrink-0">{produto.marca || '—'}</span>

      {/* Estoque */}
      <span className={`hidden sm:block text-xs w-16 text-right shrink-0 tabular-nums ${
        produto.stock === 0 ? 'text-red-400' : produto.stock < 5 ? 'text-amber-400' : 'text-slate-400'
      }`}>
        {produto.stock ?? '—'}
      </span>

      {/* Preço */}
      <span className="hidden md:block text-xs text-emerald-400 w-20 text-right shrink-0 tabular-nums">
        {fmtBrl(produto.preco)}
      </span>

      {/* Score */}
      <div className="shrink-0">
        <ScoreBadge score={score} />
      </div>

      <ChevronRight size={14} className="text-slate-600 shrink-0" />
    </button>
  );
}

// ─── Studio Panel (detalhe lateral) ──────────────────────────────────────────
function StudioPanel({ produto, onClose }) {
  const [tab, setTab] = useState('info'); // info | fotos | bling
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const score = calcScore(produto);

  const fotos = [
    ...(produto.images      || []),
    ...(produto.stockPhotos || []),
  ].filter(Boolean);

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', 'stock');
    try {
      const token = await getAuthToken();
      const r = await fetch(`/admin/save-photo-cloudinary/${produto.sku}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await r.json();
      if (data.ok) {
        alert('Foto enviada! Recarregue o catálogo para ver.');
      } else {
        alert(data.error || 'Erro no upload');
      }
    } catch (err) {
      alert('Erro ao enviar foto: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  const TABS = [
    { id: 'info',  label: 'Informações' },
    { id: 'fotos', label: 'Fotos' },
    { id: 'bling', label: 'Bling' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-white/[0.07] min-w-0">

      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b border-white/[0.07] shrink-0">
        {/* Foto thumb */}
        <div className="w-16 h-16 rounded-xl bg-slate-800 overflow-hidden shrink-0">
          {(produto.displayImage || produto.images?.[0])
            ? <img src={produto.displayImage || produto.images[0]} alt="" className="w-full h-full object-contain p-1" />
            : <div className="flex items-center justify-center h-full"><Image size={22} className="text-slate-700" /></div>
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{produto.sku}</p>
          <p className="text-sm font-semibold text-slate-100 leading-snug mt-0.5 line-clamp-2">{produto.name}</p>
          {produto.marca && (
            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">{produto.marca}</span>
          )}
        </div>

        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 mt-0.5">
          <X size={16} />
        </button>
      </div>

      {/* Score + Checklist compacto */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.07] bg-slate-800/40 shrink-0">
        <ScoreRing score={score} />
        <div className="flex flex-col gap-1">
          <CheckItem ok={hasPhoto(produto)}                         label="Foto" />
          <CheckItem ok={!!produto.ean}                             label="EAN" />
          <CheckItem ok={!!(produto.width && produto.height && produto.depth)} label="Dimensões" />
          <CheckItem ok={!!produto.preco}                           label="Preço" />
          <CheckItem ok={!!produto.weight}                          label="Peso" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.07] shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              tab === t.id
                ? 'text-emerald-400 border-b-2 border-emerald-500'
                : 'text-slate-500 hover:text-slate-300',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── INFO ── */}
        {tab === 'info' && (
          <div className="p-4 space-y-4">

            {/* Dados básicos */}
            <section className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Dados</p>
              <InfoRow icon={Barcode}     label="EAN"        value={produto.ean || '—'} />
              <InfoRow icon={Tag}         label="Preço"      value={fmtBrl(produto.preco)} />
              <InfoRow icon={Weight}      label="Peso"       value={produto.weight ? `${produto.weight} kg` : '—'} />
              <InfoRow icon={Ruler}       label="Dimensões"  value={fmtDims(produto) || '—'} />
              <InfoRow icon={MapPin}      label="Bin"        value={produto.bin || produto.customBinName || '—'} />
              <InfoRow icon={Boxes}       label="Estoque"    value={produto.stock != null ? produto.stock : '—'}
                valueClass={produto.stock === 0 ? 'text-red-400' : produto.stock < 5 ? 'text-amber-400' : 'text-slate-300'}
              />
            </section>

            {/* Tags */}
            {produto.tagsRaw && (
              <section className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {produto.tagsRaw.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 border border-white/5">
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Ações */}
            <section className="space-y-2 pt-2">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Ações</p>
              <Link
                to={`/catalogo/admin?sku=${encodeURIComponent(produto.sku)}`}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                <ExternalLink size={13} />
                Editar no Admin
              </Link>
            </section>
          </div>
        )}

        {/* ── FOTOS ── */}
        {tab === 'fotos' && (
          <div className="p-4 space-y-4">
            {fotos.length > 0
              ? (
                <div className="grid grid-cols-2 gap-2">
                  {fotos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={url} alt={`foto ${i + 1}`}
                        className="w-full aspect-square object-contain rounded-lg bg-slate-800 p-1 hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              )
              : (
                <div className="flex flex-col items-center justify-center py-8 gap-3 text-slate-600">
                  <Image size={36} />
                  <p className="text-xs">Nenhuma foto cadastrada</p>
                </div>
              )
            }

            {/* Upload */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-600 hover:border-emerald-500/50 text-slate-500 hover:text-emerald-400 text-xs transition-colors disabled:opacity-50"
            >
              <Upload size={14} />
              {uploading ? 'Enviando…' : 'Enviar nova foto'}
            </button>
          </div>
        )}

        {/* ── BLING ── */}
        {tab === 'bling' && (
          <div className="p-4 space-y-4">
            <InfoRow icon={Tag}    label="SKU"        value={produto.sku} />
            <InfoRow icon={Barcode} label="EAN Box"   value={produto.eanBox || '—'} />
            <InfoRow icon={Zap}    label="Situação"   value={produto.situacao || '—'} />

            <div className="rounded-lg bg-slate-800/60 border border-white/5 p-3">
              <p className="text-xs text-slate-400 mb-2 font-medium">Publicar no Bling</p>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                A sincronização com o Bling será ativada em breve.
                Por enquanto edite diretamente via Admin Produtos.
              </p>
              <Link
                to={`/catalogo/admin?sku=${encodeURIComponent(produto.sku)}`}
                className="mt-3 flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors"
              >
                <ExternalLink size={13} />
                Abrir Admin
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, valueClass = 'text-slate-300' }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={12} className="text-slate-600 shrink-0" />
      <span className="text-[11px] text-slate-500 w-20 shrink-0">{label}</span>
      <span className={`text-[11px] font-medium flex-1 min-w-0 truncate ${valueClass}`}>{value}</span>
    </div>
  );
}

// ─── Filter Chip ──────────────────────────────────────────────────────────────
function Chip({ label, active, onClick, color = 'emerald' }) {
  const colors = {
    emerald: active ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-500 border-white/[0.07] hover:border-slate-600',
    amber:   active ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'       : 'bg-slate-800 text-slate-500 border-white/[0.07] hover:border-slate-600',
    red:     active ? 'bg-red-500/20 text-red-300 border-red-500/40'             : 'bg-slate-800 text-slate-500 border-white/[0.07] hover:border-slate-600',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-medium transition-all ${colors[color]}`}
    >
      {active && <X size={9} />}
      {label}
    </button>
  );
}

// ─── CatalogoPro (Main) ───────────────────────────────────────────────────────
export default function CatalogoPro() {
  const [produtos, setProdutos]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [erro, setErro]               = useState(null);
  const [busca, setBusca]             = useState('');
  const [viewMode, setViewMode]       = useState('grid'); // grid | list
  const [selected, setSelected]       = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filtros activos
  const [filtros, setFiltros] = useState({
    semFoto: false, semEan: false, semDims: false, semPreco: false, estoqueZero: false,
    marca: null, modalidade: null, grupo: null,
  });

  // Opções dinâmicas
  const [marcasOpts,  setMarcasOpts]  = useState([]);
  const [gruposOpts,  setGruposOpts]  = useState([]);

  // ── Carregamento ──────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch('/products/all', { headers: apiHeaders() });
      const data = await r.json();
      const items = Array.isArray(data) ? data : (data.items || []);

      // Enriquecer com tags parseadas
      const enrich = items.map(p => {
        const { marcas, mods, grupos } = parseTags(p.tagsRaw || '');
        return { ...p, _marcas: marcas, _mods: mods, _grupos: grupos };
      });

      // Extrair opções únicas
      const allMarcas = new Set();
      const allGrupos = new Set();
      enrich.forEach(p => {
        p._marcas.forEach(m => allMarcas.add(m));
        p._grupos.forEach(g => allGrupos.add(g));
      });
      setMarcasOpts([...allMarcas].sort());
      setGruposOpts([...allGrupos].sort());
      setProdutos(enrich);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Filtrar ───────────────────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    let arr = produtos;

    // Busca textual
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      arr = arr.filter(p =>
        p.sku?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q) ||
        p.ean?.toLowerCase().includes(q) ||
        p.eanBox?.toLowerCase().includes(q) ||
        p.marca?.toLowerCase().includes(q)
      );
    }

    // Filtros inteligentes
    if (filtros.semFoto)      arr = arr.filter(p => !hasPhoto(p));
    if (filtros.semEan)       arr = arr.filter(p => !p.ean);
    if (filtros.semDims)      arr = arr.filter(p => !p.width || !p.height || !p.depth);
    if (filtros.semPreco)     arr = arr.filter(p => !p.preco);
    if (filtros.estoqueZero)  arr = arr.filter(p => p.stock === 0 || p.stock == null);

    // Filtros categorias
    if (filtros.marca)        arr = arr.filter(p => p._marcas.has(filtros.marca) || p.marca === filtros.marca);
    if (filtros.modalidade)   arr = arr.filter(p => p._mods.has(filtros.modalidade));
    if (filtros.grupo)        arr = arr.filter(p => p._grupos.has(filtros.grupo));

    return arr;
  }, [produtos, busca, filtros]);

  // ── Estatísticas rápidas ──────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:      produtos.length,
    semFoto:    produtos.filter(p => !hasPhoto(p)).length,
    semEan:     produtos.filter(p => !p.ean).length,
    semPreco:   produtos.filter(p => !p.preco).length,
    estoqueZero: produtos.filter(p => p.stock === 0).length,
    avgScore:   produtos.length ? Math.round(produtos.reduce((a, p) => a + calcScore(p), 0) / produtos.length) : 0,
  }), [produtos]);

  function toggleFiltro(key) {
    setFiltros(f => ({ ...f, [key]: !f[key] }));
  }
  function setCategoria(key, value) {
    setFiltros(f => ({ ...f, [key]: f[key] === value ? null : value }));
  }
  function limparFiltros() {
    setFiltros({ semFoto: false, semEan: false, semDims: false, semPreco: false, estoqueZero: false, marca: null, modalidade: null, grupo: null });
    setBusca('');
  }

  const filtrosAtivos = Object.values(filtros).filter(Boolean).length + (busca ? 1 : 0);

  const MODALIDADES = ['FLEX', 'FULL', 'Agência'];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-slate-950 animate-fade-in">

      {/* ── Coluna principal ─────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="shrink-0 flex items-center gap-3 px-4 h-14 border-b border-white/[0.06] bg-slate-900">
          <div className="w-7 h-7 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Layers size={14} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-slate-100 leading-none">Catálogo Pro</h1>
            {!loading && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                {filtrados.length} de {stats.total} produtos · Score médio: <span className="text-emerald-400 font-semibold">{stats.avgScore}%</span>
              </p>
            )}
          </div>

          {/* Controles */}
          <div className="flex items-center gap-2">
            <button
              onClick={carregar}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-colors disabled:opacity-50"
              title="Recarregar"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-colors"
              title={viewMode === 'grid' ? 'Modo lista' : 'Modo grade'}
            >
              {viewMode === 'grid' ? <LayoutList size={14} /> : <LayoutGrid size={14} />}
            </button>
          </div>
        </header>

        {/* Stats rápidas */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] bg-slate-900/50 overflow-x-auto">
          <StatPill label="Sem foto"    value={stats.semFoto}     active={filtros.semFoto}    onClick={() => toggleFiltro('semFoto')}    color="red" />
          <StatPill label="Sem EAN"     value={stats.semEan}      active={filtros.semEan}     onClick={() => toggleFiltro('semEan')}     color="amber" />
          <StatPill label="Sem preço"   value={stats.semPreco}    active={filtros.semPreco}   onClick={() => toggleFiltro('semPreco')}   color="amber" />
          <StatPill label="Estoque zero" value={stats.estoqueZero} active={filtros.estoqueZero} onClick={() => toggleFiltro('estoqueZero')} color="red" />
        </div>

        {/* Barra de busca + filtros */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
          {/* Search */}
          <div className="flex-1 relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por SKU, nome, EAN, marca…"
              className="w-full pl-8 pr-4 py-2 rounded-lg bg-slate-800 border border-white/[0.07] text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
          </div>

          {/* Filtros toggle */}
          <button
            onClick={() => setFiltersOpen(f => !f)}
            className={[
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
              filtrosAtivos > 0
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-white/[0.07] hover:border-slate-600',
            ].join(' ')}
          >
            <Filter size={12} />
            Filtros
            {filtrosAtivos > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">
                {filtrosAtivos}
              </span>
            )}
            {filtersOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {filtrosAtivos > 0 && (
            <button
              onClick={limparFiltros}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Painel de filtros expansível */}
        {filtersOpen && (
          <div className="shrink-0 px-4 py-3 border-b border-white/[0.04] bg-slate-900/40 space-y-3">

            {/* Alertas */}
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-2 font-semibold">Pendências</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip label="Sem foto"       active={filtros.semFoto}     onClick={() => toggleFiltro('semFoto')}     color="red" />
                <Chip label="Sem EAN"        active={filtros.semEan}      onClick={() => toggleFiltro('semEan')}      color="amber" />
                <Chip label="Sem dimensões"  active={filtros.semDims}     onClick={() => toggleFiltro('semDims')}     color="amber" />
                <Chip label="Sem preço"      active={filtros.semPreco}    onClick={() => toggleFiltro('semPreco')}    color="amber" />
                <Chip label="Estoque zero"   active={filtros.estoqueZero} onClick={() => toggleFiltro('estoqueZero')} color="red" />
              </div>
            </div>

            {/* Modalidade */}
            <div>
              <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-2 font-semibold">Modalidade</p>
              <div className="flex flex-wrap gap-1.5">
                {MODALIDADES.map(m => (
                  <Chip key={m} label={m} active={filtros.modalidade === m} onClick={() => setCategoria('modalidade', m)} />
                ))}
              </div>
            </div>

            {/* Marcas */}
            {marcasOpts.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-2 font-semibold">Marca</p>
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {marcasOpts.map(m => (
                    <Chip key={m} label={m} active={filtros.marca === m} onClick={() => setCategoria('marca', m)} />
                  ))}
                </div>
              </div>
            )}

            {/* Grupos */}
            {gruposOpts.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-2 font-semibold">Grupo / Categoria</p>
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {gruposOpts.map(g => (
                    <Chip key={g} label={g} active={filtros.grupo === g} onClick={() => setCategoria('grupo', g)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Lista / Grid de produtos */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
              <RefreshCw size={24} className="animate-spin" />
              <p className="text-sm">Carregando catálogo…</p>
            </div>
          )}

          {erro && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400">
              <AlertTriangle size={28} />
              <p className="text-sm">Erro ao carregar: {erro}</p>
              <button onClick={carregar} className="text-xs text-slate-400 hover:text-white underline">
                Tentar novamente
              </button>
            </div>
          )}

          {!loading && !erro && filtrados.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 p-8">
              <Package size={36} />
              <p className="text-sm text-center">Nenhum produto encontrado com os filtros atuais.</p>
              <button onClick={limparFiltros} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                Limpar filtros
              </button>
            </div>
          )}

          {!loading && !erro && filtrados.length > 0 && (
            viewMode === 'grid'
              ? (
                <div className="p-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                  {filtrados.map(p => (
                    <ProductCard
                      key={p.sku}
                      produto={p}
                      selected={selected?.sku === p.sku}
                      onClick={() => setSelected(p.sku === selected?.sku ? null : p)}
                    />
                  ))}
                </div>
              )
              : (
                <div className="p-3 space-y-0.5">
                  {/* Cabeçalho lista */}
                  <div className="hidden sm:flex items-center gap-3 px-3 pb-1 text-[10px] text-slate-600 font-semibold uppercase tracking-widest">
                    <div className="w-12 shrink-0" />
                    <span className="flex-1">Produto</span>
                    <span className="hidden md:block w-16 shrink-0">Marca</span>
                    <span className="hidden sm:block w-16 text-right shrink-0">Estoque</span>
                    <span className="hidden md:block w-20 text-right shrink-0">Preço</span>
                    <span className="w-10 shrink-0">Score</span>
                    <div className="w-4 shrink-0" />
                  </div>
                  {filtrados.map(p => (
                    <ProductRow
                      key={p.sku}
                      produto={p}
                      selected={selected?.sku === p.sku}
                      onClick={() => setSelected(p.sku === selected?.sku ? null : p)}
                    />
                  ))}
                </div>
              )
          )}
        </div>
      </div>

      {/* ── Studio Panel (painel lateral) ───────────────────────────────── */}
      {selected && (
        <div className="hidden lg:flex w-80 xl:w-96 shrink-0 overflow-hidden h-full">
          <StudioPanel produto={selected} onClose={() => setSelected(null)} />
        </div>
      )}

      {/* Mobile: drawer do studio */}
      {selected && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative ml-auto w-[90vw] max-w-sm h-full overflow-hidden flex">
            <StudioPanel produto={selected} onClose={() => setSelected(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat Pill (barra de stats) ───────────────────────────────────────────────
function StatPill({ label, value, active, onClick, color = 'amber' }) {
  if (!value) return null;
  const colors = {
    amber: active ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800/60 text-slate-400 border-white/[0.06] hover:border-amber-500/30',
    red:   active ? 'bg-red-500/20 text-red-300 border-red-500/40'       : 'bg-slate-800/60 text-slate-400 border-white/[0.06] hover:border-red-500/30',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border font-medium transition-all whitespace-nowrap ${colors[color]}`}
    >
      <AlertTriangle size={10} />
      {value} {label}
    </button>
  );
}
