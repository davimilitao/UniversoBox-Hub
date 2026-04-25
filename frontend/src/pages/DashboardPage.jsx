/**
 * @file DashboardPage.jsx
 * @description Painel operacional do dia — banco digital. Números reais, ação direta, zero ruído.
 *   Seções: expedição → alertas → coleta do dia → a caminho → reclamações
 * @version 3.0.0
 * @date 2026-04-25
 * @changelog
 *   3.0.0 — 2026-04-25 — Redesign completo: remove data/hora, Visão Geral, PedidosRecentes.
 *                          Adiciona AlertasBand (insumos+contas+cartões) e ColetaWidget inline.
 *   2.0.0 — 2026-04-05 — Versão anterior.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import AcaminhoWidget from './expedicao/compras/AcaminhoWidget.jsx';
import { auth } from '../firebase';
import { useInsumos } from '../hooks/useInsumos';
import { useContasAPagar } from '../hooks/useContasAPagar';
import { useMeiosPagamento } from '../hooks/useMeiosPagamento';
import {
  Zap, Building2, Boxes, RefreshCw,
  Wifi, WifiOff, Timer, ShieldAlert, ArrowRight,
  Truck, AlertTriangle, CreditCard, PackageCheck,
  ChevronRight, Check, Info, Plus, Search, X,
  ChevronDown, DollarSign,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getToken() {
  try { return await auth.currentUser?.getIdToken(false); } catch { return null; }
}

const DIAS_EN    = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DIAS_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function getMondayISO() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(mon);
}

function minutesUntilCutoff(cutoffHHMM) {
  if (!cutoffHHMM) return null;
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

function proxVencimentoCartao(diaVencimento) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const mes  = hoje.getMonth();
  const ano  = hoje.getFullYear();
  const ultimoDiaMes = (m, a) => new Date(a, m + 1, 0).getDate();
  let venc = new Date(ano, mes, Math.min(diaVencimento, ultimoDiaMes(mes, ano)));
  if (venc <= hoje) {
    venc = new Date(ano, mes + 1, Math.min(diaVencimento, ultimoDiaMes(mes + 1, ano)));
  }
  const diff = Math.ceil((venc - hoje) / 86400000);
  return { data: venc, diasRestantes: diff };
}

// ─── componentes base ─────────────────────────────────────────────────────────

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

// ─── ExpedicaoHero ────────────────────────────────────────────────────────────

function ExpedicaoHero({ summary, cutoffSchedule, authCode }) {
  const [copied, setCopied] = useState(false);
  const pendentes  = (summary.flex || 0) + (summary.agency || 0);
  const todayKey   = DIAS_EN[new Date().getDay()];
  const cutoff     = cutoffSchedule?.[todayKey] || cutoffSchedule?.default || null;
  const minutes    = minutesUntilCutoff(cutoff);
  const countdown  = formatCountdown(minutes);
  const urgente    = minutes !== null && minutes >= 0 && minutes <= 90;
  const expirado   = minutes !== null && minutes < 0;

  function copiarCodigo() {
    if (!authCode) return;
    navigator.clipboard.writeText(authCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-slate-900/60 to-slate-900/40 p-5 sm:p-6 space-y-4">

      {/* Título + código ML (compacto no topo) */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <PackageCheck size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-400/80 font-bold">Expedição do dia</p>
            <h2 className="text-slate-100 font-bold text-base leading-tight">O que precisa sair hoje</h2>
          </div>
        </div>
        {authCode && (
          <button
            onClick={copiarCodigo}
            title="Código de autorização ML"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-blue-500/20 bg-blue-500/8 hover:bg-blue-500/15 transition-colors shrink-0"
          >
            <Info size={12} className="text-blue-400" />
            <span className="text-blue-300 font-bold tabular-nums tracking-[0.15em] text-sm">{authCode}</span>
            <span className="text-blue-400/60 text-[10px]">{copied ? '✓' : 'copiar'}</span>
          </button>
        )}
      </div>

      {/* Contador + cutoff */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <p className="text-6xl sm:text-7xl font-black text-emerald-300 tabular-nums leading-none">{pendentes}</p>
          <p className="text-slate-400 text-sm mt-1">
            pedidos para despachar
            {summary.semEtiqueta > 0 && (
              <span className="block text-amber-400 text-xs font-medium mt-0.5">
                ⚠ {summary.semEtiqueta} aguardando etiqueta
              </span>
            )}
          </p>
        </div>
        {cutoff && (
          <div className={`rounded-xl border px-3 py-2 flex items-center gap-2 text-xs mb-0.5 ${
            urgente  ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
            : expirado ? 'border-slate-700 bg-slate-900/40 text-slate-500'
            : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
          }`}>
            <Timer size={12} className="shrink-0" />
            <span className="font-medium">
              {expirado ? `Corte encerrado às ${cutoff}` : `Corte às ${cutoff} — ${countdown}`}
            </span>
          </div>
        )}
      </div>

      {/* Cards por modalidade */}
      <div className="grid grid-cols-3 gap-2">
        <ModalCard icon={Building2} label="Agência" count={summary.agency || 0}
          sub="com etiqueta" tone="blue" href="/expedicao/bling" />
        <ModalCard icon={Zap} label="Flex" count={summary.flex || 0}
          sub="imprimir etiqueta" tone="purple" href="/expedicao/bling" />
        <ModalCard icon={Boxes} label="Full" count={summary.fulfillment || 0}
          sub="ML despacha" tone="teal" disabled />
      </div>

      {/* CTA */}
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

function ModalCard({ icon: Icon, label, count, sub, tone, href, disabled }) {
  const tones = {
    blue:   { border: 'border-blue-500/30',   bg: 'bg-blue-500/10',   icon: 'text-blue-300',   count: 'text-blue-200' },
    purple: { border: 'border-purple-500/30', bg: 'bg-purple-500/10', icon: 'text-purple-300', count: 'text-purple-200' },
    teal:   { border: 'border-teal-500/30',   bg: 'bg-teal-500/10',   icon: 'text-teal-300',   count: 'text-teal-200' },
  };
  const t = tones[tone];
  const inner = (
    <div className={`rounded-2xl border p-3 sm:p-4 flex flex-col gap-2 h-full transition-all
      ${t.border} ${t.bg} ${disabled ? 'opacity-50' : href ? 'hover:brightness-110' : ''}`}>
      <div className="flex items-start justify-between">
        <Icon size={15} className={t.icon} />
        <span className={`text-2xl font-bold tabular-nums leading-none ${t.count}`}>{count}</span>
      </div>
      <div>
        <p className="text-slate-200 font-semibold text-xs">{label}</p>
        {sub && <p className="text-slate-500 text-[10px] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  return href && !disabled ? <Link to={href} className="contents">{inner}</Link> : inner;
}

// ─── AlertasBand ──────────────────────────────────────────────────────────────

function AlertasBand() {
  const { getInsumos } = useInsumos();
  const { kpis } = useContasAPagar();
  const { meios } = useMeiosPagamento();
  const [insumosCriticos, setInsumosCriticos] = useState([]);

  useEffect(() => {
    getInsumos()
      .then(lista => setInsumosCriticos(lista.filter(i => i.estoque_atual <= i.estoque_minimo)))
      .catch(() => {});
  }, [getInsumos]);

  // Cartões vencendo em <= 5 dias
  const cartoesBreve = (meios || [])
    .filter(m => m.ativo && m.diaVencimento)
    .map(m => ({ ...m, ...proxVencimentoCartao(m.diaVencimento) }))
    .filter(m => m.diasRestantes <= 5)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);

  const contasUrgentes = [
    ...(kpis?.vencidas  || []),
    ...(kpis?.hoje_     || []),
  ];

  const alertas = [];

  if (contasUrgentes.length > 0) {
    const totalVencido = (kpis?.totalVencido || 0) + (kpis?.totalHoje || 0);
    alertas.push({
      id: 'contas',
      cor: 'rose',
      icon: DollarSign,
      titulo: contasUrgentes.length === 1
        ? `${contasUrgentes[0].fornecedor || 'Conta'} — vence hoje`
        : `${contasUrgentes.length} contas vencidas ou vencem hoje`,
      sub: BRL.format(totalVencido),
      href: '/financeiro/despesas',
    });
  }

  if (insumosCriticos.length > 0) {
    alertas.push({
      id: 'insumos',
      cor: 'amber',
      icon: AlertTriangle,
      titulo: insumosCriticos.length === 1
        ? `${insumosCriticos[0].nome} — estoque crítico`
        : `${insumosCriticos.length} insumos abaixo do mínimo`,
      sub: insumosCriticos.map(i => i.nome).join(', '),
      href: '/expedicao/insumos',
    });
  }

  if (cartoesBreve.length > 0) {
    const c = cartoesBreve[0];
    alertas.push({
      id: 'cartoes',
      cor: 'orange',
      icon: CreditCard,
      titulo: c.diasRestantes === 0
        ? `${c.nome} vence hoje`
        : `${c.nome} vence em ${c.diasRestantes} dia${c.diasRestantes > 1 ? 's' : ''}`,
      sub: c.diasRestantes === 0 ? 'Pague hoje' : `${c.data.toLocaleDateString('pt-BR')}`,
      href: '/financeiro/despesas',
    });
  }

  if (alertas.length === 0) return null;

  const corCls = {
    rose:   { border: 'border-rose-500/20',   bg: 'bg-rose-500/8',   icon: 'text-rose-400',   dot: 'bg-rose-500',   link: 'text-rose-400 border-rose-500/30 hover:bg-rose-500/10' },
    amber:  { border: 'border-amber-500/20',  bg: 'bg-amber-500/8',  icon: 'text-amber-400',  dot: 'bg-amber-500',  link: 'text-amber-400 border-amber-500/30 hover:bg-amber-500/10' },
    orange: { border: 'border-orange-500/20', bg: 'bg-orange-500/8', icon: 'text-orange-400', dot: 'bg-orange-500', link: 'text-orange-400 border-orange-500/30 hover:bg-orange-500/10' },
  };

  return (
    <div className="space-y-2">
      {alertas.map(a => {
        const c = corCls[a.cor];
        return (
          <div key={a.id} className={`rounded-2xl border ${c.border} ${c.bg} px-4 py-3 flex items-center gap-3`}>
            <div className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
            <a.icon size={15} className={`${c.icon} shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className="text-slate-200 text-sm font-medium truncate">{a.titulo}</p>
              {a.sub && <p className="text-slate-500 text-xs truncate">{a.sub}</p>}
            </div>
            <Link to={a.href} className={`text-xs px-2.5 py-1 rounded-lg border shrink-0 transition-colors ${c.link}`}>
              Ver
            </Link>
          </div>
        );
      })}
    </div>
  );
}

// ─── ColetaWidget ─────────────────────────────────────────────────────────────

function ColetaWidget() {
  const [coletas,   setColetas]   = useState([]);  // agenda desta semana
  const [veiculos,  setVeiculos]  = useState([]);
  const [loadingC,  setLoadingC]  = useState(true);
  const [salvando,  setSalvando]  = useState(false);
  const [form,      setForm]      = useState({ veiculo_placa: '', modalidade: 'agencia' });
  const [busca,     setBusca]     = useState('');
  const [aberto,    setAberto]    = useState(false);
  const today = todayISO();

  async function fetchColetas() {
    const token = await getToken();
    const hdrs  = token ? { Authorization: `Bearer ${token}` } : {};
    const [agendaRes, veicRes] = await Promise.all([
      fetch(`/api/coletas/agenda?semana=${getMondayISO()}`, { headers: hdrs }).then(r => r.ok ? r.json() : null),
      fetch('/api/coletas/veiculos', { headers: hdrs }).then(r => r.ok ? r.json() : null),
    ]);
    setColetas(agendaRes?.data || []);
    setVeiculos((veicRes?.data || []).filter(v => v.ativo));
    setLoadingC(false);
  }

  useEffect(() => { fetchColetas(); }, []);

  const coletasHoje   = coletas.filter(c => c.data === today);
  const feitaHoje     = coletasHoje.length > 0;
  const historicoFilt = coletas
    .filter(c => !busca || (c.veiculo_placa + c.modalidade).toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 5);

  async function registrar() {
    if (!form.veiculo_placa || !form.modalidade) return;
    setSalvando(true);
    try {
      const token = await getToken();
      await fetch('/api/coletas/agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ data: today, ...form }),
      });
      setForm({ veiculo_placa: '', modalidade: 'agencia' });
      setAberto(false);
      await fetchColetas();
    } finally {
      setSalvando(false);
    }
  }

  if (loadingC) return null;

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${
      feitaHoje
        ? 'border-emerald-500/20 bg-emerald-500/5'
        : 'border-amber-500/25 bg-amber-500/6'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Truck size={16} className={feitaHoje ? 'text-emerald-400' : 'text-amber-400'} />
          <div>
            <p className="text-slate-200 font-semibold text-sm">Coleta do dia</p>
            {feitaHoje
              ? <p className="text-emerald-400 text-xs">
                  {coletasHoje.map(c => `${c.modalidade === 'flex' ? 'Flex' : 'Agência'} · ${c.veiculo_placa}`).join(' | ')}
                </p>
              : <p className="text-amber-400 text-xs font-medium">Não registrada hoje</p>
            }
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!feitaHoje && (
            <button
              onClick={() => setAberto(v => !v)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors"
            >
              {aberto ? <X size={12} /> : <Plus size={12} />}
              {aberto ? 'Cancelar' : 'Registrar'}
            </button>
          )}
          {feitaHoje && (
            <button
              onClick={() => setAberto(v => !v)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <Plus size={12} />
              Adicionar
            </button>
          )}
          <Link to="/expedicao/coletas" className="text-slate-500 hover:text-slate-300 transition-colors">
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* Formulário rápido */}
      {aberto && (
        <div className="rounded-xl border border-white/8 bg-slate-800/60 p-3 flex flex-col sm:flex-row gap-2">
          <select
            value={form.modalidade}
            onChange={e => setForm(f => ({ ...f, modalidade: e.target.value }))}
            className="flex-1 rounded-lg bg-slate-900 border border-white/10 text-slate-200 text-sm px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="agencia">Agência</option>
            <option value="flex">Flex</option>
          </select>
          <select
            value={form.veiculo_placa}
            onChange={e => setForm(f => ({ ...f, veiculo_placa: e.target.value }))}
            className="flex-1 rounded-lg bg-slate-900 border border-white/10 text-slate-200 text-sm px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="">Selecionar veículo…</option>
            {veiculos.map(v => (
              <option key={v.id} value={v.placa}>{v.placa} — {v.modelo}</option>
            ))}
          </select>
          <button
            onClick={registrar}
            disabled={salvando || !form.veiculo_placa}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors shrink-0"
          >
            {salvando ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
            {salvando ? '…' : 'OK'}
          </button>
        </div>
      )}

      {/* Histórico compacto */}
      {historicoFilt.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-600 font-bold flex-1">Semana</p>
            <div className="relative">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar…"
                className="pl-6 pr-2 py-0.5 rounded-md bg-slate-800 border border-white/8 text-slate-400 text-[11px] focus:outline-none w-24"
              />
            </div>
          </div>
          {historicoFilt.map(c => (
            <div key={c.id} className="flex items-center gap-2 text-xs text-slate-500 py-0.5">
              <span className="text-slate-600 w-20 tabular-nums shrink-0">
                {new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                c.modalidade === 'flex' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'
              }`}>{c.modalidade === 'flex' ? 'Flex' : 'Agência'}</span>
              <span className="text-slate-400 font-mono">{c.veiculo_placa}</span>
              {c.data === today && <span className="text-emerald-500 text-[10px] font-bold">HOJE</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ReclamacoesCard ──────────────────────────────────────────────────────────

function ReclamacoesCard({ claims }) {
  const total = (claims || []).length;
  if (!total) return null;
  return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center shrink-0">
        <ShieldAlert size={20} className="text-rose-400" />
      </div>
      <div className="flex-1">
        <p className="text-rose-300 font-semibold text-sm">
          {total} reclamação{total !== 1 ? 'ões' : ''} aberta{total !== 1 ? 's' : ''}
        </p>
        <p className="text-rose-400/60 text-xs mt-0.5">Responda antes do prazo para evitar penalização</p>
      </div>
      <a
        href="https://www.mercadolivre.com.br/vendas/reclamacoes"
        target="_blank" rel="noreferrer"
        className="text-xs text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 transition-colors shrink-0"
      >
        Abrir no ML
      </a>
    </div>
  );
}

// ─── CutoffWeekCompact ────────────────────────────────────────────────────────

function CutoffWeekCompact({ cutoffSchedule }) {
  if (!cutoffSchedule) return null;
  const todayIdx = new Date().getDay();
  return (
    <div className="rounded-2xl border border-slate-800/50 bg-slate-900/30 p-4">
      <p className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-3 flex items-center gap-1.5">
        <Timer size={11} /> Horário de coleta ML
      </p>
      <div className="grid grid-cols-7 gap-1">
        {DIAS_EN.map((key, i) => {
          const h = cutoffSchedule[key] || cutoffSchedule.default || '—';
          const isToday   = i === todayIdx;
          const isWeekend = i === 0 || i === 6;
          return (
            <div key={key} className={`rounded-lg p-1.5 text-center ${
              isToday ? 'bg-emerald-500/15 ring-1 ring-emerald-500/30' : 'bg-slate-800/30'
            } ${isWeekend ? 'opacity-30' : ''}`}>
              <p className={`text-[10px] font-medium mb-0.5 ${isToday ? 'text-emerald-400' : 'text-slate-600'}`}>
                {DIAS_SHORT[i]}
              </p>
              <p className={`text-xs font-bold tabular-nums ${isToday ? 'text-emerald-300' : 'text-slate-400'}`}>
                {isWeekend ? '—' : h}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

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
  useEffect(() => {
    const id = setInterval(load, 180_000);
    return () => clearInterval(id);
  }, [load]);

  const summary = data?.summary || {};

  return (
    <div className="h-full overflow-y-auto scrollbar-none">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* Header compacto */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {data?.mlConnected
              ? <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                  <Wifi size={10} /> ML conectado
                </span>
              : data
              ? <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-800 border border-white/8 px-2 py-1 rounded-full">
                  <WifiOff size={10} /> ML desconectado
                </span>
              : null
            }
          </div>
          <button
            onClick={load} disabled={loading}
            className="p-2 rounded-xl border border-slate-800/60 text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-all disabled:opacity-40"
            title="Atualizar dados"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
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

        {/* Painel principal */}
        {data?.mlConnected && (
          <>
            {/* 1 — Expedição + código ML */}
            <ExpedicaoHero
              summary={summary}
              cutoffSchedule={data.cutoffSchedule}
              authCode={data.authCode}
            />

            {/* 2 — Alertas inteligentes (só aparece quando há algo) */}
            <AlertasBand />

            {/* 3 — Coleta do dia */}
            <ColetaWidget />

            {/* 4 — A caminho (compras em trânsito) */}
            <AcaminhoWidget />

            {/* 5 — Reclamações (só aparece quando há) */}
            <ReclamacoesCard claims={data.claims} />

            {/* 6 — Tabela de corte semanal */}
            <CutoffWeekCompact cutoffSchedule={data.cutoffSchedule} />

            <p className="text-center text-slate-700 text-xs pb-2">
              auto-refresh a cada 3 min
            </p>
          </>
        )}

        {/* Painel quando ML desconectado — mostra alertas e coleta */}
        {data && !data.mlConnected && (
          <>
            <AlertasBand />
            <ColetaWidget />
            <AcaminhoWidget />
          </>
        )}
      </div>
    </div>
  );
}
