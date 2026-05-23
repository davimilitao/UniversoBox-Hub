/**
 * @file DashboardPage.jsx
 * @description Painel operacional unificado do UniversoBox Hub.
 *   Contém: Kanban de tarefas/coletas, Calculadoras de frete (Agência e Flex),
 *   gráfico de status operacionais (Recharts) e listagem de coletas do dia.
 * @version 4.0.0
 * @date 2026-05-23
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebase';
import {
  Package, Zap, Building2, Boxes,
  Clock, RefreshCw, Wifi, WifiOff,
  XCircle, CheckCircle2, Timer, ShieldAlert, ArrowRight,
  TrendingUp, BarChart3, Info, Plus, Trash2, Check,
  SlidersHorizontal, ChevronRight, Calculator, ListTodo, MapPin, AlertTriangle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// ─── Helpers e Utilitários ───────────────────────────────────────────────────

async function getToken() {
  try { return await auth.currentUser?.getIdToken(false); } catch { return null; }
}

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

// ─── Componentes de UI e Widgets ──────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center gap-2 text-slate-400 text-sm">
      <RefreshCw size={14} className="animate-spin" />
      Carregando dados operacionais…
    </div>
  );
}

function MLOffline({ onRetry }) {
  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.03] p-5 flex items-start gap-4">
      <WifiOff size={22} className="text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-amber-300 font-semibold text-sm">Mercado Livre não conectado</p>
        <p className="text-amber-400/60 text-xs mt-1">
          Alguns indicadores de vendas e cortes automáticos do ML estão offline. Conecte sua conta em <strong>Configurações</strong>.
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
  const DIAS_EN = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
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
          Conferir <ChevronRight size={11} />
        </p>
      )}
    </div>
  );
  return href && !disabled ? <Link to={href} className="contents">{inner}</Link> : inner;
}

const STATUS_STYLE = {
  imprimir:  { label: 'Pendente', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  expedir:   { label: 'Separado', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  enviado:   { label: 'Expedido', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  cancelado: { label: 'Cancelado', cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

function PedidosRecentes({ orders }) {
  const visible = orders.slice(0, 5);
  if (!visible.length) return null;
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-slate-900/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Pedidos Recentes do Dia
        </p>
        <Link to="/expedicao/pedidos" className="text-xs text-emerald-400 hover:underline flex items-center gap-1">
          Ver Fila de Separação <ChevronRight size={12} />
        </Link>
      </div>
      <div className="divide-y divide-white/[0.03]">
        {visible.map(o => {
          const st = STATUS_STYLE[o._localStatus || o.status] || STATUS_STYLE.imprimir;
          return (
            <div key={o.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-800/10 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-slate-300 text-xs font-bold truncate">{o.buyer || o.clienteNome || `#${o.id}`}</p>
                {o.items?.[0] && <p className="text-slate-600 text-[10px] truncate">{o.items[0].nameShort || o.items[0].name}</p>}
              </div>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>
                {st.label}
              </span>
              <p className="text-slate-600 text-[10px] font-mono shrink-0">{o._createdTime || 'Hoje'}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WIDGET: Quadro Kanban de Tarefas/Coletas ────────────────────────────────
function KanbanBoard() {
  const COLUNAS = [
    { id: 'todo',    label: 'A Fazer (Anotações)', cor: 'border-t-slate-500' },
    { id: 'doing',   label: 'Em Progresso',        cor: 'border-t-blue-500' },
    { id: 'coleta',  label: 'Coleta / Transportadora', cor: 'border-t-amber-500' },
    { id: 'done',    label: 'Concluído',           cor: 'border-t-emerald-500' }
  ];

  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('universobox_kanban_tasks');
      return saved ? JSON.parse(saved) : [
        { id: '1', text: 'Bipar coletas Mercado Livre do dia', column: 'coleta' },
        { id: '2', text: 'Checar faturas pendentes da Dorel', column: 'todo' },
        { id: '3', text: 'Separar caixas e fitas adesivas para expedição', column: 'doing' }
      ];
    } catch { return []; }
  });

  const [newTaskText, setNewTaskText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    localStorage.setItem('universobox_kanban_tasks', JSON.stringify(tasks));
  }, [tasks]);

  const addTask = (columnId = 'todo') => {
    if (!newTaskText.trim()) return;
    const newTask = {
      id: Date.now().toString(),
      text: newTaskText.trim(),
      column: columnId
    };
    setTasks([...tasks, newTask]);
    setNewTaskText('');
  };

  const deleteTask = (id) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditingText(task.text);
  };

  const saveEdit = (id) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, text: editingText.trim() } : t));
    setEditingId(null);
  };

  // Drag & Drop nativo
  const onDragStart = (e, taskId) => {
    e.dataTransfer.setData('text/plain', taskId);
  };

  const onDragOver = (e) => {
    e.preventDefault();
  };

  const onDrop = (e, columnId) => {
    const taskId = e.dataTransfer.getData('text/plain');
    setTasks(tasks.map(t => t.id === taskId ? { ...t, column: columnId } : t));
  };

  return (
    <div className="bg-slate-900/50 border border-white/[0.05] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <ListTodo className="text-violet-400" size={16} /> Painel de Tarefas & Coletas
        </h3>
        <div className="flex gap-1.5 max-w-xs w-full">
          <input
            className="flex-1 bg-slate-800 border border-white/[0.07] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-500/50 placeholder:text-slate-600"
            placeholder="Nova anotação..."
            value={newTaskText}
            onChange={e => setNewTaskText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
          />
          <button onClick={() => addTask()} className="p-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-white transition-colors shrink-0">
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUNAS.map(col => {
          const colTasks = tasks.filter(t => t.column === col.id);
          return (
            <div 
              key={col.id}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, col.id)}
              className={`bg-slate-900/80 rounded-xl p-3 border-t-2 ${col.cor} min-h-[160px] flex flex-col space-y-2`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{col.label}</span>
                <span className="text-[10px] font-bold font-mono text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-full">{colTasks.length}</span>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto max-h-[220px] scrollbar-none pr-0.5">
                {colTasks.map(t => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, t.id)}
                    className="bg-slate-800 border border-white/[0.04] p-2.5 rounded-lg shadow-md cursor-grab active:cursor-grabbing hover:border-white/10 transition-colors group relative"
                  >
                    {editingId === t.id ? (
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          className="w-full bg-slate-950 border border-white/10 rounded p-1.5 text-xs text-white focus:border-violet-500 outline-none resize-none"
                          rows={2}
                          value={editingText}
                          onChange={e => setEditingText(e.target.value)}
                        />
                        <div className="flex justify-end gap-1">
                          <button onClick={() => saveEdit(t.id)} className="p-1 bg-emerald-600 rounded text-white"><Check size={10} /></button>
                          <button onClick={() => setEditingId(null)} className="p-1 bg-slate-700 rounded text-slate-300">✕</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-slate-200 leading-normal break-words pr-5" onClick={() => startEdit(t)}>{t.text}</p>
                        <button
                          onClick={() => deleteTask(t.id)}
                          className="absolute top-2 right-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={10} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WIDGET: Calculadoras de Frete (Agência & Flex Reconciliação) ──────────────
function CalculadorasFrete({ orders }) {
  const [tab, setTab] = useState('agencia'); // 'agencia' | 'flex'

  // Calculadora de Agência
  const [cep, setCep] = useState('');
  const [peso, setPeso] = useState('');
  const [cubagem, setCubagem] = useState({ a: '', l: '', c: '' });
  const [freteEstimado, setFreteEstimado] = useState(null);

  // Reconciliador Flex
  const [faturaTexto, setFaturaTexto] = useState('');
  const [taxasFlex, setTaxasFlex] = useState({
    zona1: '9.90',
    zona2: '14.90',
    zona3: '19.90'
  });
  const [conferido, setConferido] = useState(null);

  // Simular frete de balcão Correios / PAC / Agência
  const calcularFreteAgencia = (e) => {
    e.preventDefault();
    const p = parseFloat(peso) || 0.1;
    const a = parseFloat(cubagem.a) || 10;
    const l = parseFloat(cubagem.l) || 10;
    const c = parseFloat(cubagem.c) || 10;

    // Cálculo volumétrico vs real
    const pesoVol = (a * l * c) / 6000;
    const pesoEfetivo = Math.max(p, pesoVol);

    // Custo base simulado por faixas de peso e UF fictício (CEP)
    let base = 12.90;
    if (pesoEfetivo > 0.5) base = 16.50;
    if (pesoEfetivo > 1.0) base = 21.00;
    if (pesoEfetivo > 2.0) base = 28.50;
    if (pesoEfetivo > 5.0) base = 42.00;

    // Acréscimo por distância (ex: CEP inicial)
    const cepRegiao = parseInt(cep.substring(0, 2)) || 11;
    let dist = 1.0;
    if (cepRegiao >= 20 && cepRegiao < 40) dist = 1.25; // RJ / MG
    if (cepRegiao >= 40 && cepRegiao < 80) dist = 1.6;  // Sul / Nordeste
    if (cepRegiao >= 80) dist = 2.1;                    // Norte / Centro-Oeste

    const total = base * dist;
    setFreteEstimado({
      pesoVol: pesoVol.toFixed(2),
      pesoEfetivo: pesoEfetivo.toFixed(2),
      total: total.toFixed(2)
    });
  };

  // Reconciliador Inteligente Flex
  const analisarFaturaFlex = () => {
    if (!faturaTexto.trim()) return;

    // Converte texto em linhas contendo valores numéricos
    const linhas = faturaTexto.split('\n')
      .map(l => l.replace(/[^0-9,.]/g, '').replace(',', '.'))
      .map(parseFloat)
      .filter(n => !isNaN(n) && n > 0);

    // Filtra pedidos flex entregues no sistema (ou simulados)
    const flexOrders = orders.filter(o => o.logistica === 'flex' || o.marketplace?.includes('ML'));
    const totalOrders = flexOrders.length;

    // Simula atribuição de faixas (Zona 1, 2, 3) conforme os valores declarados
    const rateZ1 = parseFloat(taxasFlex.zona1);
    const rateZ2 = parseFloat(taxasFlex.zona2);
    const rateZ3 = parseFloat(taxasFlex.zona3);

    let totalPrevisto = 0;
    let inconsistentes = [];
    let totalCobrado = 0;

    linhas.forEach((valorCobrado, i) => {
      totalCobrado += valorCobrado;
      
      // Procura se o valor cobrado bate com alguma de nossas zonas configuradas
      const bateZona = Math.abs(valorCobrado - rateZ1) < 0.1 ||
                       Math.abs(valorCobrado - rateZ2) < 0.1 ||
                       Math.abs(valorCobrado - rateZ3) < 0.1;

      if (!bateZona) {
        inconsistentes.push({
          idx: i + 1,
          valor: valorCobrado,
          motivo: 'Valor não corresponde a nenhuma zona configurada'
        });
      }
    });

    // Se temos menos ou mais coletas cobradas do que pedidos expedidos
    const diferencaColetas = linhas.length - totalOrders;

    setConferido({
      totalCobrado,
      totalPrevisto: totalOrders * rateZ2, // Média ponderada para o KPI inicial
      pedidosSistema: totalOrders,
      faturadosCobrados: linhas.length,
      inconsistentes,
      diferencaColetas
    });
  };

  return (
    <div className="bg-slate-900/50 border border-white/[0.05] rounded-2xl p-5 space-y-4">
      {/* Tabs */}
      <div className="flex border-b border-white/[0.05] pb-3 justify-between items-center">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Calculator className="text-emerald-400" size={16} /> Calculadoras de Frete
        </h3>
        <div className="flex bg-slate-950/60 p-0.5 rounded-lg border border-white/5">
          <button 
            type="button"
            onClick={() => setTab('agencia')} 
            className={`px-3 py-1 text-[11px] font-bold rounded-md transition-colors ${tab === 'agencia' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Agência (Balcão)
          </button>
          <button 
            type="button"
            onClick={() => setTab('flex')} 
            className={`px-3 py-1 text-[11px] font-bold rounded-md transition-colors ${tab === 'flex' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Reconciliador Flex
          </button>
        </div>
      </div>

      {/* TAB A: CALCULADORA MANUAL AGENCIA */}
      {tab === 'agencia' && (
        <form onSubmit={calcularFreteAgencia} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-slate-500 font-bold uppercase">CEP Destino</label>
              <input 
                placeholder="00000-000" 
                maxLength="9" 
                className="bg-slate-800 text-white p-2.5 rounded-xl text-xs border border-white/5 outline-none focus:border-emerald-500/50"
                value={cep} 
                onChange={e => setCep(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-slate-500 font-bold uppercase">Peso Real (kg)</label>
              <input 
                type="number" 
                step="0.01" 
                placeholder="0.5" 
                className="bg-slate-800 text-white p-2.5 rounded-xl text-xs border border-white/5 outline-none focus:border-emerald-500/50"
                value={peso} 
                onChange={e => setPeso(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] text-slate-500 font-bold uppercase mb-1 block">Dimensões (cm)</label>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" placeholder="Altura" className="bg-slate-800 text-white p-2.5 rounded-xl text-xs border border-white/5 outline-none"
                value={cubagem.a} onChange={e => setCubagem({...cubagem, a: e.target.value})} />
              <input type="number" placeholder="Largura" className="bg-slate-800 text-white p-2.5 rounded-xl text-xs border border-white/5 outline-none"
                value={cubagem.l} onChange={e => setCubagem({...cubagem, l: e.target.value})} />
              <input type="number" placeholder="Comprimento" className="bg-slate-800 text-white p-2.5 rounded-xl text-xs border border-white/5 outline-none"
                value={cubagem.c} onChange={e => setCubagem({...cubagem, c: e.target.value})} />
            </div>
          </div>

          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5">
            <Calculator size={13} /> Calcular Frete Estimado
          </button>

          {freteEstimado && (
            <div className="bg-slate-950/60 rounded-xl p-3 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Peso Cubado (Fórmula):</span>
                <span className="font-mono text-slate-300">{freteEstimado.pesoVol} kg</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Peso Tarifado (Efetivo):</span>
                <span className="font-mono text-slate-300">{freteEstimado.pesoEfetivo} kg</span>
              </div>
              <div className="flex justify-between text-white font-bold border-t border-white/5 pt-2">
                <span>Custo de Balcão Estimado:</span>
                <span className="font-mono text-emerald-400 text-sm">R$ {freteEstimado.total}</span>
              </div>
            </div>
          )}
        </form>
      )}

      {/* TAB B: RECONCILIADOR FLEX */}
      {tab === 'flex' && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[8px] text-slate-500 font-bold uppercase">Zona 1 (R$)</label>
              <input type="number" step="0.1" className="bg-slate-800 text-white p-2 rounded-lg text-[11px] border-none text-center"
                value={taxasFlex.zona1} onChange={e => setTaxasFlex({...taxasFlex, zona1: e.target.value})} />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[8px] text-slate-500 font-bold uppercase">Zona 2 (R$)</label>
              <input type="number" step="0.1" className="bg-slate-800 text-white p-2 rounded-lg text-[11px] border-none text-center"
                value={taxasFlex.zona2} onChange={e => setTaxasFlex({...taxasFlex, zona2: e.target.value})} />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[8px] text-slate-500 font-bold uppercase">Zona 3 (R$)</label>
              <input type="number" step="0.1" className="bg-slate-800 text-white p-2 rounded-lg text-[11px] border-none text-center"
                value={taxasFlex.zona3} onChange={e => setTaxasFlex({...taxasFlex, zona3: e.target.value})} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-slate-500 font-bold uppercase">Valores Cobrados pela Transportadora</label>
            <textarea 
              rows={3} 
              placeholder="Cole os valores da fatura (ex: um valor por linha, aceita vírgulas e textos)..." 
              className="bg-slate-800 text-white p-2.5 rounded-xl text-xs border border-white/5 outline-none resize-none font-mono focus:border-emerald-500/50"
              value={faturaTexto} 
              onChange={e => setFaturaTexto(e.target.value)}
            />
          </div>

          <button onClick={analisarFaturaFlex} className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5">
            <Calculator size={13} /> Analisar e Reconciliar
          </button>

          {conferido && (
            <div className="bg-slate-950/60 rounded-xl p-3 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Coletas no Hub (Hoje):</span>
                <span className="font-mono text-slate-300">{conferido.pedidosSistema} envios</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Itens Cobrados na Fatura:</span>
                <span className="font-mono text-slate-300">{conferido.faturadosCobrados} itens</span>
              </div>
              {conferido.diferencaColetas !== 0 && (
                <div className="flex justify-between text-amber-400 font-semibold bg-amber-500/5 px-2 py-1 rounded">
                  <span>Divergência de Entregas:</span>
                  <span>{conferido.diferencaColetas > 0 ? `+${conferido.diferencaColetas} cobradas` : `${conferido.diferencaColetas} faltantes`}</span>
                </div>
              )}
              {conferido.inconsistentes.length > 0 && (
                <div className="space-y-1 mt-1 border-t border-white/5 pt-1">
                  <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider block">Valores Suspeitos:</span>
                  <div className="max-h-[80px] overflow-y-auto space-y-1 font-mono text-[10px]">
                    {conferido.inconsistentes.map((inc, i) => (
                      <div key={i} className="text-red-400 flex justify-between">
                        <span>Item #{inc.idx}</span>
                        <span>R$ {inc.valor.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between text-white font-bold border-t border-white/5 pt-2">
                <span>Total Cobrado na Fatura:</span>
                <span className="font-mono text-emerald-400 text-sm">R$ {conferido.totalCobrado.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
  useEffect(() => { const id = setInterval(load, 180_000); return () => clearInterval(id); }, [load]);

  const summary = data?.summary || { flex: 0, agency: 0, fulfillment: 0, cancelados: 0, total: 0 };
  const mlConnected = data?.mlConnected || false;

  // Gráfico Recharts para dados do Hub
  const chartData = [
    { name: 'Flex', quantidade: summary.flex || 0 },
    { name: 'Agência', quantidade: summary.agency || 0 },
    { name: 'Full', quantidade: summary.fulfillment || 0 },
    { name: 'Cancelados', quantidade: summary.cancelados || 0 },
  ];

  return (
    <div className="h-full overflow-y-auto scrollbar-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Top Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-black text-slate-100 uppercase tracking-tight">{dateBR()}</h1>
            <p className="text-slate-500 text-xs font-mono mt-0.5">{clock} · Horário de Brasília</p>
          </div>
          <div className="flex items-center gap-2">
            {mlConnected ? (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-wider">
                <Wifi size={10} /> ML Online
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full uppercase tracking-wider">
                <WifiOff size={10} /> ML Local Mode
              </span>
            )}
            <button
              onClick={load} disabled={loading}
              className="p-2 rounded-xl border border-white/5 text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-all disabled:opacity-40"
              title="Atualizar"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ── ML Offline Banner ── */}
        {!mlConnected && <MLOffline onRetry={load} />}

        {/* ── Seção de Indicadores Críticos (se conectado) ── */}
        {mlConnected && (
          <div className="space-y-4">
            <CutoffBanner cutoffSchedule={data.cutoffSchedule} summary={summary} />
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ModalidadeCard
                icon={Zap} label="Pedidos Flex" count={summary.flex || 0}
                sub={(summary.flex || 0) > 0 ? 'Fila de separação Flex' : 'Zero pendências'}
                href="/expedicao/pedidos" disabled={!summary.flex}
                colors={{ border:'border-purple-500/20', bg:'bg-purple-500/5', iconBg:'bg-purple-500/15',
                          icon:'text-purple-400', count:'text-purple-300', action:'text-purple-400' }}
              />
              <ModalidadeCard
                icon={Building2} label="Agência ML" count={summary.agency || 0}
                sub={(summary.agency || 0) > 0 ? 'Bipar etiquetas' : 'Zero pendências'}
                href="/expedicao/pedidos" disabled={!summary.agency}
                colors={{ border:'border-blue-500/20', bg:'bg-blue-500/5', iconBg:'bg-blue-500/15',
                          icon:'text-blue-400', count:'text-blue-300', action:'text-blue-400' }}
              />
              <ModalidadeCard
                icon={Boxes} label="Full ML" count={summary.fulfillment || 0}
                sub="Processamento no CD" disabled
                colors={{ border:'border-teal-500/20', bg:'bg-teal-500/5', iconBg:'bg-teal-500/15',
                          icon:'text-teal-400', count:'text-teal-300', action:'text-teal-400' }}
              />
              <ModalidadeCard
                icon={XCircle} label="Cancelados" count={summary.cancelados || 0}
                sub="Bloquear separação" disabled
                colors={{ border:'border-red-500/20', bg:'bg-red-500/5', iconBg:'bg-red-500/15',
                          icon:'text-red-400', count:'text-red-300', action:'text-red-400', sub:'text-red-400/60' }}
              />
            </div>
          </div>
        )}

        {/* ── LAYOUT CENTRAL: KANBAN TAREFAS ── */}
        <KanbanBoard />

        {/* ── LAYOUT SECUNDÁRIO: GRÁFICOS & CALCULADORAS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Calculadoras de Frete */}
          <div className="lg:col-span-1">
            <CalculadorasFrete orders={data?.orders || []} />
          </div>

          {/* Gráfico de Entregas e Lista Recente */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Gráfico Recharts (Visão Rápida) */}
            {mlConnected && summary.total > 0 && (
              <div className="bg-slate-900/50 border border-white/[0.05] rounded-2xl p-4 h-[160px] flex flex-col justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Resumo Operacional (Fila do Dia)</p>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 0, right: 10, left: -25, bottom: 0 }}>
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} labelStyle={{ fontSize: 10, fontWeight: 'bold' }} itemStyle={{ fontSize: 10, color: '#34d399' }} />
                      <Bar dataKey="quantidade" fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Listagem Recente */}
            <PedidosRecentes orders={data?.orders || []} />
          </div>
        </div>

        <p className="text-center text-slate-700 text-[10px] pb-4">
          UniversoBox Hub v4.0 · Atualizado às {clock}
        </p>
      </div>
    </div>
  );
}
