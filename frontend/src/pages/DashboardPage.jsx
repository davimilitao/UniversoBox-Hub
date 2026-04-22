/**
 * @file DashboardPage.jsx
 * @description Painel operacional do dia — visão unificada de pedidos ML.
 *   Hierarquia: urgente (corte + ação) → modalidades → reclamações → lista
 *   Dados via GET /api/ml/dashboard (endpoint agregado, 1 chamada)
 * @version 2.0.0
 * @date 2026-04-05
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import AcaminhoWidget from './expedicao/compras/AcaminhoWidget.jsx';
import { auth } from '../firebase';
import {
  Package, Zap, Building2, Boxes,
  Clock, RefreshCw,
  ChevronRight, Wifi, WifiOff,
  XCircle, CheckCircle2, Timer, ShieldAlert, ArrowRight,
  TrendingUp, BarChart3, Info,
  Truck, Heart, DollarSign, PackageCheck,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getToken() {
  try { return await auth.currentUser?.getIdToken(false); } catch { return null; }
}

const DIAS_EN    = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DIAS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function nowBR() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date());
}

function dateBR() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long', day: '2-digit', month: 'long',
  }).format(new Date());
}

function minutesUntilCutoff(cutoffHHMM) {
  if (!cutoffHHMM) return null;
  const [h, m] = cutoffHHMM.split(':').map(Number);
  const now = new Date();
  const br  = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const cutoff = new Date(`${br}T${cutoffHHMM}:00`);
  return Math.round((cutoff - now) / 60000);
}

function formatCountdown(minutes) {
  if (minutes === null) return null;
  if (minutes < 0) return 'encerrado';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// ─── sub-componentes ──────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center gap-2 text-slate-400 text-sm">
      <RefreshCw size={14} className="animate-spin" />
      Carregando dados do dia…
    </div>
  );
}

function MLOffline({ onRetry }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex items-start gap-4">
      <WifiOff size={22} className="text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-amber-300 font-semibold text-sm">Mercado Livre não conectado</p>
        <p className="text-amber-400/70 text-xs mt-1">
          Autentique sua conta ML em <strong>Configurações → Integrações</strong>.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="text-xs text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg hover:bg-amber-500/10 transition-colors shrink-0"
      >
        Tentar novamente
      </button>
    </div>
  );
}

function CutoffBanner({ cutoffSchedule, summary }) {
  const todayKey  = DIAS_EN[new Date().getDay()];
  const cutoff    = cutoffSchedule?.[todayKey] || cutoffSchedule?.default || null;
  const minutes   = minutesUntilCutoff(cutoff);
  const countdown = formatCountdown(minutes);
  const pendentes = (summary.flex || 0) + (summary.agency || 0);

  if (!cutoff && !pendentes) return null;

  const urgente  = minutes !== null && minutes >= 0 && minutes <= 90;
  const expirado = minutes !== null && minutes < 0;

  return (
    <div className={[
      'rounded-2xl border p-4 flex items-center gap-4 transition-all',
      urgente  ? 'border-rose-500/40 bg-rose-500/8'          : '',
      expirado ? 'border-slate-700/40 bg-slate-900/40 opacity-60' : '',
      !urgente && !expirado ? 'border-emerald-500/20 bg-emerald-500/5' : '',
    ].join(' ')}>
      <div className={[
        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
        urgente  ? 'bg-rose-500/15' : expirado ? 'bg-slate-800' : 'bg-emerald-500/10',
      ].join(' ')}>
        <Timer size={20} className={urgente ? 'text-rose-400' : expirado ? 'text-slate-500' : 'text-emerald-400'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={['font-semibold text-sm', urgente ? 'text-rose-300' : expirado ? 'text-slate-500' : 'text-slate-200'].join(' ')}>
          {expirado
            ? `Corte encerrado às ${cutoff}`
            : cutoff
            ? `Corte hoje às ${cutoff} — ${countdown} restantes`
            : `${pendentes} pedido${pendentes !== 1 ? 's' : ''} para expedir`}
        </p>
        <p className="text-slate-500 text-xs mt-0.5">
          {summary.flex || 0} Flex · {summary.agency || 0} Agência · {summary.fulfillment || 0} Full
        </p>
      </div>
      {pendentes > 0 && (
        <Link
          to="/expedicao/bling"
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors shrink-0"
        >
          Expedir <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

function CutoffWeek({ cutoffSchedule }) {
  if (!cutoffSchedule) return null;
  const todayIdx = new Date().getDay();
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Clock size={11} /> Horário de coleta semanal
      </p>
      <div className="grid grid-cols-7 gap-1">
        {DIAS_EN.map((key, i) => {
          const h = cutoffSchedule[key] || cutoffSchedule.default || '—';
          const isToday   = i === todayIdx;
          const isWeekend = i === 0 || i === 6;
          return (
            <div key={key} className={[
              'rounded-xl p-2 text-center',
              isToday   ? 'bg-emerald-500/15 ring-1 ring-emerald-500/30' : 'bg-slate-800/40',
              isWeekend ? 'opacity-35' : '',
            ].join(' ')}>
              <p className={['text-[10px] font-medium mb-1', isToday ? 'text-emerald-400' : 'text-slate-500'].join(' ')}>
                {DIAS_SHORT[i]}
              </p>
              <p className={['text-xs font-bold tabular-nums', isToday ? 'text-emerald-300' : 'text-slate-300'].join(' ')}>
                {isWeekend ? '—' : h}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModalidadeCard({ icon: Icon, label, count, sub, href, disabled, colors }) {
  const inner = (
    <div className={[
      'rounded-2xl border p-4 flex flex-col gap-3 transition-all h-full',
      disabled ? 'opacity-40' : 'hover:brightness-110',
      colors.border, colors.bg,
    ].join(' ')}>
      <div className="flex items-start justify-between">
        <div className={['w-9 h-9 rounded-xl flex items-center justify-center', colors.iconBg].join(' ')}>
          <Icon size={18} className={colors.icon} />
        </div>
        <span className={['text-2xl font-bold tabular-nums leading-none', colors.count].join(' ')}>
          {count}
        </span>
      </div>
      <div>
        <p className="text-slate-200 font-semibold text-sm">{label}</p>
        {sub && <p className={['text-xs mt-0.5', colors.sub || 'text-slate-500'].join(' ')}>{sub}</p>}
      </div>
      {!disabled && href && (
        <p className={['text-xs font-medium flex items-center gap-1 mt-auto', colors.action].join(' ')}>
          Imprimir <ChevronRight size={11} />
        </p>
      )}
    </div>
  );
  return href && !disabled ? <Link to={href} className="contents">{inner}</Link> : inner;
}

function AuthCodeCard({ authCode }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(authCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  if (!authCode) return null;
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
        <Info size={18} className="text-blue-400" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-slate-500 font-medium">Código de autorização de hoje</p>
        <p className="text-blue-300 font-bold text-2xl tabular-nums tracking-[0.2em] mt-0.5">{authCode}</p>
      </div>
      <button onClick={copy} className="text-xs px-3 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors shrink-0">
        {copied ? '✓ Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

function ClaimsCard({ claims }) {
  const total = claims.length;
  if (!total) {
    return (
      <div className="rounded-2xl border border-slate-800/40 bg-slate-900/30 p-4 flex items-center gap-3">
        <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
        <p className="text-slate-400 text-sm">Nenhuma reclamação aberta</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center shrink-0">
        <ShieldAlert size={20} className="text-rose-400" />
      </div>
      <div className="flex-1">
        <p className="text-rose-300 font-semibold text-sm">
          {total} reclamação{total !== 1 ? 'ões' : ''} aberta{total !== 1 ? 's' : ''}
        </p>
        <p className="text-rose-400/60 text-xs mt-0.5">Requer atenção — responda antes do prazo</p>
      </div>
      <a
        href="https://www.mercadolivre.com.br/vendas/reclamacoes"
        target="_blank" rel="noreferrer"
        className="text-xs text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 transition-colors shrink-0"
      >
        Ver no ML
      </a>
    </div>
  );
}

const STATUS_STYLE = {
  imprimir:  { label: 'Imprimir', cls: 'text-amber-400 bg-amber-500/10'   },
  expedir:   { label: 'Expedir',  cls: 'text-blue-400 bg-blue-500/10'     },
  enviado:   { label: 'Enviado',  cls: 'text-emerald-400 bg-emerald-500/10' },
  cancelado: { label: 'Cancelado',cls: 'text-red-400 bg-red-500/10'       },
};
const LOG_ICONS = {
  flex:        <Zap size={12} className="text-purple-400" />,
  agency:      <Building2 size={12} className="text-blue-400" />,
  fulfillment: <Boxes size={12} className="text-teal-400" />,
};

function PedidosRecentes({ orders }) {
  const visible = orders.slice(0, 10);
  if (!visible.length) return null;
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Pedidos do dia · {orders.length} total
        </p>
        <Link to="/expedicao/bling" className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
          Ver todos <ChevronRight size={12} />
        </Link>
      </div>
      <div className="divide-y divide-slate-800/40">
        {visible.map(o => {
          const st = STATUS_STYLE[o._localStatus] || STATUS_STYLE.imprimir;
          return (
            <div key={o.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-800/20 transition-colors">
              <span className="text-slate-500 shrink-0">{LOG_ICONS[o.logistica] || <Package size={12} />}</span>
              <div className="flex-1 min-w-0">
                <p className="text-slate-300 text-xs font-medium truncate">{o.buyer || `#${o.id}`}</p>
                {o.items?.[0] && <p className="text-slate-600 text-[11px] truncate">{o.items[0].name}</p>}
              </div>
              <span className={['text-[10px] font-semibold px-2 py-0.5 rounded-full', st.cls].join(' ')}>
                {st.label}
              </span>
              <p className="text-slate-600 text-[11px] tabular-nums shrink-0">{o._createdTime}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Panorama home ────────────────────────────────────────────────────────────

function MiniCard({ icon: Icon, label, value, sub, color, href }) {
  const inner = (
    <div className={`rounded-2xl border p-4 flex flex-col gap-2 transition-all ${href ? 'hover:brightness-110 cursor-pointer' : ''} border-slate-800/60 bg-slate-900/40`}>
      <div className="flex items-center justify-between">
        <Icon size={14} className={color} />
        {href && <ChevronRight size={12} className="text-slate-600" />}
      </div>
      <div>
        <p className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
        <p className="text-slate-500 text-xs mt-1 font-medium">{label}</p>
        {sub && <p className="text-slate-600 text-[10px] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  return href ? <Link to={href} className="contents">{inner}</Link> : inner;
}

function ColetaHoje() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    getToken().then(token =>
      fetch(`/api/coletas/resumo-dia?data=${today}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then(r => r.ok ? r.json() : null)
      .then(j => j?.data && setData(j.data))
      .catch(() => {})
    );
  }, []);

  const n = data?.coletas?.length ?? 0;
  const sub = n > 0
    ? data.coletas.map(c => c.veiculo_placa).join(', ')
    : 'Nenhum agendado';

  return (
    <MiniCard
      icon={Truck}
      label="Coleta hoje"
      value={n === 0 ? '—' : `${n} veículo${n !== 1 ? 's' : ''}`}
      sub={sub}
      color={n > 0 ? 'text-emerald-400' : 'text-slate-500'}
      href="/expedicao/coletas"
    />
  );
}

function ComprasACaminho() {
  const [data, setData] = useState({ count: 0, valor: 0 });
  useEffect(() => {
    getToken().then(token =>
      fetch('/api/purchase-orders?status=pending&limit=100', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!j?.items) return;
        const valor = j.items.reduce((s, p) => s + (p.valorTotal || 0), 0);
        setData({ count: j.items.length, valor });
      })
      .catch(() => {})
    );
  }, []);

  const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  return (
    <MiniCard
      icon={Truck}
      label="A caminho"
      value={data.count === 0 ? '—' : data.count}
      sub={data.count > 0 ? `${BRL0.format(data.valor)} em trânsito` : 'Nenhuma compra aberta'}
      color={data.count > 0 ? 'text-blue-400' : 'text-slate-500'}
      href="/expedicao/compras"
    />
  );
}

function Pill({ Icon, label, count, tone, sub, disabled }) {
  const tones = {
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
    blue:   'border-blue-500/30   bg-blue-500/10   text-blue-300',
    teal:   'border-teal-500/30   bg-teal-500/10   text-teal-300',
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-2.5 ${tones[tone]} ${disabled ? 'opacity-70' : ''}`}>
      <Icon size={16} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold tabular-nums leading-none">{count}</span>
          <span className="text-xs font-medium opacity-90">{label}</span>
        </div>
        {sub && <p className="text-[10px] opacity-60 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function ExpedicaoHero({ summary, cutoffSchedule }) {
  const pendentes = (summary.flex || 0) + (summary.agency || 0);
  const todayKey  = DIAS_EN[new Date().getDay()];
  const cutoff    = cutoffSchedule?.[todayKey] || cutoffSchedule?.default || null;
  const minutes   = minutesUntilCutoff(cutoff);
  const countdown = formatCountdown(minutes);
  const urgente   = minutes !== null && minutes >= 0 && minutes <= 90;
  const expirado  = minutes !== null && minutes < 0;

  return (
    <section className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] via-slate-900/60 to-slate-900/40 p-5 sm:p-6 space-y-4">
      {/* Label + título */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <PackageCheck size={18} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-400/80 font-bold">Expedição do dia</p>
          <h2 className="text-slate-100 font-bold text-base leading-tight">O que precisa sair hoje</h2>
        </div>
      </div>

      {/* Contador grande */}
      <div className="flex items-end gap-3 flex-wrap">
        <p className="text-6xl sm:text-7xl font-black text-emerald-300 tabular-nums leading-none">
          {pendentes}
        </p>
        <p className="text-slate-400 text-sm pb-2">
          pedidos para expedir
          {summary.semEtiqueta > 0 && <span className="block text-amber-400/80 text-xs">{summary.semEtiqueta} sem etiqueta</span>}
        </p>
      </div>

      {/* Cutoff inline */}
      {cutoff && (
        <div className={`rounded-xl border px-3 py-2 flex items-center gap-2 text-xs ${
          urgente  ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                   : expirado ? 'border-slate-700 bg-slate-900/40 text-slate-500'
                              : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
        }`}>
          <Timer size={12} className="shrink-0" />
          <span className="font-medium">
            {expirado ? `Corte encerrado às ${cutoff}` : `Corte às ${cutoff} — ${countdown} restantes`}
          </span>
        </div>
      )}

      {/* Pills por modalidade */}
      <div className="grid grid-cols-3 gap-2">
        <Pill Icon={Zap}       label="Flex"    count={summary.flex || 0}        tone="purple" />
        <Pill Icon={Building2} label="Agência" count={summary.agency || 0}      tone="blue"   />
        <Pill Icon={Boxes}     label="Full"    count={summary.fulfillment || 0} tone="teal"   sub="ML despacha" disabled />
      </div>

      {/* CTA principal */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Link
          to="/expedicao/bling"
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm py-3 rounded-xl transition-colors"
        >
          Ir para Expedição <ArrowRight size={15} />
        </Link>
        <Link
          to="/expedicao/pedidos"
          className="flex-1 flex items-center justify-center gap-2 border border-emerald-500/30 text-emerald-300 font-medium text-sm py-3 rounded-xl hover:bg-emerald-500/5 transition-colors"
        >
          Fila de Separação <ChevronRight size={14} />
        </Link>
      </div>
    </section>
  );
}

function FinanceiroSnapshot() {
  const d = new Date();
  const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const mp     = parseFloat(localStorage.getItem(`painel_saldo_${mes}_mp`)     || '0');
  const banco  = parseFloat(localStorage.getItem(`painel_saldo_${mes}_banco`)  || '0');
  const outros = parseFloat(localStorage.getItem(`painel_saldo_${mes}_outros`) || '0');
  const cofre  = parseFloat(localStorage.getItem('saude_cofre')    || '0');
  const liberar= parseFloat(localStorage.getItem('saude_saldo_liberar') || '0');
  const total  = mp + banco + outros + cofre + liberar;

  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  return (
    <MiniCard
      icon={Heart}
      label="Disponível"
      value={BRL.format(total)}
      sub="Saldo + Cofre + A Liberar"
      color={total >= 0 ? 'text-emerald-400' : 'text-rose-400'}
      href="/financeiro/saude"
    />
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [clock,   setClock]   = useState(nowBR());
  const tickRef = useRef(null);

  useEffect(() => {
    tickRef.current = setInterval(() => setClock(nowBR()), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res   = await fetch('/api/ml/dashboard', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Auto-refresh a cada 3 minutos
  useEffect(() => { const id = setInterval(load, 180_000); return () => clearInterval(id); }, [load]);

  const summary = data?.summary || {};

  return (
    <div className="h-full overflow-y-auto scrollbar-none">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-100 capitalize">{dateBR()}</h1>
            <p className="text-slate-500 text-sm font-mono tabular-nums mt-0.5">{clock}</p>
          </div>
          <div className="flex items-center gap-2">
            {data?.mlConnected && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                <Wifi size={10} /> ML conectado
              </span>
            )}
            <button
              onClick={load} disabled={loading}
              className="p-2 rounded-xl border border-slate-800/60 text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-all disabled:opacity-40"
              title="Atualizar"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && !data && (
          <div className="py-16 flex justify-center"><Spinner /></div>
        )}

        {/* Erro */}
        {error && !data && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-red-400 text-sm">
            Erro ao carregar: {error}
          </div>
        )}

        {/* ML offline */}
        {data && !data.mlConnected && <MLOffline onRetry={load} />}

        {/* Painel principal — só quando ML conectado */}
        {data?.mlConnected && (
          <>
            {/* 1 — HERO: Expedição do dia (destaque máximo) */}
            <ExpedicaoHero summary={summary} cutoffSchedule={data.cutoffSchedule} />

            {/* 2 — Panorama dos outros ciclos */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-bold px-1 mb-2">Visão geral</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <ComprasACaminho />
                <FinanceiroSnapshot />
                <ColetaHoje />
                <MiniCard
                  icon={ShieldAlert}
                  label="Reclamações"
                  value={(data.claims || []).length || '—'}
                  sub={(data.claims || []).length > 0 ? 'Requer atenção' : 'Nenhuma aberta'}
                  color={(data.claims || []).length > 0 ? 'text-rose-400' : 'text-emerald-400'}
                />
              </div>
            </div>

            {/* 3 — A Caminho: itens em trânsito (só aparece se houver itens) */}
            <AcaminhoWidget />

            {/* 4 — Código de autorização ML */}
            <AuthCodeCard authCode={data.authCode} />

            {/* 5 — Tabela semanal + atalhos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <CutoffWeek cutoffSchedule={data.cutoffSchedule} />
              <div className="grid grid-cols-2 gap-2 content-start">
                <Link to="/expedicao/insumos"
                  className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-3 hover:bg-slate-800/40 transition-colors flex items-center gap-2.5">
                  <BarChart3 size={15} className="text-slate-400 shrink-0" />
                  <span className="text-slate-400 text-xs font-medium">Insumos</span>
                </Link>
                <Link to="/financeiro/saude"
                  className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-3 hover:bg-slate-800/40 transition-colors flex items-center gap-2.5">
                  <TrendingUp size={15} className="text-slate-400 shrink-0" />
                  <span className="text-slate-400 text-xs font-medium">Financeiro</span>
                </Link>
                <Link to="/expedicao/coletas"
                  className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-3 hover:bg-slate-800/40 transition-colors flex items-center gap-2.5">
                  <Truck size={15} className="text-slate-400 shrink-0" />
                  <span className="text-slate-400 text-xs font-medium">Coletas</span>
                </Link>
                <Link to="/catalogo/produtos"
                  className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-3 hover:bg-slate-800/40 transition-colors flex items-center gap-2.5">
                  <Package size={15} className="text-slate-400 shrink-0" />
                  <span className="text-slate-400 text-xs font-medium">Catálogo</span>
                </Link>
              </div>
            </div>

            {/* 6 — Lista de pedidos do dia */}
            <PedidosRecentes orders={data.orders || []} />

            <p className="text-center text-slate-700 text-xs pb-2">
              Atualizado às {clock} · auto-refresh 3 min
            </p>
          </>
        )}
      </div>
    </div>
  );
}
