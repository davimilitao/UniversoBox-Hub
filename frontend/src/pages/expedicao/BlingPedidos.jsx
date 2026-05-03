/**
 * @file BlingPedidos.jsx
 * @module expedicao
 * @description Pedidos do Bling — NFs de saída autorizadas.
 *              Range picker com presets, filtros por canal e DANFE,
 *              fotos de produto lazy-load, toggle Flex, fluxo para expedição.
 * @version 2.4.0
 * @date 2026-05-03
 * @changelog
 *   2.4.0 — Substitui /api/ml/dashboard (Firebase auth) por /bling/venda-info (sem auth);
 *           Flex/logística detectados via Bling diretamente — funciona no terminal de expedição.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Zap, CalendarDays, RefreshCw, Unplug, Plug,
  ChevronDown, ChevronUp, PackagePlus, CheckCircle2,
  AlertTriangle, Clock, XCircle, Loader2, Inbox,
  Tag, Hash, ChevronLeft, ChevronRight, Flame, ExternalLink,
  Package, ShoppingBag, CheckSquare, Square, Truck, Warehouse,
  BarChart2, TrendingUp, TrendingDown,
} from 'lucide-react';

// ─── helpers de data ──────────────────────────────────────────────────────────
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Usa componentes locais — evita bug de fuso UTC (toISOString sempre retorna UTC)
function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n); // construtor local — sem UTC shift
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function fmtBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtMesAno(ano, mes) {
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${MESES[mes]} ${ano}`;
}

function diasNoMes(ano, mes) { return new Date(ano, mes + 1, 0).getDate(); }
function primeiroDiaSemana(ano, mes) { return new Date(ano, mes, 1).getDay(); }

// ─── DANFE ───────────────────────────────────────────────────────────────────
function isSemDanfe(sit) {
  return (sit || '').toLowerCase().includes('sem danfe');
}
function isComDanfe(sit) {
  if (isSemDanfe(sit)) return false;
  const s = (sit || '').toLowerCase();
  return s.includes('emitida') || s.includes('danfe');
}

// ─── localStorage ─────────────────────────────────────────────────────────────
function getClonados() {
  try { return new Set(JSON.parse(localStorage.getItem('bling_clonados') || '[]')); }
  catch { return new Set(); }
}
function addClonado(id) {
  const s = getClonados(); s.add(String(id));
  localStorage.setItem('bling_clonados', JSON.stringify([...s]));
}

// ─── Canais ───────────────────────────────────────────────────────────────────
const CANAIS = [
  { id: 'all',    label: 'Todas',   cor: 'slate'  },
  { id: 'ml',     label: 'ML',      cor: 'yellow' },
  { id: 'mlfull', label: 'ML Full', cor: 'blue'   },
  { id: 'shopee', label: 'Shopee',  cor: 'orange' },
  { id: 'magalu', label: 'Magalu',  cor: 'purple' },
  { id: 'tiktok', label: 'TikTok',  cor: 'pink'   },
];

// ─── Badge de modalidade ML (Flex / Full / Agência) ───────────────────────────
function ModalidadeBadge({ tipo }) {
  if (tipo === 'flex') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-amber-400/15 text-amber-400 border border-amber-400/30 leading-none">
        <Flame size={10}/> FLEX
      </span>
    );
  }
  if (tipo === 'fulfillment') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 leading-none">
        <Warehouse size={10}/> FULL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-blue-500/15 text-blue-300 border border-blue-500/30 leading-none">
      <Truck size={10}/> AGÊNCIA
    </span>
  );
}

function matchCanal(canalId, mkt) {
  const m = (mkt || '').toLowerCase();
  switch (canalId) {
    case 'ml':     return (m.includes('mercado') || m.includes('ml')) && !m.includes('full');
    case 'mlfull': return m.includes('full');
    case 'shopee': return m.includes('shopee');
    case 'magalu': return m.includes('magalu');
    case 'tiktok': return m.includes('tiktok');
    default:       return true;
  }
}

const COR_CANAL = {
  yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  blue:   'bg-blue-500/10   text-blue-400   border-blue-500/30',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  pink:   'bg-pink-500/10   text-pink-400   border-pink-500/30',
  slate:  'bg-slate-700/50  text-slate-400  border-slate-600',
};

function canalCor(mkt) {
  const m = (mkt || '').toLowerCase();
  if (m.includes('full'))                        return COR_CANAL.blue;
  if (m.includes('mercado') || m.includes('ml')) return COR_CANAL.yellow;
  if (m.includes('shopee'))                      return COR_CANAL.orange;
  if (m.includes('magalu'))                      return COR_CANAL.purple;
  if (m.includes('tiktok'))                      return COR_CANAL.pink;
  return COR_CANAL.slate;
}

// ─── Badge situação ───────────────────────────────────────────────────────────
function SituacaoBadge({ sit }) {
  if (isSemDanfe(sit))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/25 whitespace-nowrap"><Clock size={10}/> Sem DANFE</span>;
  if (isComDanfe(sit))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 whitespace-nowrap"><CheckCircle2 size={10}/> DANFE OK</span>;
  if ((sit||'').toLowerCase().includes('cancelada'))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/25 whitespace-nowrap"><XCircle size={10}/> Cancelada</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-700 text-slate-400 border border-slate-600 whitespace-nowrap">{sit||'—'}</span>;
}

// ─── Thumbnail de produto — lazy load via Catálogo ────────────────────────────
const _imgCache = {};

function ProductThumb({ produtoId }) {
  const [url, setUrl] = useState(_imgCache[produtoId] ?? null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!produtoId || url !== null) return;
    fetch(`/api/catalogo/produto/${produtoId}`)
      .then(r => r.json())
      .then(d => {
        const u = (d.imagens && d.imagens[0]) || '';
        _imgCache[produtoId] = u;
        setUrl(u);
      })
      .catch(() => { _imgCache[produtoId] = ''; setUrl(''); });
  }, [produtoId, url]);

  if (!produtoId || err || url === '') {
    return (
      <div className="shrink-0 w-12 h-12 rounded-xl bg-slate-800 border border-white/5 flex items-center justify-center">
        <Package size={16} className="text-slate-700" />
      </div>
    );
  }
  if (url === null) {
    return <div className="shrink-0 w-12 h-12 rounded-xl bg-slate-800 border border-white/5 animate-pulse" />;
  }
  return (
    <img
      src={url}
      alt=""
      className="shrink-0 w-12 h-12 rounded-xl object-cover border border-white/10 bg-slate-800"
      onError={() => setErr(true)}
    />
  );
}

// ─── Range Picker ─────────────────────────────────────────────────────────────
const PRESETS = [
  { id: 'hoje',   label: 'Hoje'            },
  { id: 'ontem',  label: 'Ontem'           },
  { id: '3dias',  label: 'Últimos 3 dias'  },
  { id: '7dias',  label: 'Última semana'   },
  { id: '15dias', label: 'Últimos 15 dias' },
  { id: 'mes',    label: 'Este mês'        },
  { id: 'custom', label: 'Personalizado'   },
];

function calcPreset(id) {
  const h = isoHoje();
  switch (id) {
    case 'hoje':   return { ini: h,              fim: h              };
    case 'ontem':  return { ini: addDias(h,-1),  fim: addDias(h,-1)  };
    case '3dias':  return { ini: addDias(h,-2),  fim: h              };
    case '7dias':  return { ini: addDias(h,-6),  fim: h              };
    case '15dias': return { ini: addDias(h,-14), fim: h              };
    case 'mes': {
      const d = new Date();
      const ini = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
      return { ini, fim: h };
    }
    default: return null;
  }
}

function MiniCal({ ano, mes, rangeIni, rangeFim, hoverDate, onDay, onHover }) {
  const total  = diasNoMes(ano, mes);
  const offset = primeiroDiaSemana(ano, mes);
  const DIAS   = ['D','S','T','Q','Q','S','S'];

  function iso(d) {
    return `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  function classDay(d) {
    const date  = iso(d);
    const fim   = hoverDate && !rangeFim ? hoverDate : rangeFim;
    const start = rangeIni && fim ? (rangeIni <= fim ? rangeIni : fim) : rangeIni;
    const end   = rangeIni && fim ? (rangeIni <= fim ? fim : rangeIni) : fim;
    const isStart = date === start;
    const isEnd   = date === end;
    const inRange = start && end && date > start && date < end;
    const isToday = date === isoHoje();
    let cls = 'w-8 h-8 flex items-center justify-center text-xs rounded-full cursor-pointer select-none transition-colors ';
    if (isStart || isEnd)  cls += 'bg-emerald-500 text-white font-semibold ';
    else if (inRange)      cls += 'bg-emerald-500/15 text-emerald-300 rounded-none ';
    else if (isToday)      cls += 'border border-emerald-500/50 text-emerald-400 hover:bg-slate-700 ';
    else                   cls += 'text-slate-300 hover:bg-slate-700 ';
    return cls;
  }

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 mb-1">
        {DIAS.map((d,i) => (
          <div key={i} className="w-8 h-6 flex items-center justify-center text-[10px] font-medium text-slate-600">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => (
          <div key={i} className="flex items-center justify-center">
            {d ? (
              <div className={classDay(d)} onClick={() => onDay(iso(d))}
                onMouseEnter={() => onHover && onHover(iso(d))}>{d}</div>
            ) : <div className="w-8 h-8"/>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RangePicker({ ini, fim, onConfirm }) {
  const [preset,    setPreset]    = useState('3dias');
  const [tempIni,   setTempIni]   = useState(ini);
  const [tempFim,   setTempFim]   = useState(fim);
  const [hoverDate, setHoverDate] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const hoje = new Date();
  const [mesEsq, setMesEsq] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() - 1 < 0 ? 11 : hoje.getMonth() - 1 });
  const [mesDir, setMesDir] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });

  function navEsq(dir) {
    setMesEsq(p => { let m = p.mes + dir, a = p.ano; if (m<0){m=11;a--;} if(m>11){m=0;a++;} return {ano:a,mes:m}; });
  }
  function navDir(dir) {
    setMesDir(p => { let m = p.mes + dir, a = p.ano; if (m<0){m=11;a--;} if(m>11){m=0;a++;} return {ano:a,mes:m}; });
  }

  function handlePreset(id) {
    setPreset(id);
    if (id !== 'custom') {
      const r = calcPreset(id);
      if (r) { setTempIni(r.ini); setTempFim(r.fim); setSelecting(null); }
    } else { setSelecting('ini'); }
  }

  function handleDay(date) {
    if (preset !== 'custom') { setPreset('custom'); setTempIni(date); setTempFim(null); setSelecting('fim'); return; }
    if (!selecting || selecting === 'ini') { setTempIni(date); setTempFim(null); setSelecting('fim'); }
    else {
      if (date < tempIni) { setTempFim(tempIni); setTempIni(date); }
      else { setTempFim(date); }
      setSelecting(null);
    }
  }

  const labelRange = tempIni && tempFim
    ? tempIni === tempFim ? fmtBR(tempIni) : `${fmtBR(tempIni)} → ${fmtBR(tempFim)}`
    : tempIni ? `${fmtBR(tempIni)} → ...` : '—';

  return (
    <div className="flex bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
      <div className="w-44 border-r border-white/5 p-3 flex flex-col gap-0.5">
        {PRESETS.map(p => (
          <button key={p.id} onClick={() => handlePreset(p.id)}
            className={`text-left text-sm px-3 py-1.5 rounded-lg transition-colors
              ${preset === p.id ? 'bg-emerald-500/15 text-emerald-400 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex-1 rounded-lg border px-3 py-1.5 text-sm text-center transition-colors ${selecting==='ini' ? 'border-emerald-500 text-emerald-400' : 'border-white/10 text-slate-300'}`}>
            {fmtBR(tempIni) || 'Início'}
          </div>
          <span className="text-slate-600 text-xs">→</span>
          <div className={`flex-1 rounded-lg border px-3 py-1.5 text-sm text-center transition-colors ${selecting==='fim' ? 'border-emerald-500 text-emerald-400' : 'border-white/10 text-slate-300'}`}>
            {fmtBR(tempFim) || 'Fim'}
          </div>
        </div>
        <div className="flex gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => navEsq(-1)} className="p-1 text-slate-500 hover:text-slate-300"><ChevronLeft size={14}/></button>
              <span className="text-xs font-medium text-slate-300 w-28 text-center">{fmtMesAno(mesEsq.ano, mesEsq.mes)}</span>
              <button onClick={() => navEsq(1)} className="p-1 text-slate-500 hover:text-slate-300"><ChevronRight size={14}/></button>
            </div>
            <MiniCal {...mesEsq} rangeIni={tempIni} rangeFim={tempFim} hoverDate={hoverDate}
              onDay={handleDay} onHover={d => selecting==='fim' && setHoverDate(d)} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => navDir(-1)} className="p-1 text-slate-500 hover:text-slate-300"><ChevronLeft size={14}/></button>
              <span className="text-xs font-medium text-slate-300 w-28 text-center">{fmtMesAno(mesDir.ano, mesDir.mes)}</span>
              <button onClick={() => navDir(1)} className="p-1 text-slate-500 hover:text-slate-300"><ChevronRight size={14}/></button>
            </div>
            <MiniCal {...mesDir} rangeIni={tempIni} rangeFim={tempFim} hoverDate={hoverDate}
              onDay={handleDay} onHover={d => selecting==='fim' && setHoverDate(d)} />
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-xs text-slate-500">{labelRange}</span>
          <div className="flex gap-2">
            <button onClick={() => onConfirm(ini, fim)}
              className="px-4 py-1.5 rounded-lg text-sm border border-white/10 text-slate-400 hover:text-slate-200 transition-colors">
              Cancelar
            </button>
            <button onClick={() => onConfirm(tempIni, tempFim || tempIni)} disabled={!tempIni}
              className="px-4 py-1.5 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold transition-colors">
              Filtrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Cards resumo ─────────────────────────────────────────────────────────────
function ResumoCard({ label, valor, sub, cor = 'slate' }) {
  const cores = { slate:'text-slate-300', amber:'text-amber-400', emerald:'text-emerald-400', blue:'text-blue-400' };
  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 px-4 py-3 flex flex-col gap-1">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${cores[cor]}`}>{valor}</p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </div>
  );
}

// ─── Row de item (dentro da NF expandida) ─────────────────────────────────────
function ItemRow({ it }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-900/70 border border-white/5 p-2.5 hover:border-white/10 transition-colors">
      {/* Foto */}
      <ProductThumb produtoId={it.produtoId} />

      {/* Nome + SKU */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 leading-snug line-clamp-2">{it.nome || '—'}</p>
        <div className="mt-1">
          {it.sku
            ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Tag size={9}/>{it.sku}
              </span>
            : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <AlertTriangle size={9}/>Sem SKU
              </span>
          }
        </div>
      </div>

      {/* Quantidade — destaque visual */}
      <div className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-slate-800 border border-white/5">
        <span className="text-[10px] text-slate-600 font-medium uppercase tracking-wide leading-none mb-0.5">Qtd</span>
        <span className="text-2xl font-black text-white tabular-nums leading-none">{it.qty}</span>
      </div>

      {/* Preço unitário */}
      <div className="shrink-0 text-right w-20">
        <p className="text-[10px] text-slate-600 mb-0.5">Unit.</p>
        <p className="text-sm text-slate-400 tabular-nums">{BRL.format(it.preco)}</p>
      </div>
    </div>
  );
}

// ─── Row de NF ────────────────────────────────────────────────────────────────
function NFRow({
  nf, clonados, onClonar, onExpand, expandido, detalhe, expandindo,
  isFlex, onFlexToggle, clonando,
  mlLogistica, // 'flex' | 'fulfillment' | 'agency' | null (resolvido após expand)
  isSelected, onToggleSelect, selectionMode,
}) {
  const jaCriado = clonados.has(String(nf.id));
  const eClonar  = clonando === nf.id;
  const isFull   = mlLogistica === 'fulfillment';

  return (
    <div className={`rounded-xl border transition-all ${
      expandido ? 'bg-slate-800 border-white/10 shadow-lg'
      : isSelected ? 'bg-emerald-950/20 border-emerald-500/30'
      : 'bg-slate-800/50 border-white/5 hover:border-white/10'
    } ${isFull && !expandido ? 'opacity-60' : ''}`}>

      {/* ── Linha principal ── */}
      <div className="w-full flex items-center gap-3 px-4 py-3.5">
        {/* Checkbox seleção em lote */}
        {!jaCriado && !isFull && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(nf.id); }}
            className="shrink-0 p-1 -ml-1 text-slate-500 hover:text-emerald-400"
            title={isSelected ? 'Desmarcar' : 'Selecionar para lote'}
          >
            {isSelected ? <CheckSquare size={16} className="text-emerald-400"/> : <Square size={16}/>}
          </button>
        )}
        {(jaCriado || isFull) && <span className="w-5 shrink-0"/>}

        <button className="flex-1 flex items-center gap-3 text-left min-w-0" onClick={() => onExpand(nf.id)}>
        {/* Número */}
        <span className="text-xs font-mono text-slate-500 w-16 shrink-0">#{nf.numero}</span>

        {/* Canal */}
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${canalCor(nf.marketplace)}`}>
          {nf.marketplace || '?'}
        </span>

        {/* Cliente */}
        <span className="flex-1 text-sm text-slate-300 truncate font-medium">{nf.cliente?.nome || '—'}</span>

        {/* Valor */}
        <span className="hidden sm:block text-sm tabular-nums text-slate-400 w-28 text-right shrink-0">
          {detalhe?.valorTotal ? BRL.format(detalhe.valorTotal) : '—'}
        </span>

        {/* Data */}
        <span className="hidden md:block text-xs text-slate-600 w-20 text-right shrink-0">{fmtBR(nf.dataEmissao)}</span>

        {/* Status */}
        <div className="shrink-0"><SituacaoBadge sit={nf.situacao} /></div>

        {/* Modalidade ML (só quando resolvida via expand) */}
        {mlLogistica && <div className="shrink-0"><ModalidadeBadge tipo={mlLogistica}/></div>}

        {/* Já importado */}
        {jaCriado && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={10}/> No sistema
          </span>
        )}

        {/* Chevron */}
        <div className="shrink-0 text-slate-600 ml-1">
          {expandindo ? <Loader2 size={15} className="animate-spin"/> : expandido ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
        </div>
        </button>
      </div>

      {/* ── Painel expandido ── */}
      {expandido && detalhe && (
        <div className="border-t border-white/5 px-4 py-4 space-y-4">

          {/* Número do pedido na loja + modalidade */}
          <div className="flex items-center gap-3 flex-wrap">
            {detalhe.numeroPedido && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Hash size={11} className="shrink-0"/>
                Pedido na loja:
                <span className="font-mono text-slate-300">{detalhe.numeroPedido}</span>
              </div>
            )}
            {mlLogistica && <ModalidadeBadge tipo={mlLogistica}/>}
            {isFull && (
              <span className="text-[11px] text-indigo-300/80">
                Mercado Livre envia pelo Full — não precisa criar pedido interno.
              </span>
            )}
          </div>

          {/* ── Itens ── */}
          {detalhe.itens?.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <ShoppingBag size={10}/> {detalhe.itens.length} {detalhe.itens.length === 1 ? 'item' : 'itens'}
              </p>
              {detalhe.itens.map((it, i) => <ItemRow key={i} it={it} />)}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Nenhum item encontrado nesta NF.</p>
          )}

          {/* ── Rodapé: total + ações ── */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-white/5">

            {/* Total + Flex */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-slate-600">Total</span>
                <span className="text-lg font-bold text-white tabular-nums">
                  {detalhe.valorTotal ? BRL.format(detalhe.valorTotal) : '—'}
                </span>
              </div>

              {/* Flex toggle */}
              {!jaCriado && (
                <button
                  onClick={() => onFlexToggle(nf.id)}
                  title="Marcar como Flex / Entrega Rápida — sobe para o topo na separação"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors
                    ${isFlex
                      ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400'
                      : 'bg-slate-800 border-white/10 text-slate-500 hover:text-slate-300'}`}
                >
                  <Flame size={12} className={isFlex ? 'text-yellow-400' : ''} />
                  {isFlex ? 'FLEX — Entrega Rápida' : 'Marcar Flex'}
                </button>
              )}
            </div>

            {/* Ação principal */}
            {isFull ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                <Warehouse size={14}/> Envio pelo Full — sem ação necessária
              </span>
            ) : jaCriado ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 size={14}/> Pedido criado
                </span>
                <a href="/pedidos"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-slate-700 border border-white/10 text-slate-300 hover:text-white transition-colors">
                  <ExternalLink size={13}/> Ver na expedição
                </a>
              </div>
            ) : (
              <button
                onClick={() => onClonar(nf, detalhe)}
                disabled={!detalhe.itens?.length || eClonar}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white shadow-lg shadow-emerald-500/20 transition-all"
              >
                {eClonar
                  ? <><Loader2 size={15} className="animate-spin"/> Criando…</>
                  : <><PackagePlus size={15}/> Criar Pedido na Expedição</>
                }
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Relatório comparativo de períodos ────────────────────────────────────────
function RelatorioPanel({ atual, anterior, rangeIni, rangeFim, onClose }) {
  function calcStats(lista) {
    const porMkt = {};
    let semDanfe = 0;
    for (const nf of lista) {
      const m = nf.marketplace || 'Outros';
      porMkt[m] = (porMkt[m] || 0) + 1;
      if (isSemDanfe(nf.situacao)) semDanfe++;
    }
    return { total: lista.length, porMkt, semDanfe };
  }

  const s1 = calcStats(atual);
  const s2 = calcStats(anterior);

  const [y1,m1,d1] = rangeIni.split('-').map(Number);
  const [y2,m2,d2] = rangeFim.split('-').map(Number);
  const dur     = Math.round((new Date(y2,m2-1,d2) - new Date(y1,m1-1,d1)) / 86400000);
  const prevFim = addDias(rangeIni, -1);
  const prevIni = addDias(prevFim, -dur);

  function Delta({ a, b }) {
    if (!b) return null;
    const pct = Math.round((a - b) / b * 100);
    const up = pct >= 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
        {up ? '+' : ''}{pct}%
      </span>
    );
  }

  const allMkts = [...new Set([...Object.keys(s1.porMkt), ...Object.keys(s2.porMkt)])];

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 mb-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-blue-400"/>
          <h3 className="font-bold text-slate-200">Relatório Comparativo</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-3 text-[11px] text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/>Atual: {fmtBR(rangeIni)} → {fmtBR(rangeFim)}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500 inline-block"/>Anterior: {fmtBR(prevIni)} → {fmtBR(prevFim)}</span>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors"><XCircle size={16}/></button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl bg-slate-900/60 border border-white/5 p-3">
          <p className="text-[11px] text-slate-500 mb-1">Total pedidos</p>
          <p className="text-2xl font-black text-slate-100 tabular-nums">{s1.total}</p>
          {s2.total > 0 && <Delta a={s1.total} b={s2.total}/>}
          {s2.total > 0 && <span className="text-[10px] text-slate-600 ml-1">vs {s2.total}</span>}
        </div>
        <div className="rounded-xl bg-slate-900/60 border border-white/5 p-3">
          <p className="text-[11px] text-slate-500 mb-1">Sem DANFE</p>
          <p className="text-2xl font-black text-amber-400 tabular-nums">{s1.semDanfe}</p>
          {s2.total > 0 && <span className="text-[10px] text-slate-600">Anterior: {s2.semDanfe}</span>}
        </div>
        <div className="rounded-xl bg-slate-900/60 border border-white/5 p-3 col-span-2 sm:col-span-1">
          <p className="text-[11px] text-slate-500 mb-1">Período</p>
          <p className="text-sm font-bold text-slate-300">{dur + 1} dia{dur !== 0 ? 's' : ''}</p>
          <p className="text-[10px] text-slate-600">{dur > 0 ? `Média: ${(s1.total / (dur + 1)).toFixed(1)}/dia` : 'Dia único'}</p>
        </div>
      </div>

      {/* Tabela por marketplace */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/5">
              <th className="text-left py-2 pr-4">Marketplace</th>
              <th className="text-right py-2 px-3 text-emerald-400">Atual</th>
              <th className="text-right py-2 px-3 text-slate-500">Anterior</th>
              <th className="text-right py-2 pl-3">Variação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {allMkts.sort((a,b) => (s1.porMkt[b]||0)-(s1.porMkt[a]||0)).map(mkt => {
              const c1 = s1.porMkt[mkt] || 0;
              const c2 = s2.porMkt[mkt] || 0;
              return (
                <tr key={mkt} className="text-slate-300 hover:bg-white/[0.02]">
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${canalCor(mkt)}`}>{mkt}</span>
                  </td>
                  <td className="text-right py-2 px-3 font-bold tabular-nums">{c1}</td>
                  <td className="text-right py-2 px-3 text-slate-500 tabular-nums">{c2}</td>
                  <td className="text-right py-2 pl-3">
                    {c2 > 0 ? <Delta a={c1} b={c2}/> : <span className="text-[11px] text-slate-600">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export function BlingPedidos() {
  const defaultRange = calcPreset('3dias');

  const [status,      setStatus]      = useState(null);
  const [rangeIni,    setRangeIni]    = useState(defaultRange.ini);
  const [rangeFim,    setRangeFim]    = useState(defaultRange.fim);
  const [showPicker,  setShowPicker]  = useState(false);
  const [canalSel,    setCanalSel]    = useState('all');
  const [situacaoSel, setSituacaoSel] = useState('all');
  const [nfs,         setNfs]         = useState([]);
  const [loadingNfs,  setLoadingNfs]  = useState(false);
  const [erro,        setErro]        = useState(null);
  const [expandidos,  setExpandidos]  = useState({});
  const [expandindo,  setExpandindo]  = useState(null);
  const [clonados,    setClonados]    = useState(getClonados);
  const [clonando,    setClonando]    = useState(null);
  const [flexFlags,   setFlexFlags]   = useState({});
  const [toast,       setToast]       = useState(null);
  // Modalidade resolvida por NF — preenchido via /bling/venda-info (sem Firebase auth)
  const [nfLogistica, setNfLogistica] = useState({});
  // Seleção em lote — Set de blingNfId
  const [selectedIds,       setSelectedIds]       = useState(() => new Set());
  const [lotePronto,        setLotePronto]        = useState(null);
  const [showRelatorio,     setShowRelatorio]     = useState(false);
  const [relatorioAnterior, setRelatorioAnterior] = useState(null);
  const [loadingRelatorio,  setLoadingRelatorio]  = useState(false);
  const pollingRef = useRef(null);
  const pickerRef  = useRef(null);

  // Fecha picker ao clicar fora
  useEffect(() => {
    function handler(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Status polling
  const fetchStatus = useCallback(async () => {
    try { const r = await fetch('/bling/status'); setStatus(await r.json()); } catch {}
  }, []);

  // Nenhuma chamada ao /api/ml/dashboard — logística vem direto do Bling via /bling/venda-info

  useEffect(() => {
    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 30_000);
    return () => clearInterval(pollingRef.current);
  }, [fetchStatus]);

  // Buscar NFs — canal sempre "all", filtragem local
  const fetchNFs = useCallback(async () => {
    setLoadingNfs(true); setErro(null);
    try {
      const params = new URLSearchParams({ dataInicio: rangeIni, dataFim: rangeFim, loja: 'all' });
      const res  = await fetch(`/bling/pedidos?${params}`);
      const data = await res.json();
      if (data.error === 'bling_not_authorized') {
        setErro('Bling não autorizado. Conecte sua conta.'); setNfs([]); return;
      }
      setNfs(data.items || []);
      setExpandidos({});
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoadingNfs(false);
    }
  }, [rangeIni, rangeFim]);

  useEffect(() => { fetchNFs(); }, [fetchNFs]);

  // Busca logística direto do Bling para cada NF da lista (sem Firebase auth — funciona no terminal)
  useEffect(() => {
    if (!nfs.length) return;
    let cancel = false;

    const nfsComPedido = nfs.filter(nf => nf.numeroPedido);
    if (!nfsComPedido.length) return;

    Promise.allSettled(
      nfsComPedido.map(nf =>
        fetch(`/bling/venda-info/${encodeURIComponent(nf.numeroPedido)}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => (data ? { nfId: nf.id, ...data } : null))
          .catch(() => null)
      )
    ).then(results => {
      if (cancel) return;
      const logisticaMap = {};
      const flexMap      = {};
      for (const r of results) {
        const val = r.status === 'fulfilled' ? r.value : null;
        if (!val?.nfId || !val.logistica) continue;
        logisticaMap[val.nfId] = val.logistica;
        if (val.logistica === 'flex') flexMap[val.nfId] = true;
      }
      if (Object.keys(logisticaMap).length) {
        setNfLogistica(prev => ({ ...prev, ...logisticaMap }));
      }
      if (Object.keys(flexMap).length) {
        setFlexFlags(prev => ({ ...prev, ...flexMap }));
      }
    });

    return () => { cancel = true; };
  }, [nfs]);

  function handleRangeConfirm(ini, fim) {
    setRangeIni(ini); setRangeFim(fim); setShowPicker(false);
  }

  async function handleExpand(id) {
    if (expandidos[id]) { setExpandidos(p => { const n={...p}; delete n[id]; return n; }); return; }
    setExpandindo(id);
    try {
      const res  = await fetch(`/bling/pedidos/${id}`);
      const data = await res.json();
      setExpandidos(p => ({ ...p, [id]: data.item }));
      // Logística já resolvida pelo useEffect via /bling/venda-info — sem ação extra aqui
    } catch (e) { showToast(`Erro ao carregar itens: ${e.message}`, 'err'); }
    finally { setExpandindo(null); }
  }

  function handleToggleSelect(nfId) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(nfId)) n.delete(nfId); else n.add(nfId);
      return n;
    });
  }

  function clearSelection() { setSelectedIds(new Set()); }

  // Criar em lote — expande cada NF se necessário, depois chama handleClonar em série
  async function handleClonarLote() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setLotePronto({ total: ids.length, concluidos: 0, erros: 0 });
    for (const id of ids) {
      const nf = nfs.find(n => n.id === id);
      if (!nf) continue;
      // Garante detalhe carregado
      let detalhe = expandidos[id];
      if (!detalhe) {
        try {
          const res = await fetch(`/bling/pedidos/${id}`);
          const data = await res.json();
          detalhe = data.item;
          setExpandidos(p => ({ ...p, [id]: detalhe }));
        } catch {
          setLotePronto(p => ({ ...p, erros: p.erros + 1, concluidos: p.concluidos + 1 }));
          continue;
        }
      }
      // Pula Fulfillment (não clona — estoque já está no CD do marketplace)
      if (nfLogistica[id] === 'fulfillment') {
        setLotePronto(p => ({ ...p, concluidos: p.concluidos + 1 }));
        continue;
      }
      try {
        await handleClonar(nf, detalhe);
        setLotePronto(p => ({ ...p, concluidos: p.concluidos + 1 }));
      } catch {
        setLotePronto(p => ({ ...p, erros: p.erros + 1, concluidos: p.concluidos + 1 }));
      }
    }
    setTimeout(() => { setLotePronto(null); clearSelection(); }, 2500);
  }

  function handleFlexToggle(nfId) {
    setFlexFlags(prev => ({ ...prev, [nfId]: !prev[nfId] }));
  }

  async function handleClonar(nf, detalhe) {
    setClonando(nf.id);
    try {
      const logistica = flexFlags[nf.id] ? 'flex' : 'agency';
      const res  = await fetch('/bling/clonar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blingNfId:    nf.id,
          marketplace:  nf.marketplace,
          itens:        detalhe.itens,
          clienteNome:  nf.cliente?.nome || '',
          numeroPedido: detalhe.numeroPedido || '',
          mlOrderId:    detalhe.mlOrderId   || null,
          logistica,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha');
      addClonado(nf.id); setClonados(getClonados());
      let msg = `✅ Pedido ${data.orderId} criado${logistica === 'flex' ? ' — 🔥 FLEX' : ''}!`;
      if (data.skusFaltando?.length) msg += ` ⚠️ SKUs: ${data.skusFaltando.join(', ')}`;
      showToast(msg, 'ok', data.orderId);
    } catch (e) { showToast(`Erro: ${e.message}`, 'err'); }
    finally { setClonando(null); }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar o Bling?')) return;
    await fetch('/bling/disconnect', { method: 'POST' });
    fetchStatus();
  }

  function showToast(msg, tipo = 'ok', orderId = null) {
    setToast({ msg, tipo, orderId });
    setTimeout(() => setToast(null), 5000);
  }

  // Filtro local
  const nfsFiltradas = useMemo(() => {
    let lista = nfs;
    if (canalSel !== 'all')          lista = lista.filter(n => matchCanal(canalSel, n.marketplace));
    if (situacaoSel === 'sem_danfe') lista = lista.filter(n => isSemDanfe(n.situacao));
    if (situacaoSel === 'danfe')     lista = lista.filter(n => isComDanfe(n.situacao));
    return lista;
  }, [nfs, canalSel, situacaoSel]);

  // Resumo
  const resumo = useMemo(() => {
    const total      = nfs.length;
    const semDanfe   = nfs.filter(n => isSemDanfe(n.situacao)).length;
    const importadas = nfs.filter(n => clonados.has(String(n.id))).length;
    return { total, semDanfe, importadas, pendentes: Math.max(0, semDanfe - importadas) };
  }, [nfs, clonados]);

  const labelRange = rangeIni === rangeFim
    ? fmtBR(rangeIni)
    : `${fmtBR(rangeIni)} → ${fmtBR(rangeFim)}`;

  // Agrupa NFs filtradas por marketplace, subdivide em flex/agency/full
  const nfsGrupadas = useMemo(() => {
    const mapa = {};
    for (const nf of nfsFiltradas) {
      const raw = nf.marketplace || 'Outros';
      const m = raw.toLowerCase();
      let nome;
      if (m.includes('full'))                          nome = 'ML Full';
      else if (m.includes('mercado') || m.includes('ml')) nome = 'Mercado Livre';
      else if (m.includes('shopee'))                   nome = 'Shopee';
      else if (m.includes('magalu'))                   nome = 'Magalu';
      else if (m.includes('tiktok'))                   nome = 'TikTok';
      else                                             nome = raw;
      if (!mapa[nome]) mapa[nome] = { nome, flex: [], agency: [], full: [], all: [], rawMkt: raw };
      const log = nfLogistica[nf.id];
      mapa[nome].all.push(nf);
      if      (log === 'fulfillment')                     mapa[nome].full.push(nf);
      else if (log === 'flex' || flexFlags[nf.id])        mapa[nome].flex.push(nf);
      else                                                mapa[nome].agency.push(nf);
    }
    return Object.values(mapa).sort((a, b) => {
      if (a.nome.includes('Mercado') && !b.nome.includes('Mercado')) return -1;
      if (!a.nome.includes('Mercado') && b.nome.includes('Mercado')) return 1;
      return b.all.length - a.all.length;
    });
  }, [nfsFiltradas, nfLogistica, flexFlags]);

  // Batch paralelo para um grupo de NF IDs
  async function handleClonarGrupo(ids) {
    const pendentes = ids.filter(id => !clonados.has(String(id)));
    if (!pendentes.length) return;
    setLotePronto({ total: pendentes.length, concluidos: 0, erros: 0 });

    // 1. Busca todos os detalhes em paralelo
    const resultados = await Promise.allSettled(
      pendentes.map(async id => {
        const det = expandidos[id];
        if (det) return { id, det };
        const res  = await fetch(`/bling/pedidos/${id}`);
        const data = await res.json();
        return { id, det: data.item };
      })
    );
    // Atualiza expandidos de uma vez
    const novos = {};
    for (const r of resultados) {
      if (r.status === 'fulfilled' && r.value?.det) novos[r.value.id] = r.value.det;
    }
    if (Object.keys(novos).length) setExpandidos(p => ({ ...p, ...novos }));

    // 2. Clona em série (rate limit da API)
    for (const r of resultados) {
      if (r.status !== 'fulfilled') {
        setLotePronto(p => ({ ...p, erros: p.erros + 1, concluidos: p.concluidos + 1 }));
        continue;
      }
      const { id, det } = r.value;
      const nf = nfs.find(n => n.id === id);
      if (!nf || !det?.itens?.length || nfLogistica[id] === 'fulfillment') {
        setLotePronto(p => ({ ...p, concluidos: p.concluidos + 1 }));
        continue;
      }
      try {
        await handleClonar(nf, det);
      } catch {
        setLotePronto(p => ({ ...p, erros: p.erros + 1 }));
      }
      setLotePronto(p => ({ ...p, concluidos: p.concluidos + 1 }));
    }
    setTimeout(() => setLotePronto(null), 2500);
  }

  // Carrega período anterior para comparativo
  async function loadRelatorio() {
    setLoadingRelatorio(true);
    try {
      const [y1,m1,d1] = rangeIni.split('-').map(Number);
      const [y2,m2,d2] = rangeFim.split('-').map(Number);
      const dur     = Math.round((new Date(y2,m2-1,d2) - new Date(y1,m1-1,d1)) / 86400000);
      const prevFim = addDias(rangeIni, -1);
      const prevIni = addDias(prevFim, -dur);
      const params  = new URLSearchParams({ dataInicio: prevIni, dataFim: prevFim, loja: 'all' });
      const res  = await fetch(`/bling/pedidos?${params}`);
      const data = await res.json();
      setRelatorioAnterior(data.items || []);
    } catch {
      setRelatorioAnterior([]);
    } finally {
      setLoadingRelatorio(false);
      setShowRelatorio(true);
    }
  }

  return (
    <div className="text-slate-100 px-4 py-8 max-w-6xl mx-auto overflow-y-auto flex-1">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border max-w-sm
          ${toast.tipo==='ok' ? 'bg-emerald-900/90 border-emerald-600 text-emerald-300' : 'bg-red-900/90 border-red-600 text-red-300'}`}>
          <p>{toast.msg}</p>
          {toast.tipo === 'ok' && (
            <a href="/pedidos" className="mt-2 flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold text-xs underline">
              <ExternalLink size={11}/> Ir para Pedidos do Dia
            </a>
          )}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap size={20} className="text-yellow-400"/> Pedidos do Bling
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">NFs de saída autorizadas — importe para a fila de separação</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <a href="/pedidos"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-slate-400 text-sm hover:text-slate-200 hover:border-white/20 transition-colors">
            <ExternalLink size={13}/> Pedidos do Dia
          </a>

          {status && (status.authorized ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
                Bling conectado
                {status.updatedAtMs && (
                  <span className="text-emerald-600 text-xs">
                    · {new Date(status.updatedAtMs).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                  </span>
                )}
              </div>
              <button onClick={handleDisconnect} title="Desconectar"
                className="p-2 rounded-lg bg-slate-800 border border-white/10 text-slate-500 hover:text-red-400 hover:border-red-500/30 transition-colors">
                <Unplug size={15}/>
              </button>
            </>
          ) : (
            <a href="/bling/auth"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm font-medium hover:bg-yellow-500/20 transition-colors">
              <Plug size={14}/> Conectar Bling
            </a>
          ))}
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setShowPicker(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors
              ${showPicker ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-white/10 text-slate-300 hover:border-white/20'}`}
          >
            <CalendarDays size={14} className="text-emerald-400"/>
            {labelRange}
            <ChevronDown size={13} className="text-slate-500"/>
          </button>
          {showPicker && (
            <div className="absolute left-0 top-full mt-2 z-50">
              <RangePicker ini={rangeIni} fim={rangeFim} onConfirm={handleRangeConfirm}/>
            </div>
          )}
        </div>
        <button onClick={fetchNFs} disabled={loadingNfs} title="Atualizar"
          className="p-1.5 rounded-lg bg-slate-800 border border-white/10 text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors">
          <RefreshCw size={14} className={loadingNfs ? 'animate-spin' : ''}/>
        </button>
        <button
          onClick={() => showRelatorio ? setShowRelatorio(false) : loadRelatorio()}
          disabled={loadingRelatorio || nfs.length === 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors
            ${showRelatorio ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}
        >
          {loadingRelatorio ? <Loader2 size={13} className="animate-spin"/> : <BarChart2 size={13}/>}
          Relatório
        </button>
      </div>

      {/* ── Resumo ── */}
      {!loadingNfs && !erro && nfs.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <ResumoCard label="Total NFs"    valor={resumo.total}      cor="slate"/>
          <ResumoCard label="Sem DANFE"    valor={resumo.semDanfe}   cor="amber"   sub="Aguardando emissão"/>
          <ResumoCard label="Importadas"   valor={resumo.importadas} cor="emerald" sub="Pedidos criados"/>
          <ResumoCard label="Pendentes"    valor={resumo.pendentes}  cor={resumo.pendentes > 0 ? 'amber' : 'slate'} sub="Sem DANFE não importadas"/>
        </div>
      )}

      {/* ── Erro ── */}
      {erro && (
        <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 text-red-400 text-sm mb-5 flex items-center gap-2">
          <AlertTriangle size={15}/> {erro}
        </div>
      )}

      {/* ── Loading ── */}
      {loadingNfs && (
        <div className="space-y-2">
          {[...Array(6)].map((_,i) => <div key={i} className="h-14 rounded-xl bg-slate-800 border border-white/5 animate-pulse"/>)}
        </div>
      )}

      {/* ── Relatório comparativo ── */}
      {showRelatorio && relatorioAnterior !== null && (
        <RelatorioPanel
          atual={nfs}
          anterior={relatorioAnterior}
          rangeIni={rangeIni}
          rangeFim={rangeFim}
          onClose={() => setShowRelatorio(false)}
        />
      )}

      {/* ── Lista agrupada por marketplace ── */}
      {!loadingNfs && !erro && (
        nfsGrupadas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Inbox size={36} className="text-slate-700"/>
            <p className="text-slate-500 text-sm">
              {nfs.length === 0
                ? `Nenhuma NF no período ${fmtBR(rangeIni)} → ${fmtBR(rangeFim)}.`
                : 'Nenhuma NF para os filtros selecionados.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4 pb-24">
            {nfsGrupadas.map(grupo => {
              const criadosNoGrupo  = grupo.all.filter(n => clonados.has(String(n.id))).length;
              const pendentesGrupo  = grupo.all.filter(n => !clonados.has(String(n.id)) && nfLogistica[n.id] !== 'fulfillment');
              const pendentesFlex   = grupo.flex.filter(n => !clonados.has(String(n.id)));
              const pendentesAgency = grupo.agency.filter(n => !clonados.has(String(n.id)));
              const cor = canalCor(grupo.rawMkt);

              return (
                <div key={grupo.nome} className="rounded-2xl border border-white/8 overflow-hidden">
                  {/* ── Cabeçalho do grupo ── */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-white/5 flex-wrap gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${cor}`}>
                        {grupo.nome}
                      </span>
                      <span className="text-sm font-semibold text-slate-300">
                        {grupo.all.length} pedido{grupo.all.length !== 1 ? 's' : ''}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {grupo.flex.length > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-400 font-semibold">
                            ⚡ {grupo.flex.length} flex
                          </span>
                        )}
                        {grupo.agency.length > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-semibold">
                            🚚 {grupo.agency.length} agência
                          </span>
                        )}
                        {grupo.full.length > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-semibold">
                            🏬 {grupo.full.length} full
                          </span>
                        )}
                        {criadosNoGrupo > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold">
                            ✓ {criadosNoGrupo} criado{criadosNoGrupo !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    {pendentesGrupo.length > 0 && (
                      <div className="flex items-center gap-2">
                        {pendentesFlex.length > 0 && (
                          <button
                            onClick={() => handleClonarGrupo(pendentesFlex.map(n => n.id))}
                            disabled={!!lotePronto}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
                          >
                            <Flame size={11}/> Criar {pendentesFlex.length} Flex
                          </button>
                        )}
                        {pendentesAgency.length > 0 && (
                          <button
                            onClick={() => handleClonarGrupo(pendentesAgency.map(n => n.id))}
                            disabled={!!lotePronto}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 disabled:opacity-50 transition-colors"
                          >
                            <Truck size={11}/> Criar {pendentesAgency.length} Agência
                          </button>
                        )}
                        {pendentesGrupo.length > 1 && (
                          <button
                            onClick={() => handleClonarGrupo(pendentesGrupo.map(n => n.id))}
                            disabled={!!lotePronto}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/80 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors shadow-sm"
                          >
                            {lotePronto ? <Loader2 size={11} className="animate-spin"/> : <PackagePlus size={11}/>}
                            Criar todos ({pendentesGrupo.length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── NFs do grupo ── */}
                  <div className="divide-y divide-white/[0.04]">
                    {grupo.all.map(nf => (
                      <NFRow key={nf.id} nf={nf} clonados={clonados}
                        onClonar={handleClonar} onExpand={handleExpand}
                        expandido={!!expandidos[nf.id]} detalhe={expandidos[nf.id] || null}
                        expandindo={expandindo === nf.id}
                        isFlex={!!flexFlags[nf.id]} onFlexToggle={handleFlexToggle}
                        clonando={clonando}
                        mlLogistica={nfLogistica[nf.id] || null}
                        isSelected={selectedIds.has(nf.id)}
                        onToggleSelect={handleToggleSelect}
                        selectionMode={selectedIds.size > 0}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-slate-700 text-center pt-1">
              {nfsFiltradas.length} NF{nfsFiltradas.length !== 1 ? 's' : ''} em {nfsGrupadas.length} canal{nfsGrupadas.length !== 1 ? 'is' : ''}
            </p>
          </div>
        )
      )}

      {/* ── Sticky bottom bar — seleção em lote ── */}
      {selectedIds.size > 0 && (
        <SelectionBar
          selected={selectedIds}
          nfs={nfs}
          flexFlags={flexFlags}
          nfLogistica={nfLogistica}
          onClear={clearSelection}
          onRun={handleClonarLote}
          running={!!lotePronto}
          progresso={lotePronto}
        />
      )}
    </div>
  );
}

// ─── Barra inferior de seleção em lote ────────────────────────────────────────
function SelectionBar({ selected, nfs, flexFlags, nfLogistica, onClear, onRun, running, progresso }) {
  const ids = [...selected];
  const items = ids.map(id => nfs.find(n => n.id === id)).filter(Boolean);
  // Contagem por canal (marketplace)
  const porCanal = {};
  let flexCount = 0, fullCount = 0;
  for (const nf of items) {
    const mkt = (nf.marketplace || '?').toLowerCase();
    porCanal[mkt] = (porCanal[mkt] || 0) + 1;
    if (nfLogistica[nf.id] === 'fulfillment') fullCount++;
    if (nfLogistica[nf.id] === 'flex' || flexFlags[nf.id]) flexCount++;
  }
  const chips = Object.entries(porCanal).map(([k, v]) => ({ k, v }));

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur border-t border-white/10 shadow-2xl">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <span className="text-sm font-bold text-emerald-400">
            {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
          </span>
          {chips.map(({ k, v }) => (
            <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-white/10 text-slate-300 uppercase tracking-wider">
              {v} {k}
            </span>
          ))}
          {flexCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-400">
              ⚡ {flexCount} flex
            </span>
          )}
          {fullCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
              🏬 {fullCount} full (ignorados)
            </span>
          )}
        </div>
        {progresso && (
          <span className="text-xs text-slate-400 tabular-nums">
            {progresso.concluidos}/{progresso.total}{progresso.erros > 0 ? ` · ${progresso.erros} erro(s)` : ''}
          </span>
        )}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onClear}
            disabled={running}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm text-slate-300 hover:text-white disabled:opacity-50"
          >
            Limpar
          </button>
          <button
            onClick={onRun}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white disabled:opacity-60"
          >
            {running ? <><Loader2 size={14} className="animate-spin"/> Criando…</> : <><PackagePlus size={14}/> Criar {selected.size} pedido{selected.size !== 1 ? 's' : ''}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
