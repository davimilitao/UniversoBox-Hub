/**
 * @file Contas.jsx
 * @description Contas a Pagar — filtro mensal, filtros por cartão,
 *   seleção múltipla com total acumulado, compartilhamento WhatsApp.
 * @version 2.0.0
 */

import { useState, useMemo } from 'react';
import {
  CreditCard, Plus, AlertTriangle, CheckCircle2, Clock,
  Calendar, Loader2, Wallet, X, RotateCcw, Banknote,
  BarChart2, ShieldCheck, RefreshCw, MessageCircle, Copy,
  Check, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useCompras, calcParcelas } from '../../hooks/useCompras';
import { useMeiosPagamento } from '../../hooks/useMeiosPagamento';
import MeiosPagamento from './components/MeiosPagamento';

// ─── Formatters ───────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function brl(v) { return BRL.format(v || 0); }

function tsToDate(ts) {
  if (!ts) return null;
  return ts?.toDate?.() ?? new Date(ts);
}
function fmtData(ts)      { const d = tsToDate(ts); return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
function fmtDataCurta(ts) { const d = tsToDate(ts); return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'; }
function fmtMesAno(ts)    { const d = tsToDate(ts); return d ? d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : ''; }
function labelMes(ts)     { const d = tsToDate(ts); return d ? `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : ''; }

function diasParaVencer(ts) {
  const d = tsToDate(ts);
  if (!d) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const alvo = new Date(d); alvo.setHours(0,0,0,0);
  return Math.round((alvo - hoje) / 86400000);
}
function urgencyColor(dias) {
  if (dias === null) return 'text-slate-500';
  if (dias < 0)  return 'text-red-400';
  if (dias === 0) return 'text-orange-400';
  if (dias <= 3) return 'text-yellow-400';
  return 'text-slate-400';
}
function urgencyBg(dias) {
  if (dias === null) return 'border-white/[0.06]';
  if (dias < 0)  return 'border-red-500/20 bg-red-500/[0.03]';
  if (dias === 0) return 'border-orange-500/20 bg-orange-500/[0.03]';
  if (dias <= 3) return 'border-yellow-500/20 bg-yellow-500/[0.03]';
  return 'border-white/[0.06]';
}

function fmtWhatsContas(parcelas) {
  const linhas = parcelas.map(p => {
    const parc = p.totalParcelas > 1 ? ` (${p.numeroParcela}/${p.totalParcelas}x)` : '';
    return `• ${p.fornecedor}${parc} — ${p.descricao || ''} | *${brl(p.valor)}* | ${fmtDataCurta(p.vencimento)} | ${p.meioNome}`.replace(/\s—\s$/, '');
  });
  const total = parcelas.reduce((s, p) => s + (p.valor || 0), 0);
  return `*Contas selecionadas*\n${linhas.join('\n')}\n\n*Total: ${brl(total)}*`;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'emerald', Icon }) {
  const clr = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red:     'text-red-400 bg-red-500/10 border-red-500/20',
    yellow:  'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    blue:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
  }[color];
  return (
    <div className="bg-slate-900 border border-white/[0.06] rounded-2xl p-4 flex gap-3 items-start">
      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${clr}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">{label}</p>
        <p className="text-xl font-black text-white leading-tight mt-0.5 tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Painel Vencimentos ───────────────────────────────────────────────────────
function PainelVencimentos({ parcelas, loading, marcarPago, desfazerPagamento, getResumo, reload, meios }) {
  const [filtroStatus, setFiltroStatus] = useState('pendentes');
  const [meioFiltro,   setMeioFiltro]   = useState('todos');
  const [mesAtivo,     setMesAtivo]     = useState('');
  const [selecionados, setSelecionados] = useState(new Set());
  const [copiado,      setCopiado]      = useState(false);

  // Meses disponíveis extraídos das parcelas
  const meses = useMemo(() => {
    const map = new Map();
    parcelas.forEach(p => {
      const k = labelMes(p.vencimento);
      if (k && !map.has(k)) map.set(k, { key: k, label: fmtMesAno(p.vencimento), ts: tsToDate(p.vencimento)?.getTime() || 0 });
    });
    return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
  }, [parcelas]);

  // Inicializa mês ativo com o mês atual ou mais próximo
  const mesEfetivo = useMemo(() => {
    if (mesAtivo) return mesAtivo;
    const hoje = new Date();
    const chaveHoje = `${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;
    return meses.find(m => m.key === chaveHoje)?.key || meses[0]?.key || '';
  }, [mesAtivo, meses]);

  const idxMes = meses.findIndex(m => m.key === mesEfetivo);

  // Filtro principal
  const listaFiltrada = useMemo(() => {
    return parcelas.filter(p => {
      const passStatus = filtroStatus === 'todos' ? true
        : filtroStatus === 'pendentes' ? p.status === 'pendente'
        : p.status === 'pago';
      const passMeio = meioFiltro === 'todos' || p.meioId === meioFiltro;
      const passMes  = !mesEfetivo || labelMes(p.vencimento) === mesEfetivo;
      return passStatus && passMeio && passMes;
    });
  }, [parcelas, filtroStatus, meioFiltro, mesEfetivo]);

  // Totais por meio de pagamento (pendentes, todos os meses)
  const totaisPorMeio = useMemo(() => {
    const map = {};
    parcelas.filter(p => p.status === 'pendente').forEach(p => {
      if (!p.meioId) return;
      map[p.meioId] = (map[p.meioId] || 0) + (p.valor || 0);
    });
    return map;
  }, [parcelas]);

  const resumo = getResumo();
  const itensSelecionados = listaFiltrada.filter(p => selecionados.has(p.id));
  const totalSelecionado  = itensSelecionados.reduce((s, p) => s + (p.valor || 0), 0);

  function toggleItem(id) {
    setSelecionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleTodos() {
    setSelecionados(selecionados.size === listaFiltrada.length ? new Set() : new Set(listaFiltrada.map(p => p.id)));
  }

  function compartilharWhats() {
    window.open(`https://wa.me/?text=${encodeURIComponent(fmtWhatsContas(itensSelecionados))}`, '_blank');
  }
  async function copiarTexto() {
    await navigator.clipboard.writeText(fmtWhatsContas(itensSelecionados)).catch(() => {});
    setCopiado(true); setTimeout(() => setCopiado(false), 2000);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-2 text-slate-600">
      <Loader2 size={20} className="animate-spin" /> Carregando parcelas…
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Vencido"     value={brl(resumo.vencidas.total)}  sub={`${resumo.vencidas.items.length} parcela(s)`}  color="red"     Icon={AlertTriangle} />
        <KpiCard label="Vence Hoje"  value={brl(resumo.hoje.total)}      sub={`${resumo.hoje.items.length} parcela(s)`}      color="yellow"  Icon={Clock} />
        <KpiCard label="Próx. 7 dias" value={brl(resumo.semana.total)}   sub={`${resumo.semana.items.length} parcela(s)`}    color="blue"    Icon={Calendar} />
        <KpiCard label="Total pago"  value={brl(resumo.totalPago)}       sub="histórico"                                     color="emerald" Icon={CheckCircle2} />
      </div>

      {/* ── Filtros por cartão ── */}
      {meios.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Cartão:</span>
          <button onClick={() => setMeioFiltro('todos')}
            className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
              meioFiltro === 'todos'
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-slate-800 border-white/[0.07] text-slate-500 hover:text-slate-300'
            }`}>
            Todos {meioFiltro === 'todos' && `· ${brl(resumo.totalPendente)}`}
          </button>
          {meios.map(m => {
            const total = totaisPorMeio[m.id] || 0;
            const ativo = meioFiltro === m.id;
            return (
              <button key={m.id} onClick={() => setMeioFiltro(ativo ? 'todos' : m.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                  ativo
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800 border-white/[0.07] text-slate-500 hover:text-slate-300'
                }`}>
                <CreditCard size={10} />
                {m.nome}
                {total > 0 && <span className={ativo ? 'opacity-80' : 'text-slate-600'}> · {brl(total)}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Navegação de mês + filtros de status ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Seletor de mês compacto */}
        {meses.length > 0 && (
          <div className="flex items-center gap-1 bg-slate-900 border border-white/[0.07] rounded-xl px-1 py-1">
            <button onClick={() => { const i = idxMes - 1; if (i >= 0) setMesAtivo(meses[i].key); }}
              disabled={idxMes <= 0}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] disabled:opacity-20 transition-all">
              <ChevronLeft size={14} />
            </button>
            <select value={mesEfetivo} onChange={e => setMesAtivo(e.target.value)}
              className="bg-transparent text-slate-100 text-sm font-bold px-2 py-1 outline-none cursor-pointer min-w-[100px] text-center [color-scheme:dark]">
              {meses.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <button onClick={() => { const i = idxMes + 1; if (i < meses.length) setMesAtivo(meses[i].key); }}
              disabled={idxMes >= meses.length - 1}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] disabled:opacity-20 transition-all">
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Status */}
        <div className="flex bg-slate-900 border border-white/[0.05] rounded-xl p-0.5 gap-0.5">
          {[
            { id: 'pendentes', label: 'Pendentes' },
            { id: 'pagos',     label: 'Pagos'     },
            { id: 'todos',     label: 'Todos'     },
          ].map(f => (
            <button key={f.id} onClick={() => setFiltroStatus(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filtroStatus === f.id ? 'bg-white/[0.08] text-slate-100' : 'text-slate-600 hover:text-slate-400'
              }`}>{f.label}</button>
          ))}
        </div>

        <button onClick={() => { reload(); setSelecionados(new Set()); }}
          className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors ml-auto">
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {/* ── Lista ── */}
      {listaFiltrada.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-700">
          <CheckCircle2 size={40} className="opacity-30" />
          <p className="text-sm">Nenhuma parcela para os filtros selecionados</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Header seleção */}
          <div className="flex items-center gap-2 px-4 py-1.5">
            <input type="checkbox"
              checked={selecionados.size === listaFiltrada.length && listaFiltrada.length > 0}
              onChange={toggleTodos}
              className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer" />
            <span className="text-[10px] text-slate-600">Selecionar todos ({listaFiltrada.length})</span>
          </div>

          {listaFiltrada.map(p => {
            const dias     = diasParaVencer(p.vencimento);
            const pago     = p.status === 'pago';
            const selected = selecionados.has(p.id);
            return (
              <div key={p.id}
                onClick={() => toggleItem(p.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                  selected ? 'border-emerald-500/30 bg-emerald-500/[0.05]' :
                  pago ? 'border-white/[0.04] opacity-60' : urgencyBg(dias)
                }`}
                style={{ background: selected ? undefined : 'var(--bg-surface, #0f172a)' }}>

                <input type="checkbox" checked={selected} onChange={() => toggleItem(p.id)}
                  onClick={e => e.stopPropagation()}
                  className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer shrink-0" />

                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  pago ? 'bg-emerald-500' :
                  dias !== null && dias < 0 ? 'bg-red-400 animate-pulse' :
                  dias === 0 ? 'bg-orange-400 animate-pulse' : 'bg-slate-600'
                }`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-200 truncate">{p.fornecedor}</span>
                    {p.totalParcelas > 1 && (
                      <span className="text-[10px] text-slate-600 font-mono">{p.numeroParcela}/{p.totalParcelas}x</span>
                    )}
                    {p.descricao && <span className="text-[10px] text-slate-600 truncate">{p.descricao}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-slate-600">{p.meioNome || p.meioBandeira}</span>
                    <span className={`text-[10px] font-mono font-bold ${urgencyColor(dias)}`}>
                      {pago ? `Pago ${fmtDataCurta(p.paidAt)}` :
                        dias === null ? '—' :
                        dias < 0 ? `${Math.abs(dias)}d atraso` :
                        dias === 0 ? 'Vence HOJE' :
                        `${dias}d · ${fmtDataCurta(p.vencimento)}`}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white tabular-nums">{brl(p.valor)}</p>
                  <p className="text-[10px] text-slate-600">{fmtData(p.vencimento)}</p>
                </div>

                <div onClick={e => e.stopPropagation()}>
                  {!pago ? (
                    <button onClick={() => marcarPago(p.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-500/20 hover:border-emerald-500 text-emerald-400 hover:text-white text-[10px] font-bold transition-all">
                      <CheckCircle2 size={12} /> Pago
                    </button>
                  ) : (
                    <button onClick={() => desfazerPagamento(p.id)}
                      className="p-1.5 rounded-lg text-slate-700 hover:text-slate-400 hover:bg-white/[0.05] transition-colors">
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Toolbar de seleção ── */}
      {selecionados.size > 0 && (
        <div className="sticky bottom-4 mx-auto max-w-xl animate-fade-in">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-emerald-500/30 shadow-2xl shadow-black/60"
            style={{ background: 'var(--bg-surface, #0f172a)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500">{selecionados.size} item{selecionados.size !== 1 ? 's' : ''}</p>
              <p className="text-base font-black text-white tabular-nums">{brl(totalSelecionado)}</p>
            </div>
            <button onClick={compartilharWhats}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs transition-all active:scale-95">
              <MessageCircle size={13} /> WhatsApp
            </button>
            <button onClick={copiarTexto}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs transition-all">
              {copiado ? <><Check size={13} className="text-emerald-400" /> Copiado!</> : <><Copy size={13} /> Copiar</>}
            </button>
            <button onClick={() => setSelecionados(new Set())}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Formulário Nova Compra (inalterado) ──────────────────────────────────────
function FormNovaCompra({ meios, lancarCompra, saving, onSucesso }) {
  const EMPTY = { fornecedor: '', descricao: '', totalBruto: '', numeroParcelas: '1', taxaJuros: '', meioId: '', sku: '', qtd: '', avista: true };
  const [f, setF] = useState(EMPTY);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  const meio = meios.find(m => m.id === f.meioId);
  const total = parseFloat(f.totalBruto) || 0;
  const n = parseInt(f.numeroParcelas) || 1;
  const taxa = parseFloat(f.taxaJuros) || 0;

  const { totalComJuros, valorBase } = useMemo(
    () => total > 0 ? calcParcelas(total, n, taxa) : { totalComJuros: 0, valorBase: 0 },
    [total, n, taxa]
  );

  const custoUnit = total > 0 && parseInt(f.qtd) > 0 ? (total / parseInt(f.qtd)).toFixed(2) : '';

  function dataPrimeiraParcela() {
    const hoje = new Date();
    const dia  = meio?.diaVencimento || 10;
    const mes  = hoje.getDate() < dia ? hoje.getMonth() : hoje.getMonth() + 1;
    return new Date(hoje.getFullYear(), mes, dia);
  }

  async function handleSubmit(e) {
    e.preventDefault(); setErro('');
    if (!f.fornecedor.trim()) { setErro('Informe o fornecedor'); return; }
    if (!total || total <= 0) { setErro('Valor total inválido'); return; }
    if (!f.meioId)            { setErro('Selecione o meio de pagamento'); return; }
    const result = await lancarCompra({
      fornecedor: f.fornecedor.trim(), descricao: f.descricao.trim(),
      totalBruto: total, numeroParcelas: f.avista ? 1 : n, taxaJuros: f.avista ? 0 : taxa,
      meioId: meio.id, meioNome: meio.nome, meioBandeira: meio.bandeira,
      diaVencimento: meio.diaVencimento || 10, dataPrimeiraParcela: dataPrimeiraParcela(),
      sku: f.sku.trim(), qtd: parseInt(f.qtd) || 0, custoUnitario: parseFloat(custoUnit) || 0,
    });
    if (result.ok) { setOk(true); setF(EMPTY); setTimeout(() => { setOk(false); onSucesso?.(); }, 1500); }
    else setErro(result.error || 'Erro ao lançar compra');
  }

  const inp = 'w-full bg-slate-800 border border-white/[0.06] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500/50 placeholder:text-slate-600 transition-colors';
  const lbl = 'text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-500/[0.05] border border-emerald-500/10 rounded-xl px-4 py-3">
        <ShieldCheck size={14} className="shrink-0" />
        <span>Os dados do cartão não são armazenados — apenas o apelido e os últimos 4 dígitos.</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><p className={lbl}>Fornecedor *</p>
          <input className={inp} placeholder="Ex: Distribuidora SP" required value={f.fornecedor} onChange={e => setF(p => ({...p, fornecedor: e.target.value}))} /></div>
        <div><p className={lbl}>Descrição / Produto</p>
          <input className={inp} placeholder="Ex: Pelúcias 100un" value={f.descricao} onChange={e => setF(p => ({...p, descricao: e.target.value}))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><p className={lbl}>Valor Total R$ *</p>
          <input className={inp} type="number" min="0.01" step="0.01" placeholder="0,00" required value={f.totalBruto} onChange={e => setF(p => ({...p, totalBruto: e.target.value}))} /></div>
        <div><p className={lbl}>Meio de Pagamento *</p>
          <select className={inp} required value={f.meioId} onChange={e => setF(p => ({...p, meioId: e.target.value}))}>
            <option value="">Selecionar…</option>
            {meios.map(m => <option key={m.id} value={m.id}>{m.nome}{m.final ? ` (${m.final})` : ''} — {m.bandeira}</option>)}
          </select></div>
      </div>
      <div className="bg-slate-900 border border-white/[0.05] rounded-2xl p-4 space-y-4">
        <div className="flex gap-2">
          {[{v:true,label:'À Vista / Pix / Boleto'},{v:false,label:'Parcelado no Cartão'}].map(o => (
            <button type="button" key={String(o.v)} onClick={() => setF(p => ({...p, avista: o.v, numeroParcelas: o.v ? '1' : p.numeroParcelas}))}
              className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${f.avista === o.v ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'border-white/[0.05] text-slate-600 hover:text-slate-400'}`}>
              {o.label}
            </button>
          ))}
        </div>
        {!f.avista && (
          <div className="grid grid-cols-2 gap-4">
            <div><p className={lbl}>Nº de parcelas</p>
              <select className={inp} value={f.numeroParcelas} onChange={e => setF(p => ({...p, numeroParcelas: e.target.value}))}>
                {Array.from({length:24},(_,i)=>i+1).map(n => <option key={n} value={n}>{n}x</option>)}
              </select></div>
            <div><p className={lbl}>Taxa de juros % a.m.</p>
              <input className={inp} type="number" min="0" step="0.01" placeholder="0.00 (sem juros)" value={f.taxaJuros} onChange={e => setF(p => ({...p, taxaJuros: e.target.value}))} /></div>
          </div>
        )}
        {total > 0 && (
          <div className="bg-slate-800/60 border border-white/[0.05] rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-600">Total sem juros</span>
              <span className="text-slate-300 font-mono">{brl(total)}</span>
            </div>
            {!f.avista && taxa > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600">Total c/ juros ({n}x {taxa}% a.m.)</span>
                <span className="text-yellow-400 font-mono">{brl(totalComJuros)}</span>
              </div>
            )}
            <div className="flex justify-between text-[11px] border-t border-white/[0.05] pt-1.5">
              <span className="text-slate-400 font-bold">{f.avista ? 'Pagamento único' : `${n}x de`}</span>
              <span className="text-white font-black font-mono tabular-nums">{f.avista ? brl(total) : brl(valorBase)}</span>
            </div>
            {meio && !f.avista && (
              <p className="text-[10px] text-slate-600">1ª parcela: {dataPrimeiraParcela().toLocaleDateString('pt-BR')} · vence dia {meio.diaVencimento} de cada mês</p>
            )}
          </div>
        )}
      </div>
      <div className="bg-slate-900 border border-white/[0.05] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-blue-400">
          <BarChart2 size={12} /> <span className="font-bold uppercase tracking-wider">Opcional: Integração com Margem</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><p className={lbl}>SKU do produto</p>
            <input className={inp} placeholder="Ex: BUBA-01" value={f.sku} onChange={e => setF(p => ({...p, sku: e.target.value}))} /></div>
          <div><p className={lbl}>Quantidade</p>
            <input className={inp} type="number" min="1" placeholder="0" value={f.qtd} onChange={e => setF(p => ({...p, qtd: e.target.value}))} /></div>
          <div><p className={lbl}>Custo unitário</p>
            <div className={`${inp} flex items-center text-emerald-400 font-mono cursor-not-allowed`}>
              {custoUnit ? `R$ ${custoUnit}` : <span className="text-slate-700">automático</span>}
            </div></div>
        </div>
      </div>
      {erro && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle size={14} className="shrink-0" /> {erro}
        </div>
      )}
      <button type="submit" disabled={saving || ok}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95 disabled:opacity-60 bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20">
        {saving ? <><Loader2 size={16} className="animate-spin" /> Lançando…</>
          : ok  ? <><CheckCircle2 size={16} /> Lançado!</>
          :        <><Banknote size={16} /> Lançar Compra</>}
      </button>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Contas() {
  const [aba, setAba] = useState('vencimentos');
  const { parcelas, loading, saving, lancarCompra, marcarPago, desfazerPagamento, getResumo, reload } = useCompras();
  const { meios, loading: loadingMeios } = useMeiosPagamento();
  const resumo = getResumo();

  const ABAS = [
    { id: 'vencimentos', label: 'Vencimentos',  badge: resumo.vencidas.items.length || null },
    { id: 'nova',        label: 'Nova Compra',  badge: null },
    { id: 'cartoes',     label: 'Cartões',       badge: meios.length || null },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Wallet size={15} className="text-emerald-400" />
              </div>
              <h1 className="text-lg font-black text-white">Contas a Pagar</h1>
            </div>
            <p className="text-xs text-slate-600 mt-0.5 ml-10">Compras de mercadoria · parcelamento inteligente · fluxo de caixa</p>
          </div>
          {aba === 'vencimentos' && (
            <div className="text-right">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Total pendente</p>
              <p className="text-xl font-black tabular-nums text-white">{brl(resumo.totalPendente)}</p>
            </div>
          )}
        </div>

        <div className="flex bg-slate-900 border border-white/[0.05] rounded-2xl p-1 gap-1">
          {ABAS.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-all ${
                aba === a.id ? 'bg-white/[0.07] text-slate-100' : 'text-slate-600 hover:text-slate-400'
              }`}>
              {a.label}
              {a.badge ? (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                  a.id === 'vencimentos' && resumo.vencidas.items.length ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-400'
                }`}>{a.badge}</span>
              ) : null}
            </button>
          ))}
        </div>

        {aba === 'vencimentos' && (
          <PainelVencimentos parcelas={parcelas} loading={loading} marcarPago={marcarPago}
            desfazerPagamento={desfazerPagamento} getResumo={getResumo} reload={reload} meios={meios} />
        )}
        {aba === 'nova' && (
          meios.length === 0 && !loadingMeios ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-600">
              <CreditCard size={36} className="opacity-30" />
              <p className="text-sm">Cadastre um cartão ou conta primeiro</p>
              <button onClick={() => setAba('cartoes')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors">
                <Plus size={14} /> Cadastrar Cartão / Conta
              </button>
            </div>
          ) : (
            <FormNovaCompra meios={meios} lancarCompra={lancarCompra} saving={saving} onSucesso={() => setAba('vencimentos')} />
          )
        )}
        {aba === 'cartoes' && <MeiosPagamento />}
      </div>
    </div>
  );
}
