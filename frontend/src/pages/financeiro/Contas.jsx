/**
 * @file Contas.jsx
 * @description Contas a Pagar — filtro mensal, filtros por cartão,
 *   seleção múltipla com total acumulado, compartilhamento WhatsApp.
 * @version 2.0.0
 */

import { useState, useMemo, useEffect } from 'react';
import {
  CreditCard, Plus, AlertTriangle, CheckCircle2, Clock,
  Calendar, Loader2, Wallet, X, RotateCcw, Banknote,
  BarChart2, ShieldCheck, RefreshCw, MessageCircle, Copy,
  Check, ChevronLeft, ChevronRight, AlertCircle, ChevronDown, Clipboard,
  Box, Package, TrendingUp,
} from 'lucide-react';
import { useCompras, calcParcelas } from '../../hooks/useCompras';
import { useMeiosPagamento } from '../../hooks/useMeiosPagamento';
import MeiosPagamento from './components/MeiosPagamento';
import { isFirebaseClientReady } from '../../firebase';

import { useFinDespesas, computarStatusEfetivo, extrairMesesFin, labelMesAnoTs } from '../../hooks/useFinDespesas';
import { FiltrosBar } from './components/FiltrosBar';
import { ResumoCards } from './components/ResumoCards';
import { GraficoBarras } from './components/GraficoBarras';
import { GraficoPizza } from './components/GraficoPizza';
import { FormLancarDespesa } from './components/FormLancarDespesa';
import { TabelaDespesas } from './components/TabelaDespesas';
import { apiFetch } from '../../utils/getAuthToken';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { ModalEditarLancamento } from './components/ModalEditarLancamento';

function checkAdmin() {
  try {
    const user = localStorage.getItem('expedicao_user');
    if (!user) return false;
    return JSON.parse(user).role === 'admin';
  } catch {
    return false;
  }
}


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

function labelMesBonito(label) {
  const NOME_MES = {
    '01':'Janeiro','02':'Fevereiro','03':'Março','04':'Abril',
    '05':'Maio','06':'Junho','07':'Julho','08':'Agosto',
    '09':'Setembro','10':'Outubro','11':'Novembro','12':'Dezembro',
  };
  const [mm, yyyy] = (label || '').split('/');
  return mm && yyyy ? `${NOME_MES[mm] ?? mm} de ${yyyy}` : label;
}

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

// ─── Helpers do Lançamento Inteligente ────────────────────────────────────────

function hojeISO() {
  return new Date().toISOString().split('T')[0];
}

function parsePastedText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let totalBruto = '';
  let dataCompra = '';
  let previsaoEntrega = '';
  let numParcelas = '1';
  let descricao = '';
  let sku = '';
  let totalQtd = 0;
  let avista = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    
    // 1. Data de compra
    if (line.includes('data de compra') || line.includes('data da compra')) {
      const match = line.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        dataCompra = `${match[3]}-${match[2]}-${match[1]}`;
      } else if (i + 1 < lines.length) {
        const nextMatch = lines[i+1].match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (nextMatch) {
          dataCompra = `${nextMatch[3]}-${nextMatch[2]}-${nextMatch[1]}`;
        }
      }
    }

    // Previsão de entrega
    if (line.includes('previsão de entrega') || line.includes('previsao de entrega')) {
      const match = line.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        previsaoEntrega = `${match[3]}-${match[2]}-${match[1]}`;
      } else if (i + 1 < lines.length) {
        const nextMatch = lines[i+1].match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (nextMatch) {
          previsaoEntrega = `${nextMatch[3]}-${nextMatch[2]}-${nextMatch[1]}`;
        }
      }
    }

    // 2. Valor total
    if (line === 'total') {
      if (i + 1 < lines.length) {
        const match = lines[i+1].match(/R\$\s*([\d.,]+)/i);
        if (match) {
          totalBruto = match[1].replace(/\./g, '').replace(',', '.');
        }
      }
    }
  }

  // Fallback para valor do produto se total não for achado
  if (!totalBruto) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('valor dos produtos')) {
        if (i + 1 < lines.length) {
          const match = lines[i+1].match(/R\$\s*([\d.,]+)/i);
          if (match) {
            totalBruto = match[1].replace(/\./g, '').replace(',', '.');
          }
        }
      }
    }
  }

  // 3. Parcelas
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    const matchParc = line.match(/em\s*(\d+)\s*x\s*/i) || line.match(/(\d+)\s*x\s*de\s*/i) || line.match(/cartão de crédito\s*\[(\d+)x\]/i);
    if (matchParc) {
      numParcelas = matchParc[1];
      avista = parseInt(numParcelas) <= 1;
    }
  }

  // 4. Produtos e SKUs
  const productsFound = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line === 'sku' || line.startsWith('sku:')) {
      let currentSku = '';
      if (line.startsWith('sku:')) {
        currentSku = lines[i].split(':')[1].trim();
      } else if (i + 1 < lines.length) {
        currentSku = lines[i+1];
      }
      
      let currentQty = 1;
      let unitPrice = 0;
      let productName = '';
      
      // Procura nome do produto subindo
      let nameIdx = i - 1;
      while (nameIdx >= 0 && nameIdx >= i - 4) {
        const l = lines[nameIdx];
        if (l.toLowerCase() !== 'produtos' && !l.includes(':') && !l.match(/^\d+x$/) && !l.includes('R$')) {
          productName = l;
          break;
        }
        nameIdx--;
      }

      // Procura quantidade e preço unitário descendo
      let searchIdx = i + 1;
      while (searchIdx < Math.min(lines.length, i + 6)) {
        const nextLine = lines[searchIdx].trim();
        const qtyMatch = nextLine.toLowerCase().match(/^(\d+)x$/);
        if (qtyMatch) {
          currentQty = parseInt(qtyMatch[1]);
        }
        
        const priceMatch = nextLine.match(/R\$\s*([\d.,]+)/i);
        if (priceMatch) {
          unitPrice = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
        }
        searchIdx++;
      }

      productsFound.push({ 
        sku: currentSku, 
        name: productName || 'Produto', 
        qty: currentQty,
        price: unitPrice 
      });
    }
  }

  const uniqueProducts = [];
  if (productsFound.length > 0) {
    productsFound.forEach(p => {
      if (!uniqueProducts.find(u => u.sku === p.sku)) {
        uniqueProducts.push(p);
      }
    });
    descricao = uniqueProducts.map(p => `${p.name} (${p.qty}x)`).join(', ');
    sku = uniqueProducts[0].sku;
    totalQtd = uniqueProducts.reduce((sum, p) => sum + p.qty, 0);
  }

  let fornecedor = 'Mercado Livre';
  if (text.toLowerCase().includes('amazon')) {
    fornecedor = 'Amazon';
  } else if (text.toLowerCase().includes('bling')) {
    fornecedor = 'Bling';
  }

  return {
    fornecedor,
    descricao: descricao || 'Compra de estoque',
    totalBruto,
    numeroParcelas: numParcelas,
    avista,
    sku,
    qtd: totalQtd || '',
    dataCompra,
    previsaoEntrega,
    items: uniqueProducts
  };
}

function findBestCard(text, meios) {
  if (!meios || !meios.length) return '';
  const textLower = text.toLowerCase();
  
  for (const m of meios) {
    if (m.final && textLower.includes(m.final.toLowerCase())) {
      return m.id;
    }
  }
  
  const keywords = {
    meli: ['meli', 'mercado livre', 'mercadolivre'],
    nubank: ['nubank', 'nu '],
    inter: ['inter'],
    caixa: ['caixa'],
    renner: ['renner'],
    fernanda: ['fernanda'],
    santander: ['santander'],
    joao: ['joao', 'joão']
  };
  
  for (const m of meios) {
    const nomeLower = m.nome.toLowerCase();
    for (const [key, aliases] of Object.entries(keywords)) {
      if (nomeLower.includes(key)) {
        if (aliases.some(alias => textLower.includes(alias))) {
          return m.id;
        }
      }
    }
  }
  
  if (textLower.includes('mercado livre') || textLower.includes('mercadolivre') || textLower.includes('etapas') || textLower.includes('pedido faturado')) {
    const meliCard = meios.find(m => m.nome.toLowerCase().includes('meli'));
    if (meliCard) return meliCard.id;
  }
  
  return '';
}

// ─── Formulário Nova Compra (com Lançamento Inteligente) ──────────────────────
function FormNovaCompra({ compras = [], meios, lancarCompra, saving, onSucesso }) {
  const EMPTY = { 
    fornecedor: '', 
    descricao: '', 
    totalBruto: '', 
    numeroParcelas: '1', 
    taxaJuros: '', 
    meioId: '', 
    sku: '', 
    qtd: '', 
    avista: true,
    dataCompra: hojeISO(),
    previsaoEntrega: '',
    items: []
  };
  const [f, setF] = useState(EMPTY);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  
  // Smart Paste State
  const [showSmartPaste, setShowSmartPaste] = useState(false);
  const [rawText, setRawText] = useState('');
  const [smartPasteError, setSmartPasteError] = useState('');

  const meio = meios.find(m => m.id === f.meioId);
  const total = parseFloat(f.totalBruto) || 0;
  const n = parseInt(f.numeroParcelas) || 1;
  const taxa = parseFloat(f.taxaJuros) || 0;

  const { totalComJuros, valorBase } = useMemo(
    () => total > 0 ? calcParcelas(total, n, taxa) : { totalComJuros: 0, valorBase: 0 },
    [total, n, taxa]
  );

  // Rateio proporcional dos custos reais dos itens com base no total totalBruto
  const itemsWithCosts = useMemo(() => {
    if (!f.items || f.items.length === 0) return [];
    
    // Calcula o valor total base dos produtos somados (sem impostos)
    const totalBaseProducts = f.items.reduce((sum, item) => sum + (item.qty * (item.price || 0)), 0);
    if (totalBaseProducts === 0) return f.items.map(it => ({ ...it, custoUnitario: 0 }));
    
    // Proporção de imposto/frete/desconto
    const ratio = total / totalBaseProducts;
    
    return f.items.map(item => ({
      ...item,
      custoUnitario: parseFloat(((item.price || 0) * ratio).toFixed(2))
    }));
  }, [f.items, total]);

  // Lógica de Detecção de Duplicados
  const isDuplicate = useMemo(() => {
    if (!f.fornecedor.trim() || !total) return false;
    
    return compras.some(c => {
      const sameFornecedor = String(c.fornecedor || '').toLowerCase() === String(f.fornecedor || '').toLowerCase();
      const sameTotal = Number(c.totalBruto || 0).toFixed(2) === Number(total || 0).toFixed(2);
      
      const sameSku = f.sku.trim() 
        ? String(c.sku || '').toLowerCase() === String(f.sku || '').toLowerCase()
        : true;
        
      let compDateStr = '';
      if (c.dataCompra) {
        compDateStr = c.dataCompra;
      } else if (c.createdAt) {
        const dObj = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
        compDateStr = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
      }
      
      const sameDate = f.dataCompra && compDateStr ? f.dataCompra === compDateStr : true;
        
      return sameFornecedor && sameTotal && sameSku && sameDate;
    });
  }, [f.fornecedor, total, f.sku, f.dataCompra, compras]);

  const custoUnit = total > 0 && parseInt(f.qtd) > 0 ? (total / parseInt(f.qtd)).toFixed(2) : '';

  function dataPrimeiraParcela() {
    const base = f.dataCompra ? new Date(f.dataCompra + 'T12:00:00') : new Date();
    const dia  = meio?.diaVencimento || 10;
    const mes  = base.getDate() < dia ? base.getMonth() : base.getMonth() + 1;
    return new Date(base.getFullYear(), mes, dia);
  }

  function handleSmartImport() {
    setSmartPasteError('');
    if (!rawText.trim()) {
      setSmartPasteError('Cole algum texto primeiro.');
      return;
    }
    
    try {
      const parsed = parsePastedText(rawText);
      const bestCardId = findBestCard(rawText, meios);
      
      setF(prev => ({
        ...prev,
        fornecedor: parsed.fornecedor,
        descricao: parsed.descricao,
        totalBruto: parsed.totalBruto || prev.totalBruto,
        numeroParcelas: parsed.numeroParcelas || prev.numeroParcelas,
        avista: parsed.avista,
        sku: parsed.sku || prev.sku,
        qtd: parsed.qtd || prev.qtd,
        meioId: bestCardId || prev.meioId,
        dataCompra: parsed.dataCompra || prev.dataCompra,
        previsaoEntrega: parsed.previsaoEntrega || prev.previsaoEntrega,
        items: parsed.items || []
      }));
      
      setShowSmartPaste(false);
      setRawText('');
    } catch (e) {
      setSmartPasteError('Erro ao processar texto: ' + e.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault(); setErro('');
    if (!f.fornecedor.trim()) { setErro('Informe o fornecedor'); return; }
    if (!total || total <= 0) { setErro('Valor total inválido'); return; }
    if (!f.meioId)            { setErro('Selecione o meio de pagamento'); return; }
    
    if (isDuplicate) {
      const confirmSave = window.confirm(
        `Aviso: Já existe uma compra cadastrada para "${f.fornecedor}" no valor de ${brl(total)}. Deseja cadastrar outra cópia mesmo assim?`
      );
      if (!confirmSave) return;
    }

    const result = await lancarCompra({
      fornecedor: f.fornecedor.trim(), descricao: f.descricao.trim(),
      totalBruto: total, numeroParcelas: f.avista ? 1 : n, taxaJuros: f.avista ? 0 : taxa,
      meioId: meio.id, meioNome: meio.nome, meioBandeira: meio.bandeira,
      diaVencimento: meio.diaVencimento || 10, dataPrimeiraParcela: dataPrimeiraParcela(),
      dataCompra: f.dataCompra, previsaoEntrega: f.previsaoEntrega,
      sku: f.sku.trim(), qtd: parseInt(f.qtd) || 0, custoUnitario: parseFloat(custoUnit) || 0,
      items: itemsWithCosts.map(it => ({
        sku: it.sku,
        name: it.name,
        qty: it.qty,
        custoUnitario: it.custoUnitario
      }))
    });
    if (result.ok) { setOk(true); setF(EMPTY); setTimeout(() => { setOk(false); onSucesso?.(result.compraId); }, 1500); }
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

      {/* Lançamento Inteligente */}
      <div className="bg-slate-900/60 border border-dashed border-white/10 rounded-2xl p-4">
        <button
          type="button"
          onClick={() => setShowSmartPaste(!showSmartPaste)}
          className="flex items-center justify-between w-full text-left text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider focus:outline-none"
        >
          <span className="flex items-center gap-2">
            <span className="bg-blue-500/15 border border-blue-500/30 text-blue-400 p-1.5 rounded-lg">
              <Clipboard size={14} />
            </span>
            Importação Inteligente (Ctrl+C / Ctrl+V)
          </span>
          <ChevronDown size={14} className={`transition-transform duration-200 ${showSmartPaste ? 'rotate-180' : ''}`} />
        </button>
        
        {showSmartPaste && (
          <div className="mt-4 space-y-3 animate-fade-in">
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Cole o texto copiado da tela de detalhes da sua compra (Mercado Livre, Amazon, etc.) no campo abaixo. O sistema preencherá automaticamente os valores, parcelas, data e SKUs para você revisar.
            </p>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="Cole o texto do pedido aqui..."
              className="w-full h-32 bg-slate-950 border border-white/[0.06] rounded-xl p-3 text-slate-200 text-xs outline-none focus:border-blue-500/50 font-mono"
            />
            {smartPasteError && (
              <p className="text-red-400 text-xs flex items-center gap-1">
                <AlertTriangle size={12} /> {smartPasteError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              {rawText && (
                <button
                  type="button"
                  onClick={() => setRawText('')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all"
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                onClick={handleSmartImport}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-all active:scale-95 shadow-md shadow-blue-500/10"
              >
                <RefreshCw size={12} /> Analisar Texto
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div><p className={lbl}>Fornecedor *</p>
          <input className={inp} placeholder="Ex: Distribuidora SP" required value={f.fornecedor} onChange={e => setF(p => ({...p, fornecedor: e.target.value}))} /></div>
        <div><p className={lbl}>Descrição / Produto</p>
          <input className={inp} placeholder="Ex: Pelúcias 100un" value={f.descricao} onChange={e => setF(p => ({...p, descricao: e.target.value}))} /></div>
        <div><p className={lbl}>Data da Compra *</p>
          <input className={inp} type="date" required value={f.dataCompra} onChange={e => setF(p => ({...p, dataCompra: e.target.value}))} /></div>
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
          <BarChart2 size={12} /> <span className="font-bold uppercase tracking-wider">Integração de Margem & Custos de Produtos</span>
        </div>
        
        {itemsWithCosts.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
              Múltiplos produtos detectados. Os impostos e custos adicionais foram rateados proporcionalmente com base nos valores base:
            </p>
            <div className="border border-white/5 rounded-xl overflow-hidden bg-slate-950/40">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-slate-900/60 text-slate-400 font-bold">
                    <th className="p-2">Produto / SKU</th>
                    <th className="p-2 text-center">Qtd</th>
                    <th className="p-2 text-right">Preço Base</th>
                    <th className="p-2 text-right text-emerald-400">Custo Real (c/ Impostos)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px] text-slate-300">
                  {itemsWithCosts.map((item, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02]">
                      <td className="p-2 max-w-[200px] truncate font-sans">
                        <span className="font-bold text-white block">{item.sku}</span>
                        <span className="text-slate-500 text-[10px] truncate block">{item.name}</span>
                      </td>
                      <td className="p-2 text-center">{item.qty} un</td>
                      <td className="p-2 text-right">{brl(item.price)}</td>
                      <td className="p-2 text-right font-bold text-emerald-400">{brl(item.custoUnitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
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
        )}
      </div>
      {isDuplicate && (
        <div className="flex items-center gap-2 text-yellow-400 text-xs bg-yellow-500/[0.05] border border-yellow-500/10 rounded-xl px-4 py-3 animate-pulse">
          <AlertTriangle size={14} className="shrink-0 text-yellow-400" />
          <span><strong>Possível Duplicidade:</strong> Já existe uma compra com este mesmo fornecedor, valor e data cadastrada no sistema.</span>
        </div>
      )}
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
  const [aba, setAba] = useState('contas'); // 'contas' | 'novo' | 'cartoes'
  const [tipoForm, setTipoForm] = useState('despesa'); // 'despesa' | 'compra'
  const [editingItem, setEditingItem] = useState(null);
  const [origemFiltro, setOrigemFiltro] = useState('all'); // 'all' | 'despesa' | 'parcela'
  const [mostrarCharts, setMostrarCharts] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);

  const { parcelas, compras, loading, saving, lancarCompra, marcarPago, desfazerPagamento, reload, deletarCompra } = useCompras();
  const { meios, loading: loadingMeios } = useMeiosPagamento();

  const [totalEstoqueBling, setTotalEstoqueBling] = useState(0);
  const [loadingEstoque, setLoadingEstoque] = useState(false);

  useEffect(() => {
    async function loadEstoqueValuation() {
      setLoadingEstoque(true);
      try {
        const res = await apiFetch('/products/all');
        if (res.ok) {
          const data = await res.json();
          const items = data.items || [];
          const sum = items.reduce((acc, p) => {
            const stock = Number(p.stock || 0);
            const cost = Number(p.precoCusto || p.preco_custo || 0);
            return acc + (stock * cost);
          }, 0);
          setTotalEstoqueBling(sum);
        }
      } catch (e) {
        console.error('[Contas] Erro ao buscar valor do estoque:', e);
      } finally {
        setLoadingEstoque(false);
      }
    }
    loadEstoqueValuation();
  }, []);

  const totalEstoqueAChegar = useMemo(() => {
    if (!compras) return 0;
    const hojeComeco = new Date();
    hojeComeco.setHours(0, 0, 0, 0);

    return compras
      .filter(c => {
        if (c.status !== 'aberta') return false;
        if (c.previsaoEntrega) {
          const prevDate = new Date(c.previsaoEntrega + 'T12:00:00');
          if (prevDate.getTime() < hojeComeco.getTime()) {
            return false;
          }
        }
        return true;
      })
      .reduce((sum, c) => sum + (Number(c.qtd || 0) * Number(c.custoUnitario || 0)), 0);
  }, [compras]);

  // ─── Dados de Despesas Operacionais (fin_despesas)
  const { despesas, loading: loadingDesp, error: errorDesp } = useFinDespesas();
  const [salvando, setSalvando] = useState(false);

  // Filtros
  const [mesAtivo,       setMesAtivo]       = useState('');
  const [categoriaAtiva, setCategoriaAtiva] = useState('all');
  const [statusAtivo,    setStatusAtivo]    = useState('all');
  const [rangeInicio,    setRangeInicio]    = useState(null);
  const [rangeFim,       setRangeFim]       = useState(null);

  // Normalização de dados
  const normalizedDespesas = useMemo(() => {
    if (!despesas) return [];
    return despesas.map(d => {
      const createdDate = tsToDate(d.createdAt || d.data); // fallback se não tiver
      const createdString = createdDate ? createdDate.toLocaleDateString('pt-BR') : '';
      const vencDate = tsToDate(d.data);
      const vencString = vencDate ? vencDate.toLocaleDateString('pt-BR') : '';
      return {
        ...d,
        origem: 'despesa',
        data: vencString, // data de vencimento
        dataLancamento: createdString, // data de criação
        timestamp: vencDate ? vencDate.getTime() : 0,
        timestampLancamento: createdDate ? createdDate.getTime() : 0,
        situacao: d.situacao, // 'pago' / 'pendente'
        tipo: d.tipo || 'operacional',
        nome: d.fornecedor || 'Despesa',
      };
    });
  }, [despesas]);

  const normalizedParcelas = useMemo(() => {
    if (!parcelas) return [];
    return parcelas.map(p => {
      const vencDate = tsToDate(p.vencimento);
      const vencString = vencDate ? vencDate.toLocaleDateString('pt-BR') : '';
      const createdDate = tsToDate(p.createdAt);
      const createdString = createdDate ? createdDate.toLocaleDateString('pt-BR') : '';
      const labelParcela = p.totalParcelas > 1 ? ` (${p.numeroParcela}/${p.totalParcelas}x)` : '';
      return {
        id: p.id,
        compraId: p.compraId,
        data: vencString, // data de vencimento
        dataLancamento: createdString || vencString, // data de criação
        timestamp: vencDate ? vencDate.getTime() : 0,
        timestampLancamento: createdDate ? createdDate.getTime() : (vencDate ? vencDate.getTime() : 0),
        tipo: 'investimento',
        categoria: p.meioNome || 'Compra',
        nome: p.fornecedor || 'Compra',
        fornecedor: p.fornecedor || '',
        descricao: `${p.descricao || ''}${labelParcela}`,
        valor: p.valor || 0,
        situacao: p.status || 'pendente',
        origem: 'parcela',
        meioId: p.meioId || '',
        meioNome: p.meioNome || '',
      };
    });
  }, [parcelas]);

  // Status efetivo para exibição
  function computarStatusEfetivoLancamento(item) {
    if (item.situacao === 'pago') return 'pago';
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return item.timestamp < hoje.getTime() ? 'vencido' : 'pendente';
  }

  // Unifica e calcula o status efetivo
  const contasUnificadas = useMemo(() => {
    return [...normalizedDespesas, ...normalizedParcelas].map(item => ({
      ...item,
      statusEfetivo: computarStatusEfetivoLancamento(item),
    }));
  }, [normalizedDespesas, normalizedParcelas]);

  // KPIs Unificados
  const kpisUnificados = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
    const semAte = new Date(hoje); semAte.setDate(semAte.getDate() + 7);

    const pendentes = contasUnificadas.filter(c => c.situacao === 'pendente');
    const pagos = contasUnificadas.filter(c => c.situacao === 'pago');
    const tsMs = c => c.timestamp;

    const vencidas  = pendentes.filter(c => tsMs(c) < hoje.getTime());
    const hoje_arr  = pendentes.filter(c => { const t = tsMs(c); return t >= hoje.getTime() && t < amanha.getTime(); });
    const semana_arr = pendentes.filter(c => { const t = tsMs(c); return t >= hoje.getTime() && t <= semAte.getTime(); });

    const soma = arr => arr.reduce((s, c) => s + (c.valor || 0), 0);
    
    const totalPendenteGeral = soma(pendentes);
    const countPendenteGeral = pendentes.length;
    const totalPagoGeral = soma(pagos);
    const countPagoGeral = pagos.length;

    return {
      vencidas: { total: soma(vencidas), count: vencidas.length },
      hoje: { total: soma(hoje_arr), count: hoje_arr.length },
      semana: { total: soma(semana_arr), count: semana_arr.length },
      totalPago: totalPagoGeral,
      totalPendenteGeral,
      countPendenteGeral,
      totalPagoGeral,
      countPagoGeral,
      totalAtrasado: soma(vencidas),
      countAtrasado: vencidas.length,
      totalHoje: soma(hoje_arr),
      countHoje: hoje_arr.length,
    };
  }, [contasUnificadas]);

  const totalPendentesCount = useMemo(() => {
    return contasUnificadas.filter(c => c.statusEfetivo === 'vencido' || c.statusEfetivo === 'pendente').length;
  }, [contasUnificadas]);

  const meses = useMemo(() => extrairMesesFin(contasUnificadas), [contasUnificadas]);

  const categorias = useMemo(() => {
    const set = new Set(contasUnificadas.map(d => d.categoria).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [contasUnificadas]);

  const categoriasDespesas = useMemo(() => {
    const set = new Set(normalizedDespesas.map(d => d.categoria).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [normalizedDespesas]);

  const labelMesAtual = useMemo(() => {
    const hoje = new Date();
    return `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
  }, []);

  const mesEfetivo = mesAtivo || meses.find(m => m.label === labelMesAtual)?.label || meses[0]?.label || '';

  // Filtro consolidado
  const contasFiltradas = useMemo(() => {
    return contasUnificadas.filter(d => {
      // Categoria
      if (categoriaAtiva !== 'all' && d.categoria !== categoriaAtiva) return false;
      
      // Status
      if (statusAtivo !== 'all') {
        if (statusAtivo === 'pendente') {
          if (d.statusEfetivo !== 'pendente' && d.statusEfetivo !== 'vencido') return false;
        } else {
          if (d.statusEfetivo !== statusAtivo) return false;
        }
      }

      // Origem
      if (origemFiltro !== 'all' && d.origem !== origemFiltro) return false;

      // Se há range de data ativo, filtra pelo range
      if (rangeInicio && rangeFim) {
        return d.timestamp >= rangeInicio && d.timestamp <= rangeFim;
      }
      // Caso contrário, filtra pelo mês efetivo
      if (mesEfetivo) {
        return labelMesAnoTs(d.timestamp) === mesEfetivo;
      }
      return true;
    });
  }, [contasUnificadas, categoriaAtiva, statusAtivo, origemFiltro, rangeInicio, rangeFim, mesEfetivo]);

  const contasMes = useMemo(() => {
    if (!mesEfetivo) return contasUnificadas;
    return contasUnificadas.filter(d => labelMesAnoTs(d.timestamp) === mesEfetivo);
  }, [contasUnificadas, mesEfetivo]);

  const kpisMes = useMemo(() => {
    const pendentes = contasMes.filter(c => c.situacao === 'pendente');
    const pagos = contasMes.filter(c => c.situacao === 'pago');
    const soma = arr => arr.reduce((s, c) => s + (c.valor || 0), 0);
    return {
      totalPendente: soma(pendentes),
      countPendente: pendentes.length,
      totalPago: soma(pagos),
      countPago: pagos.length,
    };
  }, [contasMes]);

  // Handlers para salvar/toggle/deletar
  async function handleSalvarDespesa(payload) {
    setSalvando(true);
    try {
      const res = await apiFetch('/api/fin-despesas', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAba('contas');
      if (data && data.id) {
        setHighlightedId(data.id);
        setTimeout(() => setHighlightedId(null), 8000);
      }
    } catch (err) {
      alert(`Erro ao lançar despesa: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  }

  async function handleToggleStatusUnified(id, novaSituacao, origem) {
    try {
      if (origem === 'despesa') {
        const res = await apiFetch(`/api/fin-despesas/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ situacao: novaSituacao.toLowerCase() }),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        if (novaSituacao.toLowerCase() === 'pago') {
          await marcarPago(id);
        } else {
          await desfazerPagamento(id);
        }
      }
    } catch (err) {
      alert(`Erro ao atualizar status: ${err.message}`);
    }
  }

  async function handleDeleteUnified(id, origem) {
    try {
      if (origem === 'despesa') {
        const res = await apiFetch(`/api/fin-despesas/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(await res.text());
      } else {
        await reload();
      }
    } catch (err) {
      alert(`Erro ao excluir: ${err.message}`);
    }
  }

  async function handleDeleteCompra(compraId) {
    try {
      await deletarCompra(compraId);
    } catch (err) {
      alert(`Erro ao excluir compra: ${err.message}`);
    }
  }

  async function handleSalvarEdicao(itemEditado) {
    try {
      if (itemEditado.origem === 'despesa') {
        const ref = doc(db, 'fin_despesas', itemEditado.id);
        const [y, m, d] = itemEditado.dataISO.split('-');
        const dateObj = new Date(y, m - 1, d, 12, 0, 0);

        await updateDoc(ref, {
          data: Timestamp.fromDate(dateObj),
          categoria: itemEditado.categoria,
          descricao: itemEditado.descricao,
          valor: parseFloat(itemEditado.valor) || 0,
          situacao: itemEditado.situacao,
          updatedAt: new Date(),
        });
      } else {
        const ref = doc(db, 'fin_parcelas', itemEditado.id);
        const [y, m, d] = itemEditado.vencISO.split('-');
        const dateObj = new Date(y, m - 1, d, 12, 0, 0);

        const updates = {
          vencimento: Timestamp.fromDate(dateObj),
          fornecedor: itemEditado.fornecedor,
          descricao: itemEditado.descricao,
          valor: parseFloat(itemEditado.valor) || 0,
          status: itemEditado.situacao,
        };

        if (itemEditado.meioId) {
          const meio = meios.find(m => m.id === itemEditado.meioId);
          if (meio) {
            updates.meioId = meio.id;
            updates.meioNome = meio.nome;
            updates.meioBandeira = meio.bandeira;
          }
        }

        await updateDoc(ref, updates);
        reload();
      }
      setEditingItem(null);
    } catch (err) {
      alert(`Erro ao salvar alterações: ${err.message}`);
    }
  }

  const isAdmin = useMemo(() => checkAdmin(), []);

  if (!isFirebaseClientReady()) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-slate-950">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/20 bg-gradient-to-br from-slate-900 via-red-950/5 to-slate-900 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto shadow-lg shadow-red-900/10 animate-pulse">
            <AlertTriangle className="text-red-400" size={32} />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-white text-lg font-black tracking-tight font-sans">Módulo Financeiro Indisponível</h1>
            <p className="text-slate-400 text-xs leading-relaxed font-sans">
              O banco de dados local do Firebase não está configurado. Por favor, insira as credenciais do cliente Firebase (<code className="text-[10px] text-red-300 font-mono">VITE_FIREBASE_*</code>) nas variáveis de ambiente do seu servidor local ou da Railway.
            </p>
          </div>
          <div className="text-[10px] text-slate-500 bg-slate-950/60 p-3 rounded-xl border border-white/[0.03] text-left font-mono leading-relaxed">
            VITE_FIREBASE_API_KEY=...<br/>
            VITE_FIREBASE_PROJECT_ID=...<br/>
            VITE_FIREBASE_APP_ID=...
          </div>
        </div>
      </div>
    );
  }

  const ABAS = [
    { id: 'contas',  label: 'Contas & Lançamentos', badge: totalPendentesCount || null },
    { id: 'novo',    label: 'Novo Lançamento',      badge: null },
    { id: 'cartoes', label: 'Cartões & Contas',     badge: meios.length || null },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-4 py-6 space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Wallet size={15} className="text-emerald-400" />
              </div>
              <h1 className="text-lg font-black text-white">Fluxo Financeiro</h1>
            </div>
            <p className="text-xs text-slate-600 mt-0.5 ml-10">Lançamentos de despesas · compras de mercadoria · fluxo de caixa unificado</p>
          </div>
        </div>

        <div className="flex bg-slate-900 border border-white/[0.05] rounded-2xl p-1 gap-1">
          {ABAS.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                aba === a.id ? 'bg-white/[0.07] text-slate-100' : 'text-slate-600 hover:text-slate-400'
              }`}>
              {a.label}
              {a.badge ? (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-500 text-white shrink-0">
                  {a.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {aba === 'contas' && (
          <div className="space-y-4">
            {/* KPIs Unificados de Duas Fileiras (Patrimônio Geral vs Período Selecionado) */}
            <div className="space-y-4">
              {/* Seção 1: Patrimônio & Visão Geral */}
              <div className="space-y-2">
                <h2 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 pl-1">
                  <Wallet size={12} className="text-emerald-500" /> Patrimônio & Fluxo Geral (Todos os Tempos)
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard
                    label="Estoque Atual (Bling)"
                    value={loadingEstoque ? "Carregando..." : brl(totalEstoqueBling)}
                    sub="Valor de Custo Total"
                    color="blue"
                    Icon={Box}
                  />
                  <KpiCard
                    label="Estoque a Chegar"
                    value={brl(totalEstoqueAChegar)}
                    sub="Pedidos de compra abertos"
                    color="yellow"
                    Icon={Package}
                  />
                  <KpiCard
                    label="Dívida Total (Geral)"
                    value={brl(kpisUnificados.totalPendenteGeral)}
                    sub={`${kpisUnificados.countPendenteGeral} lançamento(s) pendente(s)`}
                    color="red"
                    Icon={AlertTriangle}
                  />
                  <KpiCard
                    label="Histórico Pago (Geral)"
                    value={brl(kpisUnificados.totalPagoGeral)}
                    sub="Total pago histórico"
                    color="emerald"
                    Icon={CheckCircle2}
                  />
                </div>
              </div>

              {/* Seção 2: Vencimentos do Período Selecionado */}
              <div className="space-y-2">
                <h2 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 pl-1">
                  <Calendar size={12} className="text-emerald-500" /> Vencimentos do Período ({rangeInicio && rangeFim ? 'Personalizado' : labelMesBonito(mesEfetivo)})
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard
                    label="A Pagar no Período"
                    value={brl(kpisMes.totalPendente)}
                    sub={`${kpisMes.countPendente} item(ns) pendente(s)`}
                    color="blue"
                    Icon={Clock}
                  />
                  <KpiCard
                    label="Pago no Período"
                    value={brl(kpisMes.totalPago)}
                    sub={`${kpisMes.countPago} item(ns) pago(s)`}
                    color="emerald"
                    Icon={CheckCircle2}
                  />
                  <KpiCard
                    label="Total Vencido"
                    value={brl(kpisUnificados.totalAtrasado)}
                    sub={`${kpisUnificados.countAtrasado} item(ns) vencido(s)`}
                    color="red"
                    Icon={AlertTriangle}
                  />
                  <KpiCard
                    label="Vence Hoje"
                    value={brl(kpisUnificados.totalHoje)}
                    sub={`${kpisUnificados.countHoje} item(ns)`}
                    color="yellow"
                    Icon={Clock}
                  />
                </div>
              </div>
            </div>

            {/* Toggle de gráficos / filtros de origem */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex bg-slate-900 border border-white/[0.05] rounded-xl p-0.5 gap-0.5">
                {[
                  { id: 'all',     label: 'Todos Lançamentos' },
                  { id: 'despesa', label: 'Apenas Despesas' },
                  { id: 'parcela', label: 'Apenas Compras/Cartão' }
                ].map(o => (
                  <button key={o.id} onClick={() => setOrigemFiltro(o.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      origemFiltro === o.id ? 'bg-white/[0.08] text-slate-100' : 'text-slate-600 hover:text-slate-400'
                    }`}>
                    {o.label}
                  </button>
                ))}
              </div>

              {contasUnificadas.length > 0 && (
                <button
                  onClick={() => setMostrarCharts(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-white/[0.08] text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all"
                >
                  <BarChart2 size={12} /> {mostrarCharts ? 'Ocultar análises' : 'Ver análises'}
                </button>
              )}
            </div>

            <FiltrosBar
              meses={meses}
              mesAtivo={mesEfetivo}
              onMes={setMesAtivo}
              categorias={categorias}
              categoriaAtiva={categoriaAtiva}
              onCategoria={setCategoriaAtiva}
              statusAtivo={statusAtivo}
              onStatus={setStatusAtivo}
              onRangeChange={(inicio, fim) => {
                setRangeInicio(inicio);
                setRangeFim(fim);
              }}
            />

            <ResumoCards despesasMes={contasMes} />

            {mostrarCharts && contasUnificadas.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <GraficoBarras despesas={contasUnificadas} />
                <GraficoPizza despesasMes={contasMes} />
              </div>
            )}

            {loadingDesp || loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-slate-600">
                <Loader2 size={20} className="animate-spin" /> Carregando contas…
              </div>
            ) : errorDesp ? (
              <div className="flex items-center gap-3 text-red-400 p-4 border border-red-500/20 rounded-xl bg-red-500/5">
                <AlertCircle size={20} />
                <p className="text-sm">Erro ao carregar despesas: {errorDesp}</p>
              </div>
            ) : (
              <TabelaDespesas
                despesas={contasFiltradas}
                isAdmin={isAdmin}
                onToggleStatus={handleToggleStatusUnified}
                onDelete={(id) => handleDeleteUnified(id, 'despesa')}
                onDeleteCompra={handleDeleteCompra}
                onEdit={setEditingItem}
                highlightedId={highlightedId}
              />
            )}
          </div>
        )}

        {aba === 'novo' && (
          <div className="space-y-5 max-w-2xl mx-auto">
            {/* Seletor do tipo de lançamento */}
            <div className="flex bg-slate-900 border border-white/[0.05] rounded-xl p-1 gap-1">
              <button
                onClick={() => setTipoForm('despesa')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  tipoForm === 'despesa'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                Despesa Operacional (Luz, Aluguel, Prolabore...)
              </button>
              <button
                onClick={() => setTipoForm('compra')}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  tipoForm === 'compra'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                Compra de Produtos / Estoque (Cartão, Boleto...)
              </button>
            </div>

            {tipoForm === 'despesa' ? (
              <FormLancarDespesa
                categorias={categoriasDespesas}
                onSalvar={handleSalvarDespesa}
                salvando={salvando}
              />
            ) : (
              meios.length === 0 && !loadingMeios ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-600 bg-slate-900/50 border border-white/5 rounded-2xl">
                  <CreditCard size={36} className="opacity-30" />
                  <p className="text-sm">Cadastre um cartão ou conta primeiro</p>
                  <button onClick={() => setAba('cartoes')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors">
                    <Plus size={14} /> Cadastrar Cartão / Conta
                  </button>
                </div>
              ) : (
                <FormNovaCompra compras={compras} meios={meios} lancarCompra={lancarCompra} saving={saving} onSucesso={(compraId) => {
                  setAba('contas');
                  reload();
                  if (compraId) {
                    setHighlightedId(compraId);
                    setTimeout(() => setHighlightedId(null), 8000);
                  }
                }} />
              )
            )}
          </div>
        )}

        {aba === 'cartoes' && <MeiosPagamento parcelas={parcelas} />}
      </div>

      {editingItem && (
        <ModalEditarLancamento
          item={editingItem}
          meios={meios}
          onClose={() => setEditingItem(null)}
          onSave={handleSalvarEdicao}
        />
      )}
    </div>
  );
}
