/**
 * @file BlingPedidos.jsx
 * @module expedicao
 * @description Pedidos do Bling — NFs de saída autorizadas.
 *              Redenhado para layout plano sem collapse (estilo Mercado Livre),
 *              cabeçalho de estatísticas inteligente agrupado por data/canal,
 *              carregamento concorrente assíncrono de itens e ações em lote (lote).
 * @version 3.0.0
 * @date 2026-05-24
 */

import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import {
  Zap, CalendarDays, RefreshCw, Unplug, Plug,
  ChevronDown, ChevronUp, PackagePlus, CheckCircle2,
  AlertTriangle, Clock, XCircle, Loader2, Inbox,
  Tag, Hash, ChevronLeft, ChevronRight, Flame, ExternalLink,
  Package, ShoppingBag,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAuthToken } from '../../utils/getAuthToken';
import { auth } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';

// ─── helpers de data ──────────────────────────────────────────────────────────
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function fmtBR(iso) {
  if (!iso) return '—';
  const clean = iso.substring(0, 10);
  const [y, m, d] = clean.split('-');
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
  const s = (sit || '').toLowerCase();
  if (s.includes('cancelada')) return false;
  if (s.includes('sem danfe')) return true;
  if (s.includes('emitida') || s.includes('danfe')) return false;
  return true;
}

function isComDanfe(sit) {
  if (isSemDanfe(sit)) return false;
  const s = (sit || '').toLowerCase();
  return s.includes('emitida') || s.includes('danfe');
}

function isNotaDisponivel(nf) {
  const s = (nf.situacao || '').toLowerCase();
  if (s.includes('cancelada') || s.includes('rejeitada')) return false;
  return s.includes('autorizada') || s.includes('danfe') || s.includes('emitida') || s.includes('registrada');
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
  const s = (sit || '').toLowerCase();
  if (s.includes('cancelada'))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/25 uppercase tracking-wider"><XCircle size={9}/> Cancelada</span>;
  if (s === 'autorizada')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25 uppercase tracking-wider"><Clock size={9}/> Autorizada</span>;
  if (isSemDanfe(sit))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25 uppercase tracking-wider"><Clock size={9}/> Sem DANFE</span>;
  if (isComDanfe(sit))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 uppercase tracking-wider status-success"><CheckCircle2 size={9}/> DANFE OK</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-400 border border-slate-600 uppercase tracking-wider">{sit||'—'}</span>;
}

// ─── Thumbnail de produto ─────────────────────────────────────────────────────
function ProductThumb() {
  return (
    <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-900 border border-white/5 flex items-center justify-center">
      <Package size={14} className="text-slate-600" />
    </div>
  );
}

// ─── Cliente Name Parser ──────────────────────────────────────────────────────
function parseCliente(clienteNome) {
  const m = (clienteNome || '').match(/(.*?)\s*\(([^)]+)\)$/);
  if (m) {
    return { nome: m[1].trim(), apelido: m[2].trim() };
  }
  return { nome: clienteNome || '—', apelido: '' };
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
  const [preset,    setPreset]    = useState('hoje');
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

// ─── Resumo Card ──────────────────────────────────────────────────────────────
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

// ─── Day Group Card ───────────────────────────────────────────────────────────
const DayGroupCard = memo(function DayGroupCard({ title, list, color, onBulkImport, onFilterClick }) {
  const mktGroups = useMemo(() => {
    const groups = { MERCADO_LIVRE: [], SHOPEE: [], OUTROS: [] };
    list.forEach(nf => {
      let m = (nf.marketplace || 'OUTROS').toUpperCase();
      if (m.includes('MERCADO') || m.includes('MELI')) m = 'MERCADO_LIVRE';
      else if (m.includes('SHOPEE')) m = 'SHOPEE';
      else m = 'OUTROS';
      groups[m].push(nf);
    });
    return groups;
  }, [list]);

  const borderColors = {
    emerald: 'border-emerald-500/20 bg-emerald-950/5',
    blue: 'border-blue-500/20 bg-blue-950/5',
    purple: 'border-purple-500/20 bg-purple-950/5',
  };

  const textColors = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
  };

  const badgeColors = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };

  return (
    <div className={`rounded-xl border p-4 ${borderColors[color]} flex flex-col gap-3 backdrop-blur-md`}>
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <h3 className={`text-xs font-black uppercase tracking-wider ${textColors[color]}`}>{title}</h3>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColors[color]}`}>
          {list.length} {list.length === 1 ? 'Nota' : 'Notas'}
        </span>
      </div>
      
      <div className="flex flex-col gap-2">
        {Object.entries(mktGroups).map(([mkt, nfs]) => {
          if (nfs.length === 0) return null;
          const label = mkt === 'MERCADO_LIVRE' ? 'Mercado Livre' : mkt === 'SHOPEE' ? 'Shopee' : 'Outros / News';
          const comDanfe = nfs.filter(n => isComDanfe(n.situacao)).length;
          const semDanfe = nfs.filter(n => isSemDanfe(n.situacao)).length;

          return (
            <div
              key={mkt}
              onClick={() => onFilterClick(mkt)}
              className="group cursor-pointer rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-white/5 hover:border-white/10 p-3 transition-colors flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 group-hover:text-slate-100 transition-colors">{label}</span>
                <span className="text-xs font-black text-white bg-slate-700/80 px-2 py-0.5 rounded">{nfs.length}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>DANFE: {comDanfe} ok · {semDanfe} sem</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onBulkImport(mkt);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 font-bold underline transition-colors text-[10px]"
                >
                  Expedir Lote
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─── NF Card Flat (Sem Collapse) ──────────────────────────────────────────────
const NFCard = memo(function NFCard({ nf, detalhe, loadingDetalhe, clonados, onClonar, onReload, isFlex, onFlexToggle, clonando, selected, onSelectToggle }) {
  const jaCriado = clonados.has(String(nf.id));
  const eClonar  = clonando === nf.id;
  const cli      = parseCliente(nf.cliente?.nome);

  return (
    <div className={`rounded-xl border transition-all bg-slate-800/30 p-2.5 md:p-3 flex flex-col gap-2
      ${selected ? 'border-emerald-500/50 bg-slate-800 shadow-lg ring-1 ring-emerald-500/10' : 'border-white/5 hover:border-white/10 hover:bg-slate-800/40'}`}>

      {/* TOP HEADER */}
      <div className="flex items-center gap-2 flex-wrap justify-between border-b border-white/5 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelectToggle}
            disabled={jaCriado}
            className="w-4 h-4 rounded border-white/15 bg-slate-900 text-emerald-500 focus:ring-0 focus:ring-offset-0 disabled:opacity-30 cursor-pointer transition-colors"
          />
          <span className="text-[10px] font-mono text-slate-500 shrink-0">#{nf.numero}</span>
          <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider whitespace-nowrap ${canalCor(nf.marketplace)}`}>
            {nf.marketplace || '?'}
          </span>
          <span className="text-xs font-bold text-slate-200 truncate">
            {cli.nome} {cli.apelido && <span className="text-slate-400 font-bold ml-1">({cli.apelido})</span>}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
          <span>{fmtBR(nf.dataEmissao)}</span>
          <SituacaoBadge sit={nf.situacao} />
          {jaCriado && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider status-success">
              <CheckCircle2 size={9}/> No sistema
            </span>
          )}
        </div>
      </div>

      {/* ITEMS LIST (FLAT) */}
      <div className="flex-1">
        {detalhe ? (
          detalhe.error ? (
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-medium flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1">
                <AlertTriangle size={12} />
                <span>{detalhe.message}</span>
              </span>
              <button
                onClick={onReload}
                className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/35 text-red-300 hover:text-white font-bold transition-colors uppercase text-[9px] shrink-0"
              >
                Recarregar
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {detalhe.itens?.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-lg bg-slate-900/35 border border-white/[0.03] p-1.5 hover:border-white/5 transition-colors">
                  <div className="shrink-0 w-8 h-8 rounded bg-slate-900 border border-white/5 flex items-center justify-center">
                    <Package size={12} className="text-slate-600" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-slate-200 line-clamp-1 leading-tight">{it.nome || '—'}</p>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                      <Tag size={9} /> {it.sku || 'Sem SKU'}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-center justify-center w-9 h-9 rounded bg-slate-800 border border-white/5">
                    <span className="text-[7px] text-slate-500 font-bold uppercase leading-none">Qtd</span>
                    <span className="text-xs font-black text-white leading-none mt-0.5">{it.qty}</span>
                  </div>

                  <div className="shrink-0 text-right w-16">
                    <span className="text-[7px] text-slate-500 block leading-none">Unitário</span>
                    <span className="text-[10px] font-semibold text-slate-300 tabular-nums leading-none mt-1.5 block">{BRL.format(it.preco)}</span>
                  </div>
                </div>
              ))}
              
              {detalhe.numeroPedido && (
                <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono pl-1 pt-0.5">
                  <Hash size={9}/> Pedido na loja: <span className="text-slate-400">{detalhe.numeroPedido}</span>
                </div>
              )}
            </div>
          )
        ) : loadingDetalhe ? (
          <div className="space-y-1.5 py-0.5">
            <div className="h-10 rounded-lg bg-slate-900/30 border border-white/5 animate-pulse flex items-center px-3 justify-between">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-7 h-7 rounded bg-slate-800 animate-pulse shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-2.5 w-32 bg-slate-800 rounded animate-pulse" />
                  <div className="h-2 w-16 bg-slate-800 rounded animate-pulse" />
                </div>
              </div>
              <div className="w-8 h-8 rounded bg-slate-800 animate-pulse shrink-0" />
            </div>
          </div>
        ) : (
          <div className="py-1.5 text-center text-[10px] text-slate-600 flex items-center justify-center gap-1.5">
            <Loader2 size={10} className="animate-spin" /> Carregando produtos...
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5 flex-wrap">
        <div className="flex items-baseline gap-1">
          <span className="text-[8px] text-slate-500 uppercase font-black">Total</span>
          <span className="text-xs font-black text-white tabular-nums">
            {BRL.format(nf.valorTotal || detalhe?.valorTotal || 0)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Flex Toggle */}
          {!jaCriado && (
            <button
              onClick={() => onFlexToggle(nf.id)}
              title="Marcar como FLEX"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors
                ${isFlex
                  ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400 scale-102'
                  : 'bg-slate-800 border-white/5 text-slate-500 hover:text-slate-300'}`}
            >
              <Flame size={10} className={isFlex ? 'text-yellow-400 fill-yellow-400/20' : ''} />
              {isFlex ? 'FLEX — Rápido' : 'Flex'}
            </button>
          )}

          {/* Clone Action Button */}
          {jaCriado ? (
            <Link
              to="/expedicao/pedidos"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-700 border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-all"
            >
              <ExternalLink size={10}/> Separar
            </Link>
          ) : (
            <button
              onClick={() => onClonar(nf, detalhe)}
              disabled={!detalhe || detalhe.error || !detalhe.itens?.length || eClonar}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white shadow-lg shadow-emerald-500/10 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              {eClonar ? (
                <><Loader2 size={10} className="animate-spin" /> Salvando...</>
              ) : (
                <><PackagePlus size={10} /> Expedir</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Página Principal ─────────────────────────────────────────────────────────
export function BlingPedidos() {
  const defaultRange = calcPreset('hoje');

  const [status,                 setStatus]                 = useState(null);
  const [rangeIni,               setRangeIni]               = useState(defaultRange.ini);
  const [rangeFim,               setRangeFim]               = useState(defaultRange.fim);
  const [showPicker,             setShowPicker]             = useState(false);
  const [canalSel,               setCanalSel]               = useState('all');
  const [situacaoSel,            setSituacaoSel]            = useState('all');
  const [nfs,                    setNfs]                    = useState([]);
  const [loadingNfs,             setLoadingNfs]             = useState(false);
  const [loadingMsg,             setLoadingMsg]             = useState('');
  const [erro,                   setErro]                   = useState(null);
  const [hasFetched,             setHasFetched]             = useState(false);
  
  // Fila de carregamento de detalhes
  const [nfeDetails,             setNfeDetails]             = useState({});
  const [detailsLoading,         setDetailsLoading]         = useState({});
  
  // Seleção e filtros inteligentes
  const [selectedIds,            setSelectedIds]            = useState(new Set());
  const [selectedDayFilter,      setSelectedDayFilter]      = useState('all'); // 'all', 'hoje', 'amanha', 'futuros'
  const [selectedChannelFilter,  setSelectedChannelFilter]  = useState('all'); // 'all', 'MERCADO_LIVRE', 'SHOPEE', 'OUTROS'
  
  const [clonados,               setClonados]               = useState(getClonados);
  const [clonando,               setClonando]               = useState(null);
  const [flexFlags,              setFlexFlags]              = useState({});
  const [toast,                  setToast]                  = useState(null);
  
  const pickerRef  = useRef(null);
  const loadedIdsRef = useRef(new Set());

  // Fecha picker ao clicar fora
  useEffect(() => {
    function handler(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Buscar status (Bling ativo/inativo) - Apenas no mount
  const fetchStatus = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const r = await fetch('/api/bling/config', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await r.json();
      setStatus({
        authorized: data.authorized,
        active: data.active,
        updatedAtMs: data.tokenUpdatedAtMs
      });
    } catch (e) {
      try {
        const r = await fetch('/bling/status');
        const localData = await r.json();
        setStatus(prev => ({ ...prev, authorized: localData.authorized, updatedAtMs: localData.updatedAtMs }));
      } catch {}
    }
  }, []);

  useEffect(() => {
    // Sincroniza o status após autenticação inicial
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchStatus();
      }
    });
    return () => unsub();
  }, [fetchStatus]);

  // Fila de preloading assíncrono sequencial (respeita o rate limit do Bling de 3-5 req/s)
  const preloadDetails = useCallback(async (list) => {
    const toLoad = list.filter(nf => {
      const sit = (nf.situacao || '').toLowerCase();
      const isValido = sit.includes('autorizada') || sit.includes('danfe') || sit.includes('emitida') || sit.includes('registrada');
      return isValido && !loadedIdsRef.current.has(nf.id);
    });

    if (toLoad.length === 0) return;

    // Adiciona imediatamente ao Set para evitar duplicidade de chamadas disparadas por re-renders
    toLoad.forEach(nf => loadedIdsRef.current.add(nf.id));

    for (let i = 0; i < toLoad.length; i++) {
      const nf = toLoad[i];
      setDetailsLoading(prev => ({ ...prev, [nf.id]: true }));
      try {
        const token = await getAuthToken();
        const res = await fetch(`/bling/pedidos/${nf.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.item) {
          setNfeDetails(prev => ({ ...prev, [nf.id]: data.item }));
        } else {
          setNfeDetails(prev => ({
            ...prev,
            [nf.id]: { error: true, message: data.message || 'Nota fiscal não encontrada no Bling.' }
          }));
        }
      } catch (e) {
        console.error('Error preloading details for NFe:', nf.id, e);
        setNfeDetails(prev => ({
          ...prev,
          [nf.id]: { error: true, message: 'Erro de conexão ao buscar produtos.' }
        }));
      } finally {
        setDetailsLoading(prev => ({ ...prev, [nf.id]: false }));
      }

      // Pequeno atraso de 200ms entre as requisições para evitar rate limit (429) do Bling
      if (i < toLoad.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }, []);

  const reloadSingleNfeDetails = useCallback(async (nfId) => {
    setDetailsLoading(prev => ({ ...prev, [nfId]: true }));
    setNfeDetails(prev => {
      const next = { ...prev };
      delete next[nfId];
      return next;
    });

    try {
      const token = await getAuthToken();
      const res = await fetch(`/bling/pedidos/${nfId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.item) {
        setNfeDetails(prev => ({ ...prev, [nfId]: data.item }));
      } else {
        setNfeDetails(prev => ({
          ...prev,
          [nfId]: { error: true, message: data.message || 'Nota fiscal não encontrada no Bling.' }
        }));
      }
    } catch (e) {
      console.error('Error reloading details for NFe:', nfId, e);
      setNfeDetails(prev => ({
        ...prev,
        [nfId]: { error: true, message: 'Erro de conexão ao buscar produtos.' }
      }));
    } finally {
      setDetailsLoading(prev => ({ ...prev, [nfId]: false }));
    }
  }, []);

  // Buscar NFs — canal sempre "all", filtragem local
  const fetchNFs = useCallback(async (customIni, customFim) => {
    if (status && status.active === false) {
      setNfs([]);
      return;
    }
    const ini = customIni || rangeIni;
    const fim = customFim || rangeFim;

    setLoadingNfs(true); setErro(null); setLoadingMsg('Buscando notas fiscais no Bling...');
    try {
      const params = new URLSearchParams({ dataInicio: ini, dataFim: fim, loja: 'all' });
      const res  = await fetch(`/bling/pedidos?${params}`);
      const data = await res.json();
      if (data.error === 'bling_not_authorized') {
        setErro('Bling não autorizado. Conecte sua conta.'); setNfs([]); return;
      }
      const fetchedNfs = data.items || [];
      setNfs(fetchedNfs);
      
      // Resetar caches locais de detalhes e seleções ao trocar o período
      setNfeDetails({});
      setDetailsLoading({});
      setSelectedIds(new Set());
      loadedIdsRef.current.clear();
      
      // Iniciar preloading assíncrono
      preloadDetails(fetchedNfs);
      setHasFetched(true);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoadingNfs(false);
      setLoadingMsg('');
    }
  }, [rangeIni, rangeFim, status, preloadDetails]);

  function handleRangeConfirm(ini, fim) {
    setRangeIni(ini); setRangeFim(fim); setShowPicker(false);
    fetchNFs(ini, fim);
  }

  function handleFlexToggle(nfId) {
    setFlexFlags(prev => ({ ...prev, [nfId]: !prev[nfId] }));
  }

  // Importar um único pedido
  async function handleClonar(nf, detalhe) {
    setClonando(nf.id);
    try {
      const logistica = flexFlags[nf.id] ? 'flex' : 'agency';
      const token = await getAuthToken();
      const res  = await fetch('/bling/clonar', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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
      
      // Remove do Set de selecionados se estiver lá
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(nf.id);
        return next;
      });
    } catch (e) { showToast(`Erro: ${e.message}`, 'err'); }
    finally { setClonando(null); }
  }

  // Executar a importação sequencial ou em lote no backend
  const executeBulkImport = async (listToImport) => {
    const pendentes = listToImport.filter(nf => !clonados.has(String(nf.id)));
    if (!pendentes.length) {
      showToast('Todos os pedidos selecionados já estão no sistema.', 'info');
      return;
    }

    setLoadingNfs(true);
    setLoadingMsg(`Processando lote de ${pendentes.length} pedido(s)...`);

    const payload = [];
    const token = await getAuthToken();

    for (let i = 0; i < pendentes.length; i++) {
      const nf = pendentes[i];
      let det = nfeDetails[nf.id];
      if (!det) {
        setLoadingMsg(`Carregando detalhes do pedido ${i + 1}/${pendentes.length}...`);
        try {
          const res = await fetch(`/bling/pedidos/${nf.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.item) {
            det = data.item;
            setNfeDetails(prev => ({ ...prev, [nf.id]: det }));
          }
        } catch (e) {
          console.error('Falha ao obter detalhe na importação em lote', nf.id, e);
        }

        // Atraso de 200ms para evitar rate limit (429) do Bling
        if (i < pendentes.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      if (det && !det.error && det.itens?.length) {
        const logistica = flexFlags[nf.id] ? 'flex' : 'agency';
        payload.push({
          blingNfId:    nf.id,
          marketplace:  nf.marketplace,
          itens:        det.itens,
          clienteNome:  nf.cliente?.nome || '',
          numeroPedido: det.numeroPedido || '',
          mlOrderId:    det.mlOrderId   || null,
          logistica,
        });
      }
    }

    if (!payload.length) {
      showToast('Nenhum pedido válido com itens carregados para importar.', 'err');
      setLoadingNfs(false);
      setLoadingMsg('');
      return;
    }

    setLoadingMsg(`Salvando ${payload.length} pedido(s) na separação...`);
    try {
      const res = await fetch('/bling/clonar-lote', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ pedidos: payload })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na importação em lote');

      // Marcar como clonados localmente
      const importedIds = data.orders || [];
      importedIds.forEach(o => {
        if (o.blingNfId) addClonado(o.blingNfId);
      });
      setClonados(getClonados());
      
      showToast(`✅ ${data.createdCount} pedido(s) importado(s) com sucesso!`, 'ok');
      setSelectedIds(new Set());
    } catch (e) {
      showToast(`Erro ao importar em lote: ${e.message}`, 'err');
    } finally {
      setLoadingNfs(false);
      setLoadingMsg('');
    }
  };

  // Clique de ação em lote pelo painel estatístico
  const handleBulkImportFromGroup = async (nfsList, channel) => {
    const filtered = nfsList.filter(nf => {
      let m = (nf.marketplace || 'OUTROS').toUpperCase();
      if (channel === 'MERCADO_LIVRE') return m.includes('MERCADO') || m.includes('MELI');
      if (channel === 'SHOPEE') return m.includes('SHOPEE');
      return !m.includes('MERCADO') && !m.includes('MELI') && !m.includes('SHOPEE');
    });

    if (!filtered.length) {
      showToast('Nenhum pedido pendente encontrado.', 'info');
      return;
    }
    await executeBulkImport(filtered);
  };

  // Filtros interativos por click no card de dia/canal
  const handleFilterClick = (dayFilter, channelFilter) => {
    setSelectedDayFilter(dayFilter);
    setSelectedChannelFilter(channelFilter);
  };

  async function handleDisconnect() {
    if (!confirm('Desconectar o Bling?')) return;
    await fetch('/bling/disconnect', { method: 'POST' });
    fetchStatus();
  }

  function showToast(msg, tipo = 'ok', orderId = null) {
    setToast({ msg, tipo, orderId });
    setTimeout(() => setToast(null), 5000);
  }

  // Estatísticas agrupadas por data e canal para o cabeçalho inteligente
  const hojeStr = isoHoje();
  const amanhaStr = addDias(hojeStr, 1);

  const groupedByDay = useMemo(() => {
    const grupos = { hoje: [], amanha: [], futuros: [] };
    nfs.forEach(nf => {
      if (!isNotaDisponivel(nf)) return;
      const dt = (nf.dataEmissao || '').substring(0, 10);
      if (!dt) return;
      if (dt <= hojeStr) {
        grupos.hoje.push(nf);
      } else if (dt === amanhaStr) {
        grupos.amanha.push(nf);
      } else {
        grupos.futuros.push(nf);
      }
    });
    return grupos;
  }, [nfs, hojeStr, amanhaStr]);

  // Filtro local composto
  const nfsFiltradas = useMemo(() => {
    let lista = nfs;
    
    // Canal clássico
    if (canalSel !== 'all') {
      lista = lista.filter(n => matchCanal(canalSel, n.marketplace));
    }
    
    // Situação clássica
    if (situacaoSel === 'sem_danfe') {
      lista = lista.filter(n => isSemDanfe(n.situacao));
    } else if (situacaoSel === 'danfe') {
      lista = lista.filter(n => isComDanfe(n.situacao));
    }
    
    // Filtro inteligente do painel estatístico (Data)
    if (selectedDayFilter !== 'all') {
      const hoje = isoHoje();
      const amanha = addDias(hoje, 1);
      lista = lista.filter(nf => {
        if (!isNotaDisponivel(nf)) return false;
        const dt = (nf.dataEmissao || '').substring(0, 10);
        if (!dt) return false;
        if (selectedDayFilter === 'hoje') return dt <= hoje;
        if (selectedDayFilter === 'amanha') return dt === amanha;
        if (selectedDayFilter === 'futuros') return dt > amanha;
        return true;
      });
    }
    
    // Filtro inteligente do painel estatístico (Canal)
    if (selectedChannelFilter !== 'all') {
      lista = lista.filter(nf => {
        let m = (nf.marketplace || 'OUTROS').toUpperCase();
        if (selectedChannelFilter === 'MERCADO_LIVRE') return m.includes('MERCADO') || m.includes('MELI');
        if (selectedChannelFilter === 'SHOPEE') return m.includes('SHOPEE');
        if (selectedChannelFilter === 'OUTROS') return !m.includes('MERCADO') && !m.includes('MELI') && !m.includes('SHOPEE');
        return true;
      });
    }
    
    return lista;
  }, [nfs, canalSel, situacaoSel, selectedDayFilter, selectedChannelFilter]);

  // Checkbox de seleção total
  const unimportedVisibleNfs = useMemo(() => {
    return nfsFiltradas.filter(nf => !clonados.has(String(nf.id)));
  }, [nfsFiltradas, clonados]);

  const allSelected = useMemo(() => {
    if (unimportedVisibleNfs.length === 0) return false;
    return unimportedVisibleNfs.every(nf => selectedIds.has(nf.id));
  }, [unimportedVisibleNfs, selectedIds]);

  const handleSelectAllToggle = () => {
    const next = new Set(selectedIds);
    if (allSelected) {
      unimportedVisibleNfs.forEach(nf => next.delete(nf.id));
    } else {
      unimportedVisibleNfs.forEach(nf => next.add(nf.id));
    }
    setSelectedIds(next);
  };

  const handleSelectToggle = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Resumo clássico
  const resumo = useMemo(() => {
    const total      = nfs.length;
    const semDanfe   = nfs.filter(n => isSemDanfe(n.situacao)).length;
    const importadas = nfs.filter(n => clonados.has(String(n.id))).length;
    return { total, semDanfe, importadas, pendentes: Math.max(0, semDanfe - importadas) };
  }, [nfs, clonados]);

  const labelRange = rangeIni === rangeFim
    ? fmtBR(rangeIni)
    : `${fmtBR(rangeIni)} → ${fmtBR(rangeFim)}`;

  return (
    <div className="text-slate-100 px-2 py-3 md:px-4 md:py-6 w-full overflow-y-auto flex-1 relative">

      {/* Glassmorphism Full Loading Blocker */}
      {loadingNfs && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md transition-all duration-300">
          <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-12 -left-12 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl animate-pulse" />
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
            <p className="text-xs font-semibold text-slate-200 tracking-wide mt-2">{loadingMsg || 'Buscando dados no Bling...'}</p>
          </div>
        </div>
      )}

      {/* Floating Action Bar for Bulk Import */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] bg-slate-900/90 border border-emerald-500/30 rounded-2xl px-6 py-4 shadow-2xl backdrop-blur-lg flex items-center gap-6 min-w-[320px] max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex flex-col">
            <span className="text-sm font-black text-white">{selectedIds.size} selecionado(s)</span>
            <span className="text-[10px] text-slate-400">Pronto para expedir em lote</span>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 text-xs font-bold transition-colors"
            >
              Limpar
            </button>
            <button
              onClick={() => {
                const toImport = nfs.filter(nf => selectedIds.has(nf.id));
                executeBulkImport(toImport);
              }}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
            >
              Expedir Lote
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-4 py-3 rounded-xl shadow-xl text-sm font-medium border max-w-sm
          ${toast.tipo==='ok' ? 'bg-emerald-900/90 border-emerald-600 text-emerald-300' : 'bg-red-900/90 border-red-600 text-red-300'}`}>
          <p>{toast.msg}</p>
          {toast.tipo === 'ok' && (
            <Link to="/expedicao/pedidos" className="mt-2 flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold text-xs underline">
              <ExternalLink size={11}/> Ir para Pedidos do Dia
            </Link>
          )}
        </div>
      )}

      {status && status.active === false ? (
        <div className="flex flex-col items-center justify-center p-12 mt-8 rounded-2xl border border-white/[0.06] bg-slate-900/30 text-center max-w-xl mx-auto shadow-2xl relative overflow-hidden backdrop-blur-md">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-white/[0.08] flex items-center justify-center mb-6 shadow-inner relative z-10">
            <Unplug size={28} className="text-slate-400" />
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
            </span>
          </div>

          <h2 className="text-lg font-bold text-slate-100 mb-2 relative z-10">Integração Bling Desativada</h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-6 max-w-sm relative z-10">
            A sincronização automática de pedidos e notas fiscais com o Bling ERP está atualmente inativa. 
            Para reativar a integração e gerenciar as coletas e expedições, acesse o painel de configurações.
          </p>

          <Link
            to="/sistema/config"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-900/40 hover:scale-[1.02] active:scale-[0.98] relative z-10"
          >
            Configurar Integração
            <ExternalLink size={13} />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[330px_1fr] gap-4 items-start">
          
          {/* COLUNA ESQUERDA: Configurações, Filtros e Resumo (Sticky no Desktop) */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-3">
            
            {/* Header info & Status */}
            <div className="bg-slate-900/40 border border-white/[0.06] rounded-xl p-3 shadow-md flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h1 className="text-sm font-black flex items-center gap-1.5">
                  <Zap size={15} className="text-yellow-400"/> Pedidos do Bling
                </h1>
                
                <button 
                  onClick={() => { fetchStatus(); fetchNFs(); }}
                  disabled={loadingNfs} 
                  title="Atualizar"
                  className="p-1 rounded bg-slate-800 border border-white/10 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors shrink-0"
                >
                  <RefreshCw size={12} className={loadingNfs ? 'animate-spin' : ''}/>
                </button>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">NFs de saída autorizadas — importe para a fila de separação</p>
              
              <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-white/5 flex-wrap">
                {status && (status.authorized ? (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
                    Bling ativo
                  </div>
                ) : (
                  <Link to="/bling/auth"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold hover:bg-yellow-500/20 transition-colors">
                    <Plug size={10}/> Conectar
                  </Link>
                ))}
                
                <div className="flex items-center gap-1">
                  <Link to="/expedicao/pedidos"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-white/10 text-slate-400 text-[10px] hover:text-slate-200 hover:border-white/20 transition-colors">
                    <ExternalLink size={10}/> Pedidos do Dia
                  </Link>
                  {status && status.authorized && (
                    <button onClick={handleDisconnect} title="Desconectar"
                      className="p-1 rounded bg-slate-800 border border-white/10 text-slate-500 hover:text-red-400 hover:border-red-500/30 transition-colors">
                      <Unplug size={10}/>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Calendário e Filtros de Canais */}
            <div className="bg-slate-900/40 border border-white/[0.06] rounded-xl p-3 shadow-md flex flex-col gap-2.5">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Período & Canais</span>
              
              {/* Date button */}
              <div className="relative" ref={pickerRef}>
                <button
                  onClick={() => setShowPicker(v => !v)}
                  className={`w-full flex items-center justify-between px-2.5 py-1 rounded-lg text-[11px] border transition-colors
                    ${showPicker ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-white/10 text-slate-300 hover:border-white/20'}`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <CalendarDays size={12} className="text-emerald-400 shrink-0"/>
                    {labelRange}
                  </span>
                  <ChevronDown size={11} className="text-slate-500 shrink-0"/>
                </button>
                {showPicker && (
                  <div className="absolute left-0 top-full mt-1 z-50">
                    <RangePicker ini={rangeIni} fim={rangeFim} onConfirm={handleRangeConfirm}/>
                  </div>
                )}
              </div>

              {/* Channels (tighter spacing) */}
              <div className="flex flex-wrap gap-1">
                {CANAIS.map(c => (
                  <button key={c.id} onClick={() => setCanalSel(c.id)}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-colors
                      ${canalSel === c.id
                        ? c.id === 'all' ? 'bg-slate-600 border-slate-500 text-white' : COR_CANAL[c.cor]
                        : 'bg-slate-800 border-white/10 text-slate-500 hover:text-slate-300'}`}>
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Situation Filter (Tabs) */}
              <div className="flex gap-0.5 border-t border-white/5 pt-2">
                {[{id:'all',label:'Todas'},{id:'sem_danfe',label:'Sem DANFE'},{id:'danfe',label:'Com DANFE'}].map(s => (
                  <button key={s.id} onClick={() => setSituacaoSel(s.id)}
                    className={`flex-1 text-center py-1 rounded-md text-[9px] font-bold border transition-colors
                      ${situacaoSel === s.id ? 'bg-slate-600 border-slate-500 text-white' : 'bg-slate-800 border-white/10 text-slate-500 hover:text-slate-300'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resumo Card Stats (Grid 2x2) */}
            {!erro && nfs.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5">
                <ResumoCard label="Total NFs"    valor={resumo.total}      cor="slate"/>
                <ResumoCard label="Sem DANFE"    valor={resumo.semDanfe}   cor="amber"/>
                <ResumoCard label="Importadas"   valor={resumo.importadas} cor="emerald"/>
                <ResumoCard label="Pendentes"    valor={resumo.pendentes}  cor={resumo.pendentes > 0 ? 'amber' : 'slate'}/>
              </div>
            )}

            {/* Comunicação da Expedição (Coletas Agrupadas) */}
            {!erro && nfs.length > 0 && (
              <div className="bg-slate-900/40 border border-white/[0.06] rounded-xl p-3 shadow-md flex flex-col gap-2">
                <div className="flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                  <ShoppingBag className="text-emerald-400" size={13} />
                  <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-200">Coletas Programadas</h2>
                </div>
                
                <div className="flex flex-col gap-1.5 font-sans">
                  {groupedByDay.hoje.length > 0 && (
                    <DayGroupCard
                      title="Hoje"
                      list={groupedByDay.hoje}
                      color="emerald"
                      onBulkImport={(mkt) => handleBulkImportFromGroup(groupedByDay.hoje, mkt)}
                      onFilterClick={(mkt) => handleFilterClick('hoje', mkt)}
                    />
                  )}
                  {groupedByDay.amanha.length > 0 && (
                    <DayGroupCard
                      title="Amanhã"
                      list={groupedByDay.amanha}
                      color="blue"
                      onBulkImport={(mkt) => handleBulkImportFromGroup(groupedByDay.amanha, mkt)}
                      onFilterClick={(mkt) => handleFilterClick('amanha', mkt)}
                    />
                  )}
                  {groupedByDay.futuros.length > 0 && (
                    <DayGroupCard
                      title="Dias Seguintes"
                      list={groupedByDay.futuros}
                      color="purple"
                      onBulkImport={(mkt) => handleBulkImportFromGroup(groupedByDay.futuros, mkt)}
                      onFilterClick={(mkt) => handleFilterClick('futuros', mkt)}
                    />
                  )}
                  {groupedByDay.hoje.length === 0 && groupedByDay.amanha.length === 0 && groupedByDay.futuros.length === 0 && (
                    <span className="text-[10px] text-slate-500 text-center py-2">Nenhuma coleta identificada.</span>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* COLUNA DIREITA: Stream de Pedidos / Cartões */}
          <div className="flex flex-col gap-2">
            
            {/* Filtros Inteligentes Ativos */}
            {(selectedDayFilter !== 'all' || selectedChannelFilter !== 'all') && (
              <div className="flex items-center gap-2 mb-1 bg-slate-900/40 border border-white/[0.06] rounded-xl px-3 py-1.5 text-[10px]">
                <span className="text-slate-500 font-bold">Filtro Ativo:</span>
                <span className="font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                  {selectedDayFilter !== 'all' ? `Período: ${selectedDayFilter}` : ''}
                  {selectedDayFilter !== 'all' && selectedChannelFilter !== 'all' ? ' + ' : ''}
                  {selectedChannelFilter !== 'all' ? `Canal: ${selectedChannelFilter.replace('_', ' ')}` : ''}
                </span>
                <button
                  onClick={() => { setSelectedDayFilter('all'); setSelectedChannelFilter('all'); }}
                  className="text-red-400 hover:text-red-300 hover:underline font-black ml-auto transition-colors"
                >
                  Limpar Filtro
                </button>
              </div>
            )}

            {/* Erro */}
            {erro && (
              <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-3.5 text-red-400 text-xs mb-2 flex items-center gap-2">
                <AlertTriangle size={14}/> {erro}
              </div>
            )}

            {/* Listagem principal */}
            {!loadingNfs && !erro && (
              !hasFetched ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 gap-4 bg-slate-900/20 border border-white/[0.04] rounded-xl text-center">
                  <Inbox size={36} className="text-slate-600"/>
                  <div>
                    <h3 className="text-xs font-bold text-slate-300">Pronto para carregar</h3>
                    <p className="text-slate-500 text-[10px] mt-1 max-w-xs mx-auto">
                      Selecione o período desejado no painel ao lado e clique em buscar para carregar as notas autorizadas.
                    </p>
                  </div>
                  <button
                    onClick={() => { fetchStatus(); fetchNFs(); }}
                    className="px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all shadow-md active:scale-95"
                  >
                    Buscar Notas Fiscais
                  </button>
                </div>
              ) : nfsFiltradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 bg-slate-900/20 border border-white/[0.03] rounded-xl">
                  <Inbox size={32} className="text-slate-700"/>
                  <p className="text-slate-500 text-xs">
                    {nfs.length === 0
                      ? `Nenhuma NF no período ${fmtBR(rangeIni)} → ${fmtBR(rangeFim)}.`
                      : 'Nenhuma NF correspondente aos filtros aplicados.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  
                  {/* List Header com Checkbox Geral */}
                  <div className="flex items-center justify-between px-3 py-1.5 border border-white/[0.04] bg-slate-900/30 rounded-lg text-[10px]">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={handleSelectAllToggle}
                        className="w-4 h-4 rounded border-white/15 bg-slate-950 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer transition-colors"
                      />
                      <span className="font-extrabold text-slate-500 uppercase tracking-wider">Selecionar Todos</span>
                    </div>
                    <span className="font-bold text-slate-600">
                      Exibindo {nfsFiltradas.length} de {nfs.length} Notas
                    </span>
                  </div>

                  {/* Cards de Notas */}
                  {nfsFiltradas.map(nf => (
                    <NFCard
                      key={nf.id}
                      nf={nf}
                      detalhe={nfeDetails[nf.id] || null}
                      loadingDetalhe={!!detailsLoading[nf.id]}
                      clonados={clonados}
                      onClonar={handleClonar}
                      onReload={() => reloadSingleNfeDetails(nf.id)}
                      isFlex={!!flexFlags[nf.id]}
                      onFlexToggle={handleFlexToggle}
                      clonando={clonando}
                      selected={selectedIds.has(nf.id)}
                      onSelectToggle={() => handleSelectToggle(nf.id)}
                    />
                  ))}

                  <p className="text-[10px] text-slate-700 text-center pt-2">
                    Fim dos pedidos exibidos.
                  </p>
                </div>
              )
            )}

          </div>

        </div>
      )}
    </div>
  );
}
