/**
 * @file BlingPedidos.jsx
 * @module expedicao
 * @description Pedidos do Bling v3 — range picker, contagem por canal,
 *              cards inteligentes por prazo e widget de corte diário.
 * @version 3.0.0
 * @date 2026-04-03
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Zap, CalendarDays, RefreshCw, Unplug, Plug,
  ChevronDown, ChevronUp, PackagePlus, CheckCircle2,
  AlertTriangle, Clock, XCircle, Loader2, Inbox,
  Tag, Hash, ChevronLeft, ChevronRight, Timer, Flame,
} from 'lucide-react';

// ─── helpers de data ──────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function isoHoje() { return new Date().toISOString().split('T')[0]; }
function isoOntem() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
function addDias(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
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

// isSemDanfe: identifica NF sem DANFE sem capturar "Autorizada Sem DANFE"
// como "Emitida DANFE" (bug do s.includes('danfe') genérico)
function isSemDanfe(sit) {
  const s = (sit || '').toLowerCase();
  return s.includes('sem danfe') || s === 'autorizada sem danfe';
}
function isComDanfe(sit) {
  const s = (sit || '').toLowerCase();
  // "Emitida DANFE" mas NÃO "Autorizada Sem DANFE"
  return (s.startsWith('emitida') && s.includes('danfe')) || s === 'emitida danfe';
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
  { id: 'ml',     label: 'ML',      cor: 'yellow', match: m => m.toLowerCase().includes('ml') && !m.toLowerCase().includes('full') },
  { id: 'mlfull', label: 'ML Full', cor: 'blue',   match: m => m.toLowerCase().includes('full') },
  { id: 'shopee', label: 'Shopee',  cor: 'orange', match: m => m.toLowerCase().includes('shopee') },
  { id: 'magalu', label: 'Magalu',  cor: 'purple', match: m => m.toLowerCase().includes('magalu') },
  { id: 'tiktok', label: 'TikTok',  cor: 'pink',   match: m => m.toLowerCase().includes('tiktok') },
];

const COR_CANAL = {
  yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  blue:   'bg-blue-500/10   text-blue-400   border-blue-500/30',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  pink:   'bg-pink-500/10   text-pink-400   border-pink-500/30',
  slate:  'bg-slate-700/50  text-slate-400  border-slate-600',
};

function canalCor(mkt) {
  const canal = CANAIS.find(c => c.match && c.match(mkt || ''));
  return canal ? COR_CANAL[canal.cor] : COR_CANAL.slate;
}

function matchCanal(nf, canalId) {
  if (canalId === 'all') return true;
  const canal = CANAIS.find(c => c.id === canalId);
  return canal?.match ? canal.match(nf.marketplace || '') : false;
}

// ─── Badge situação ───────────────────────────────────────────────────────────
function SituacaoBadge({ sit }) {
  if (isSemDanfe(sit))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/25 whitespace-nowrap"><Clock size={10}/> Sem DANFE</span>;
  if (isComDanfe(sit))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 whitespace-nowrap"><CheckCircle2 size={10}/> DANFE Emitida</span>;
  if ((sit || '').toLowerCase().includes('cancelada'))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/25 whitespace-nowrap"><XCircle size={10}/> Cancelada</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-700 text-slate-400 border border-slate-600 whitespace-nowrap">{sit||'—'}</span>;
}

// ─── Cortes diários por canal ─────────────────────────────────────────────────
// Horários de corte (BRT) — pedidos ANTES do corte devem ser expedidos no mesmo dia
const CORTES = [
  { canal: 'ML',     hora: 14, min: 0,  cor: 'yellow', regra: 'Pedidos antes das 14h → envio obrigatório hoje' },
  { canal: 'Shopee', hora: 16, min: 0,  cor: 'orange', regra: 'Pedidos antes das 16h → envio obrigatório hoje' },
];

function CorteWidget() {
  const [agora, setAgora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {CORTES.map(c => {
        const corteMs = new Date(agora);
        corteMs.setHours(c.hora, c.min, 0, 0);
        const diffMin = Math.round((corteMs - agora) / 60_000);
        const passou  = diffMin < 0;
        const urgente = !passou && diffMin <= 60;
        const aviso   = !passou && diffMin <= 120;

        const bg   = passou  ? 'bg-slate-800/50 border-white/5'
                   : urgente ? 'bg-red-900/20 border-red-500/30'
                   : aviso   ? 'bg-amber-900/20 border-amber-500/30'
                   : 'bg-slate-800/50 border-white/5';

        const textCor = passou  ? 'text-slate-500'
                      : urgente ? 'text-red-400'
                      : aviso   ? 'text-amber-400'
                      : 'text-slate-300';

        const iconEl = passou
          ? <CheckCircle2 size={13} className="text-slate-600"/>
          : urgente
          ? <Flame size={13} className="text-red-400 animate-pulse"/>
          : <Timer size={13} className={aviso ? 'text-amber-400' : 'text-slate-500'}/>;

        const label = passou
          ? `Corte ${c.canal} encerrado (${String(c.hora).padStart(2,'0')}:${String(c.min).padStart(2,'0')})`
          : `${c.canal} — corte ${String(c.hora).padStart(2,'0')}:${String(c.min).padStart(2,'0')} · faltam ${diffMin}min`;

        return (
          <div key={c.canal} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${bg}`}>
            {iconEl}
            <span className={textCor}>{label}</span>
            {!passou && (
              <span className="text-slate-600 ml-1">· {c.regra}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Cards inteligentes ───────────────────────────────────────────────────────
function CardsInteligentes({ nfs, clonados, canalSel }) {
  const hoje  = isoHoje();
  const ontem = isoOntem();
  const agora = new Date();
  const horaAtual = agora.getHours() + agora.getMinutes() / 60;
  const passouCorteML     = horaAtual >= 14;
  const passouCorteShopee = horaAtual >= 16;

  // Filtra pelo canal selecionado
  const base = nfs.filter(n => matchCanal(n, canalSel));

  // "Enviar hoje" = sem danfe + emitida hoje + (antes do corte do canal)
  const enviarHoje = base.filter(n => {
    if (!isSemDanfe(n.situacao)) return false;
    if (n.dataEmissao !== hoje) return false;
    const mkt = (n.marketplace || '').toLowerCase();
    if (mkt.includes('shopee')) return !passouCorteShopee;
    if (mkt.includes('ml'))     return !passouCorteML;
    return true; // outros canais: sempre hoje
  });

  // "Enviar amanhã" = sem danfe + hoje + após corte do canal
  const enviarAmanha = base.filter(n => {
    if (!isSemDanfe(n.situacao)) return false;
    if (n.dataEmissao !== hoje) return false;
    const mkt = (n.marketplace || '').toLowerCase();
    if (mkt.includes('shopee')) return passouCorteShopee;
    if (mkt.includes('ml'))     return passouCorteML;
    return false;
  });

  // "Atrasados" = sem danfe + data anterior a hoje
  const atrasados = base.filter(n =>
    isSemDanfe(n.situacao) && n.dataEmissao < hoje
  );

  // "Importados" = já no sistema
  const importados = base.filter(n => clonados.has(String(n.id)));

  const cards = [
    {
      label: 'Enviar hoje',
      valor: enviarHoje.length,
      sub:   enviarHoje.length === 0 ? '—' : 'Sem DANFE dentro do corte',
      cor:   enviarHoje.length > 0 ? 'vermelho' : 'slate',
      Icon:  Flame,
    },
    {
      label: 'Enviar amanhã',
      valor: enviarAmanha.length,
      sub:   'Sem DANFE após corte do canal',
      cor:   enviarAmanha.length > 0 ? 'amber' : 'slate',
      Icon:  Clock,
    },
    {
      label: 'Atrasados',
      valor: atrasados.length,
      sub:   atrasados.length > 0 ? 'Dias anteriores sem expedir' : '—',
      cor:   atrasados.length > 0 ? 'red' : 'slate',
      Icon:  AlertTriangle,
    },
    {
      label: 'Já no sistema',
      valor: importados.length,
      sub:   'Pedidos criados na expedição',
      cor:   'emerald',
      Icon:  CheckCircle2,
    },
  ];

  const coresCls = {
    vermelho: { num: 'text-red-400',     icon: 'text-red-400/60'     },
    amber:    { num: 'text-amber-400',   icon: 'text-amber-400/60'   },
    red:      { num: 'text-red-500',     icon: 'text-red-500/60'     },
    emerald:  { num: 'text-emerald-400', icon: 'text-emerald-400/60' },
    slate:    { num: 'text-slate-400',   icon: 'text-slate-600'      },
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {cards.map(c => {
        const cls = coresCls[c.cor];
        return (
          <div key={c.label} className="rounded-xl bg-slate-800 border border-white/5 px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">{c.label}</p>
              <c.Icon size={14} className={cls.icon}/>
            </div>
            <p className={`text-3xl font-bold tabular-nums ${cls.num}`}>{c.valor}</p>
            <p className="text-xs text-slate-600 leading-tight">{c.sub}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Range Picker ─────────────────────────────────────────────────────────────
const PRESETS = [
  { id: 'hoje',   label: 'Hoje'           },
  { id: 'ontem',  label: 'Ontem'          },
  { id: '3dias',  label: 'Últimos 3 dias' },
  { id: '7dias',  label: 'Última semana'  },
  { id: '15dias', label: 'Últimos 15 dias'},
  { id: 'mes',    label: 'Este mês'       },
  { id: 'custom', label: 'Personalizado'  },
];

function calcPreset(id) {
  const h = isoHoje();
  switch (id) {
    case 'hoje':   return { ini: h,              fim: h               };
    case 'ontem':  return { ini: addDias(h,-1),  fim: addDias(h,-1)  };
    case '3dias':  return { ini: addDias(h,-2),  fim: h               };
    case '7dias':  return { ini: addDias(h,-6),  fim: h               };
    case '15dias': return { ini: addDias(h,-14), fim: h               };
    case 'mes': {
      const d = new Date();
      return { ini: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`, fim: h };
    }
    default: return null;
  }
}

function MiniCal({ ano, mes, rangeIni, rangeFim, hoverDate, onDay, onHover }) {
  const total  = diasNoMes(ano, mes);
  const offset = primeiroDiaSemana(ano, mes);
  const DIAS   = ['D','S','T','Q','Q','S','S'];

  function iso(d) { return `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

  function classDay(d) {
    const date  = iso(d);
    const fim   = hoverDate && !rangeFim ? hoverDate : rangeFim;
    const start = rangeIni && fim ? (rangeIni <= fim ? rangeIni : fim) : rangeIni;
    const end   = rangeIni && fim ? (rangeIni <= fim ? fim : rangeIni) : fim;
    const isStart = date === start;
    const isEnd   = date === end;
    const inRange = start && end && date > start && date < end;
    const isToday = date === isoHoje();
    let cls = 'w-8 h-8 flex items-center justify-center text-xs cursor-pointer select-none transition-colors ';
    if (isStart || isEnd)    cls += 'bg-emerald-500 text-white font-semibold rounded-full ';
    else if (inRange)        cls += 'bg-emerald-500/15 text-emerald-300 ';
    else if (isToday)        cls += 'border border-emerald-500/50 text-emerald-400 rounded-full hover:bg-slate-700 ';
    else                     cls += 'text-slate-300 hover:bg-slate-700 rounded-full ';
    return cls;
  }

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DIAS.map((d,i) => <div key={i} className="w-8 h-6 flex items-center justify-center text-[10px] font-medium text-slate-600">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => (
          <div key={i} className="flex items-center justify-center">
            {d ? (
              <div className={classDay(d)}
                onClick={() => onDay(iso(d))}
                onMouseEnter={() => onHover?.(iso(d))}>
                {d}
              </div>
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
  const [mesEsq, setMesEsq] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth()-1 < 0 ? 11 : hoje.getMonth()-1 });
  const [mesDir, setMesDir] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });

  function nav(setter, dir) {
    setter(p => {
      let m = p.mes + dir, a = p.ano;
      if (m < 0)  { m = 11; a--; }
      if (m > 11) { m = 0;  a++; }
      return { ano: a, mes: m };
    });
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
    else { date < tempIni ? (setTempFim(tempIni), setTempIni(date)) : setTempFim(date); setSelecting(null); }
  }

  const labelRange = tempIni && tempFim
    ? (tempIni === tempFim ? fmtBR(tempIni) : `${fmtBR(tempIni)} → ${fmtBR(tempFim)}`)
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
          <div className={`flex-1 rounded-lg border px-3 py-1.5 text-sm text-center transition-colors ${selecting==='ini'?'border-emerald-500 text-emerald-400':'border-white/10 text-slate-300'}`}>{fmtBR(tempIni)||'Início'}</div>
          <span className="text-slate-600 text-xs">→</span>
          <div className={`flex-1 rounded-lg border px-3 py-1.5 text-sm text-center transition-colors ${selecting==='fim'?'border-emerald-500 text-emerald-400':'border-white/10 text-slate-300'}`}>{fmtBR(tempFim)||'Fim'}</div>
        </div>
        <div className="flex gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => nav(setMesEsq,-1)} className="p-1 text-slate-500 hover:text-slate-300"><ChevronLeft size={14}/></button>
              <span className="text-xs font-medium text-slate-300 w-28 text-center">{fmtMesAno(mesEsq.ano, mesEsq.mes)}</span>
              <button onClick={() => nav(setMesEsq,1)}  className="p-1 text-slate-500 hover:text-slate-300"><ChevronRight size={14}/></button>
            </div>
            <MiniCal {...mesEsq} rangeIni={tempIni} rangeFim={tempFim} hoverDate={hoverDate} onDay={handleDay} onHover={d => selecting==='fim'&&setHoverDate(d)}/>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => nav(setMesDir,-1)} className="p-1 text-slate-500 hover:text-slate-300"><ChevronLeft size={14}/></button>
              <span className="text-xs font-medium text-slate-300 w-28 text-center">{fmtMesAno(mesDir.ano, mesDir.mes)}</span>
              <button onClick={() => nav(setMesDir,1)}  className="p-1 text-slate-500 hover:text-slate-300"><ChevronRight size={14}/></button>
            </div>
            <MiniCal {...mesDir} rangeIni={tempIni} rangeFim={tempFim} hoverDate={hoverDate} onDay={handleDay} onHover={d => selecting==='fim'&&setHoverDate(d)}/>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-xs text-slate-500">{labelRange}</span>
          <div className="flex gap-2">
            <button onClick={() => onConfirm(ini, fim)} className="px-4 py-1.5 rounded-lg text-sm border border-white/10 text-slate-400 hover:text-slate-200 transition-colors">Cancelar</button>
            <button onClick={() => onConfirm(tempIni, tempFim||tempIni)} disabled={!tempIni}
              className="px-4 py-1.5 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold transition-colors">Filtrar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Row NF ───────────────────────────────────────────────────────────────────
function NFRow({ nf, clonados, onClonar, onExpand, expandido, detalhe, expandindo }) {
  const jaCriado = clonados.has(String(nf.id));
  return (
    <div className={`rounded-xl border transition-colors ${expandido ? 'bg-slate-800 border-white/10' : 'bg-slate-800/50 border-white/5 hover:border-white/10'}`}>
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => onExpand(nf.id)}>
        <span className="text-xs font-mono text-slate-500 w-16 shrink-0">#{nf.numero}</span>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${canalCor(nf.marketplace)}`}>{nf.marketplace||'?'}</span>
        <span className="flex-1 text-sm text-slate-300 truncate text-left">{nf.cliente?.nome||'—'}</span>
        <span className="hidden sm:block text-sm tabular-nums text-slate-400 w-28 text-right shrink-0">{detalhe?.valorTotal ? BRL.format(detalhe.valorTotal) : '—'}</span>
        <span className="hidden md:block text-xs text-slate-600 w-20 text-right shrink-0">{fmtBR(nf.dataEmissao)}</span>
        <div className="shrink-0"><SituacaoBadge sit={nf.situacao}/></div>
        {jaCriado && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={10}/> No sistema
          </span>
        )}
        <div className="shrink-0 text-slate-600">
          {expandindo ? <Loader2 size={15} className="animate-spin"/> : expandido ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
        </div>
      </button>

      {expandido && detalhe && (
        <div className="border-t border-white/5 px-4 py-4">
          {detalhe.numeroPedido && (
            <p className="text-xs text-slate-500 mb-3 flex items-center gap-1">
              <Hash size={11}/> Pedido loja: <span className="text-slate-300 font-mono ml-1">{detalhe.numeroPedido}</span>
            </p>
          )}
          {detalhe.itens?.length > 0 ? (
            <div className="space-y-2 mb-4">
              {detalhe.itens.map((it, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-900/60 px-3 py-2">
                  <span className="shrink-0 w-7 h-7 rounded-md bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">{it.qty}</span>
                  <span className="flex-1 text-sm text-slate-300 truncate">{it.nome||'—'}</span>
                  {it.sku
                    ? <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20"><Tag size={9}/>{it.sku}</span>
                    : <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-orange-500/10 text-orange-400 border border-orange-500/20"><AlertTriangle size={9}/>Sem SKU</span>
                  }
                  <span className="shrink-0 text-xs text-slate-500 tabular-nums w-20 text-right">{BRL.format(it.preco)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600 mb-4">Nenhum item encontrado nesta NF.</p>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-semibold text-slate-200">Total: {detalhe.valorTotal ? BRL.format(detalhe.valorTotal) : '—'}</span>
            {jaCriado ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={14}/> Pedido já criado no sistema
              </span>
            ) : (
              <button onClick={() => onClonar(nf, detalhe)} disabled={!detalhe.itens?.length}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors">
                <PackagePlus size={15}/> Criar Pedido na Expedição
              </button>
            )}
          </div>
        </div>
      )}
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
  const [nfs,         setNfs]         = useState([]);       // sempre loja=all
  const [loadingNfs,  setLoadingNfs]  = useState(false);
  const [erro,        setErro]        = useState(null);
  const [expandidos,  setExpandidos]  = useState({});
  const [expandindo,  setExpandindo]  = useState(null);
  const [clonados,    setClonados]    = useState(getClonados);
  const [toast,       setToast]       = useState(null);
  const pollingRef = useRef(null);
  const pickerRef  = useRef(null);

  // Fecha picker ao clicar fora
  useEffect(() => {
    function h(e) { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Status polling ────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try { const r = await fetch('/bling/status'); setStatus(await r.json()); } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 30_000);
    return () => clearInterval(pollingRef.current);
  }, [fetchStatus]);

  // ── Buscar NFs — sempre loja=all, canal filtrado localmente ───────
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
    } catch (e) { setErro(e.message); }
    finally { setLoadingNfs(false); }
  }, [rangeIni, rangeFim]);

  useEffect(() => { fetchNFs(); }, [fetchNFs]);

  function handleRangeConfirm(ini, fim) { setRangeIni(ini); setRangeFim(fim); setShowPicker(false); }

  // ── Expandir NF ───────────────────────────────────────────────────
  async function handleExpand(id) {
    if (expandidos[id]) { setExpandidos(p => { const n={...p}; delete n[id]; return n; }); return; }
    setExpandindo(id);
    try {
      const r = await fetch(`/bling/pedidos/${id}`);
      const d = await r.json();
      setExpandidos(p => ({ ...p, [id]: d.item }));
    } catch (e) { showToast(`Erro: ${e.message}`, 'err'); }
    finally { setExpandindo(null); }
  }

  // ── Clonar NF ─────────────────────────────────────────────────────
  async function handleClonar(nf, detalhe) {
    try {
      const res  = await fetch('/bling/clonar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blingNfId: nf.id, marketplace: nf.marketplace, itens: detalhe.itens, clienteNome: nf.cliente?.nome||'', numeroPedido: detalhe.numeroPedido||'' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error||'Falha');
      addClonado(nf.id); setClonados(getClonados());
      let msg = `✅ Pedido ${data.orderId} criado!`;
      if (data.skusFaltando?.length) msg += ` ⚠️ SKUs: ${data.skusFaltando.join(', ')}`;
      showToast(msg, 'ok');
    } catch (e) { showToast(`Erro: ${e.message}`, 'err'); }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar o Bling?')) return;
    await fetch('/bling/disconnect', { method: 'POST' }); fetchStatus();
  }

  function showToast(msg, tipo = 'ok') { setToast({ msg, tipo }); setTimeout(() => setToast(null), 4000); }

  // ── Contagem por canal (sobre todas as NFs, antes do filtro de canal) ──
  const contagemCanal = useMemo(() => {
    const m = {};
    nfs.forEach(n => {
      const canal = CANAIS.find(c => c.match && c.match(n.marketplace||''));
      const id    = canal?.id || 'all';
      m[id] = (m[id]||0) + 1;
    });
    return m;
  }, [nfs]);

  // ── Filtro local: canal + situação ─────────────────────────────────
  const nfsFiltradas = useMemo(() => {
    return nfs.filter(n => {
      // canal
      if (!matchCanal(n, canalSel)) return false;
      // situação — BUG FIX: usar isSemDanfe/isComDanfe ao invés de includes genérico
      if (situacaoSel === 'sem_danfe') return isSemDanfe(n.situacao);
      if (situacaoSel === 'danfe')     return isComDanfe(n.situacao);
      return true;
    });
  }, [nfs, canalSel, situacaoSel]);

  const labelRange = rangeIni === rangeFim ? fmtBR(rangeIni) : `${fmtBR(rangeIni)} → ${fmtBR(rangeFim)}`;

  return (
    <div className="text-slate-100 px-4 py-8 max-w-6xl mx-auto">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border max-w-sm
          ${toast.tipo==='ok' ? 'bg-emerald-900/90 border-emerald-600 text-emerald-300' : 'bg-red-900/90 border-red-600 text-red-300'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Zap size={20} className="text-yellow-400"/> Pedidos do Bling</h1>
          <p className="text-sm text-slate-500 mt-0.5">NFs de saída autorizadas — importe para a fila de separação</p>
        </div>
        {status && (
          <div className="flex items-center gap-2">
            {status.authorized ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
                  Bling conectado
                  {status.updatedAtMs && <span className="text-emerald-600 text-xs">· {new Date(status.updatedAtMs).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>}
                </div>
                <button onClick={handleDisconnect} title="Desconectar"
                  className="p-2 rounded-lg bg-slate-800 border border-white/10 text-slate-500 hover:text-red-400 hover:border-red-500/30 transition-colors">
                  <Unplug size={15}/>
                </button>
              </>
            ) : (
              <a href="/bling/auth" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm font-medium hover:bg-yellow-500/20 transition-colors">
                <Plug size={14}/> Conectar Bling
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Corte do dia ─────────────────────────────────────────── */}
      <CorteWidget/>

      {/* ── Filtros ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 mb-5">
        {/* Range + refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative" ref={pickerRef}>
            <button onClick={() => setShowPicker(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors
                ${showPicker ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-white/10 text-slate-300 hover:border-white/20'}`}>
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
        </div>

        {/* Canal com contagem + situação */}
        <div className="flex items-center gap-2 flex-wrap">
          {CANAIS.map(c => {
            const count = c.id === 'all' ? nfs.length : (contagemCanal[c.id] || 0);
            const ativo = canalSel === c.id;
            return (
              <button key={c.id} onClick={() => setCanalSel(c.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                  ${ativo
                    ? c.id === 'all' ? 'bg-slate-600 border-slate-500 text-white' : COR_CANAL[c.cor]
                    : 'bg-slate-800 border-white/10 text-slate-500 hover:text-slate-300'}`}>
                {c.label}
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${ativo ? 'bg-white/20' : 'bg-slate-700 text-slate-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          <span className="w-px h-4 bg-white/10 mx-1"/>

          {[{id:'all',label:'Todas'},{id:'sem_danfe',label:'Sem DANFE'},{id:'danfe',label:'Com DANFE'}].map(s => (
            <button key={s.id} onClick={() => setSituacaoSel(s.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                ${situacaoSel === s.id ? 'bg-slate-600 border-slate-500 text-white' : 'bg-slate-800 border-white/10 text-slate-500 hover:text-slate-300'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cards inteligentes ────────────────────────────────────── */}
      {!loadingNfs && !erro && nfs.length > 0 && (
        <CardsInteligentes nfs={nfs} clonados={clonados} canalSel={canalSel}/>
      )}

      {/* ── Erro ─────────────────────────────────────────────────── */}
      {erro && (
        <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 text-red-400 text-sm mb-5 flex items-center gap-2">
          <AlertTriangle size={15}/> {erro}
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────── */}
      {loadingNfs && (
        <div className="space-y-2">
          {[...Array(6)].map((_,i) => <div key={i} className="h-14 rounded-xl bg-slate-800 border border-white/5 animate-pulse"/>)}
        </div>
      )}

      {/* ── Lista NFs ────────────────────────────────────────────── */}
      {!loadingNfs && !erro && (
        nfsFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Inbox size={36} className="text-slate-700"/>
            <p className="text-slate-500 text-sm">
              {nfs.length === 0 ? `Nenhuma NF no período ${fmtBR(rangeIni)} → ${fmtBR(rangeFim)}.` : 'Nenhuma NF para os filtros selecionados.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[4rem_6rem_1fr_7rem_6rem_8rem_2rem] gap-3 px-4 py-1.5 text-[11px] font-medium text-slate-600 uppercase tracking-wider">
              <span>NF</span><span>Canal</span><span>Cliente</span>
              <span className="text-right">Valor</span><span className="text-right">Data</span>
              <span>Situação</span><span/>
            </div>
            {nfsFiltradas.map(nf => (
              <NFRow key={nf.id} nf={nf} clonados={clonados}
                onClonar={handleClonar} onExpand={handleExpand}
                expandido={!!expandidos[nf.id]} detalhe={expandidos[nf.id]||null}
                expandindo={expandindo===nf.id}/>
            ))}
            <p className="text-xs text-slate-700 text-center pt-2">
              {nfsFiltradas.length} NF{nfsFiltradas.length!==1?'s':''} exibida{nfsFiltradas.length!==1?'s':''}
              {nfsFiltradas.length!==nfs.length?` de ${nfs.length} no período`:''}
            </p>
          </div>
        )
      )}
    </div>
  );
}
