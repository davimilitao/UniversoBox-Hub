/**
 * @file ConfiguracoesSistema.jsx
 * @description Configurações do sistema — perfis de acesso, usuários e ambiente.
 *   Tab Perfis:   CRUD de roles com controle granular de módulos, avatar e tema
 *   Tab Usuários: listagem Firebase Auth + atribuição de perfil/role por usuário
 *   Tab Sistema:  informações do ambiente, sessão atual e links de administração
 * @version 1.0.0
 * @date 2026-04-05
 */

import { useState, useEffect, useRef } from 'react';
import {
  SlidersHorizontal, Users, Monitor, Save, Trash2, Plus, Loader2,
  CheckCircle2, X, Shield, User, Info, Settings2,
  Package, Zap, BarChart2, ClipboardList, Box, PlusCircle,
  FileCode, Receipt, ShoppingBag, FileUp, Truck, KanbanSquare,
  Home, LayoutGrid, FlaskConical,
  Globe, Database, Key, ChevronRight, Copy, Check,
  RefreshCw, AlertTriangle, Send,
} from 'lucide-react';
import { auth } from '../../firebase';
import { getAuthToken } from '../../utils/getAuthToken';
import { Toast } from '../../components/ui';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULOS_UI = [
  // Expedição
  { id: 'pedidos',        label: 'Entregas do Dia',    secao: 'Expedição',  Icon: Package },
  { id: 'manual',         label: 'Expedir Manual',     secao: 'Expedição',  Icon: ClipboardList },
  { id: 'bling',          label: 'Expedir Bling',      secao: 'Expedição',  Icon: Zap },
  { id: 'ml-dashboard',   label: 'Dashboard Meli',     secao: 'Expedição',  Icon: BarChart2 },
  { id: 'insumos',        label: 'Gestão Insumos',     secao: 'Expedição',  Icon: FlaskConical },
  { id: 'coletas',        label: 'Gestão de Coletas',  secao: 'Expedição',  Icon: Truck },
  // Catálogo
  { id: 'catalogo',       label: 'Catálogo Pro',       secao: 'Catálogo',   Icon: LayoutGrid },
  { id: 'admin',          label: 'Admin Produtos',     secao: 'Catálogo',   Icon: Settings2 },
  { id: 'embalagens',     label: 'Embalagens',         secao: 'Catálogo',   Icon: Box },
  { id: 'cadastrar',      label: 'Cadastro Rápido',    secao: 'Catálogo',   Icon: PlusCircle },
  { id: 'enriquecer-xml', label: 'Cadastro XML',       secao: 'Catálogo',   Icon: FileCode },
  { id: 'importar',       label: 'Importar CSV',       secao: 'Catálogo',   Icon: FileUp },
  // Financeiro
  { id: 'financas',       label: 'Financeiro',         secao: 'Financeiro', Icon: Receipt },
  { id: 'compras',        label: 'Compras',            secao: 'Financeiro', Icon: ShoppingBag },
  // Sistema
  { id: 'index',          label: 'Painel Principal',   secao: 'Sistema',    Icon: Home },
  { id: 'tarefas',        label: 'Tarefas (Kanban)',   secao: 'Sistema',    Icon: KanbanSquare },
  { id: 'config',         label: 'Configurações',      secao: 'Sistema',    Icon: SlidersHorizontal },
];

const MODULOS_SECOES = [...new Set(MODULOS_UI.map(m => m.secao))];

const CORES = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#64748b',
];

const TEMAS = [
  { id: 'dark',   label: 'Dark Navy',    dot: '#020617', accent: '#10b981', desc: 'Padrão escuro (Emerald)',  emoji: '🌑' },
  { id: 'uber',   label: 'Uber',         dot: '#000000', accent: '#ffffff', desc: 'Preto absoluto + branco',  emoji: '⚫' },
  { id: 'ifood',  label: 'iFood',        dot: '#0f0404', accent: '#EA1D2C', desc: 'Vermelho quente, energia', emoji: '🔴' },
  { id: '99',     label: '99',           dot: '#090800', accent: '#FFD100', desc: 'Amarelo táxi, urbano',     emoji: '🟡' },
  { id: 'marvel', label: 'Marvel',       dot: '#0d0508', accent: '#ED1D24', desc: 'Vermelho + ouro, épico',   emoji: '⚡' },
  { id: 'rick',   label: 'Rick & Morty', dot: '#06080f', accent: '#6FD08C', desc: 'Portal verde, interestelar', emoji: '🌀' },
];

const ROLE_COLORS = {
  admin:      'bg-violet-500/15 text-violet-300 border-violet-500/25',
  operacao:   'bg-blue-500/15 text-blue-300 border-blue-500/25',
  financeiro: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  catalogo:   'bg-amber-500/15 text-amber-300 border-amber-500/25',
  vendas:     'bg-pink-500/15 text-pink-300 border-pink-500/25',
};

// ─── API ─────────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const token = await getAuthToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Sub-components ───────────────────────────────────────────────────────────


function SectionCard({ icon: Icon, title, children, right }) {
  return (
    <div className="rounded-xl border border-white/[0.07] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/[0.05] bg-slate-900/60 flex items-center gap-2">
        {Icon && <Icon size={13} className="text-slate-500 shrink-0" />}
        <span className="text-[11px] font-bold text-slate-300">{title}</span>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ModuleToggle({ mod, active, onChange }) {
  const { Icon, label } = mod;
  return (
    <button
      onClick={() => onChange(mod.id)}
      className={[
        'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all w-full',
        active
          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
          : 'bg-slate-800/50 border-white/[0.05] text-slate-600 hover:text-slate-400 hover:border-slate-600',
      ].join(' ')}
    >
      <Icon size={12} className="shrink-0" />
      <span className="text-[11px] font-medium leading-tight flex-1">{label}</span>
      <span className={`w-3 h-3 rounded-full shrink-0 border-2 transition-colors ${
        active ? 'bg-emerald-400 border-emerald-300' : 'bg-transparent border-slate-700'
      }`} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM CONFIG
// ─────────────────────────────────────────────────────────────────────────────

function TelegramConfig() {
  const [status,   setStatus]   = useState(null);   // { botConfigurado, registrado, chatId }
  const [chatId,   setChatId]   = useState('');
  const [helpers,  setHelpers]  = useState([]);      // chatIds encontrados via getUpdates
  const [loading,  setLoading]  = useState(false);
  const [testando, setTestando] = useState(false);
  const [msg,      setMsg]      = useState(null);    // { tipo: 'ok'|'erro', texto }

  useEffect(() => { carregarStatus(); }, []);

  async function apiFetch(path, opts = {}) {
    const token = await auth.currentUser?.getIdToken(false);
    return fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
    });
  }

  async function carregarStatus() {
    try {
      const res = await apiFetch('/api/telegram/status');
      if (res.ok) setStatus(await res.json());
    } catch {}
  }

  async function buscarChatId() {
    setLoading(true); setMsg(null);
    try {
      const res = await apiFetch('/api/telegram/chatid-helper');
      const data = await res.json();
      if (data.chatIds?.length) {
        setHelpers(data.chatIds);
        setMsg({ tipo: 'ok', texto: `${data.chatIds.length} conversa(s) encontrada(s). Selecione abaixo.` });
      } else {
        setMsg({ tipo: 'erro', texto: 'Nenhuma conversa encontrada. Envie /start para o bot e tente novamente.' });
      }
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    if (!chatId.trim()) return;
    setLoading(true); setMsg(null);
    try {
      const res = await apiFetch('/api/telegram/register', { method: 'POST', body: JSON.stringify({ chatId }) });
      if (res.ok) {
        setMsg({ tipo: 'ok', texto: 'ChatId salvo!' });
        await carregarStatus();
      } else {
        const d = await res.json();
        setMsg({ tipo: 'erro', texto: d.error || 'Erro ao salvar' });
      }
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function testar() {
    setTestando(true); setMsg(null);
    try {
      const res = await apiFetch('/api/telegram/test', { method: 'POST' });
      if (res.ok) {
        setMsg({ tipo: 'ok', texto: 'Mensagem de teste enviada! Verifique o Telegram.' });
      } else {
        const d = await res.json();
        setMsg({ tipo: 'erro', texto: d.error || 'Erro ao testar' });
      }
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message });
    } finally {
      setTestando(false);
    }
  }

  const botOk = status?.botConfigurado;
  const registrado = status?.registrado;

  return (
    <SectionCard icon={Send} title="Notificações — Telegram Bot">
      {/* Status */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${botOk ? (registrado ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-slate-600'}`} />
        <span className="text-xs text-slate-400">
          {!botOk ? 'TOKEN não configurado no servidor (.env)' : registrado ? `Ativo — ChatId: ${status.chatId}` : 'TOKEN ok · ChatId não registrado'}
        </span>
      </div>

      {botOk && (
        <div className="space-y-3">
          {/* Passo 1: obter chatId */}
          <div className="rounded-lg bg-slate-900/60 border border-white/5 p-3 text-xs text-slate-500 space-y-1.5">
            <p className="text-slate-400 font-medium">Como configurar:</p>
            <p>1. Crie um bot em <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">@BotFather</a> e salve o TOKEN em <code className="text-slate-300 bg-slate-800 px-1 rounded">TELEGRAM_BOT_TOKEN</code> no Railway</p>
            <p>2. Abra seu bot no Telegram e envie <code className="text-slate-300 bg-slate-800 px-1 rounded">/start</code></p>
            <p>3. Clique em "Buscar meu ChatId" abaixo e selecione sua conversa</p>
          </div>

          {/* Buscar chatId */}
          <button
            onClick={buscarChatId}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Buscar meu ChatId
          </button>

          {/* Lista de chatIds encontrados */}
          {helpers.length > 0 && (
            <div className="space-y-1">
              {helpers.map(h => (
                <button
                  key={h.chatId}
                  onClick={() => setChatId(String(h.chatId))}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                    chatId === String(h.chatId)
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/8 bg-slate-800/40 text-slate-400 hover:border-white/15'
                  }`}
                >
                  <span className="font-medium">{h.nome || h.username || 'Sem nome'}</span>
                  <span className="text-slate-600 font-mono">{h.chatId}</span>
                  {h.ultimaMsg && <span className="text-slate-700 truncate ml-auto">{h.ultimaMsg}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Input manual + salvar */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="ChatId (ex: 123456789)"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              className="flex-1 rounded-lg bg-slate-900 border border-white/10 text-slate-200 text-xs px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
            />
            <button
              onClick={salvar}
              disabled={loading || !chatId.trim()}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Salvar
            </button>
          </div>

          {/* Testar */}
          {registrado && (
            <button
              onClick={testar}
              disabled={testando}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
            >
              {testando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {testando ? 'Enviando…' : 'Enviar mensagem de teste'}
            </button>
          )}
        </div>
      )}

      {/* Feedback */}
      {msg && (
        <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${msg.tipo === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.texto}
        </div>
      )}
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

export default function ConfiguracoesSistema() {
  const [tab, setTab] = useState('perfis');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  const TABS = [
    { id: 'perfis',   label: 'Perfis de Acesso', Icon: Shield },
    { id: 'usuarios', label: 'Usuários',          Icon: Users },
    { id: 'sistema',  label: 'Sistema',           Icon: Monitor },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-950 animate-fade-in">
      {toast && <Toast msg={toast.msg} type={toast.type} position="center" />}

      {/* ── Page header + tabs ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/[0.05] px-5 pt-4 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-slate-800/80 border border-white/[0.07] flex items-center justify-center shadow-inner">
            <SlidersHorizontal size={16} className="text-slate-400" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-slate-100 leading-tight">Configurações</h1>
            <p className="text-[11px] text-slate-600 mt-0.5">Perfis, usuários e informações do sistema</p>
          </div>
        </div>
        <div className="flex gap-0 -mb-px">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={[
                'flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-colors',
                tab === t.id
                  ? 'text-blue-400 border-blue-400'
                  : 'text-slate-600 border-transparent hover:text-slate-400 hover:border-slate-700',
              ].join(' ')}
            >
              <t.Icon size={13} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'perfis'   && <TabPerfis   showToast={showToast} />}
        {tab === 'usuarios' && <TabUsuarios showToast={showToast} />}
        {tab === 'sistema'  && <TabSistema  showToast={showToast} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: PERFIS
// ─────────────────────────────────────────────────────────────────────────────

function TabPerfis({ showToast }) {
  const [perfis,   setPerfis]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [draft,    setDraft]    = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showNovo, setShowNovo] = useState(false);
  const [novoId,   setNovoId]   = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [criando,  setCriando]  = useState(false);

  useEffect(() => { loadPerfis(); }, []); // eslint-disable-line

  async function loadPerfis() {
    setLoading(true);
    try {
      const d = await fetch('/api/perfis').then(r => r.json());
      const list = (d.perfis || []).sort((a, b) =>
        a.id === 'admin' ? -1 : b.id === 'admin' ? 1 : a.nome.localeCompare(b.nome)
      );
      setPerfis(list);
      if (!selected && list.length) {
        const adm = list.find(p => p.id === 'admin') || list[0];
        openPerfil(adm);
      }
    } catch { showToast('Erro ao carregar perfis', 'err'); }
    setLoading(false);
  }

  function openPerfil(p) {
    setSelected(p.id);
    setDraft({ ...p, modulos: p.modulos || [], cor: p.cor || '#10b981', tema: p.tema || 'dark', avatar: p.avatar || p.id.slice(0,2).toUpperCase() });
  }

  function toggleModulo(id) {
    setDraft(d => {
      const mods = d.modulos || [];
      return { ...d, modulos: mods.includes(id) ? mods.filter(m => m !== id) : [...mods, id] };
    });
  }

  async function salvar() {
    if (!draft) return;
    setSaving(true);
    try {
      await apiFetch(`/api/perfis/${draft.id}`, {
        method: 'PUT',
        body: JSON.stringify({ nome: draft.nome, avatar: draft.avatar, cor: draft.cor, tema: draft.tema, modulos: draft.modulos }),
      });
      showToast('Perfil salvo ✓');
      setPerfis(ps => ps.map(p => p.id === draft.id ? { ...p, ...draft } : p));
      // Aplica o tema imediatamente no sistema com transição suave
      const _html = document.documentElement;
      _html.classList.add('theme-transitioning');
      _html.setAttribute('data-theme', draft.tema || 'dark');
      setTimeout(() => _html.classList.remove('theme-transitioning'), 400);
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
    setSaving(false);
  }

  async function deletar() {
    if (!draft || draft.id === 'admin') return;
    if (!confirm(`Deletar perfil "${draft.nome}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/perfis/${draft.id}`, { method: 'DELETE' });
      showToast('Perfil deletado', 'info');
      setPerfis(ps => ps.filter(p => p.id !== draft.id));
      setSelected(null); setDraft(null);
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
    setDeleting(false);
  }

  async function criarNovo() {
    const id   = novoId.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const nome = novoNome.trim();
    if (!id || !nome) return;
    setCriando(true);
    try {
      await apiFetch('/api/perfis', {
        method: 'POST',
        body: JSON.stringify({ id, nome, tema: 'dark', modulos: [] }),
      });
      showToast('Perfil criado ✓');
      setShowNovo(false); setNovoId(''); setNovoNome('');
      await loadPerfis();
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
    setCriando(false);
  }

  const hasChanges = draft && JSON.stringify(draft) !== JSON.stringify(perfis.find(p => p.id === draft?.id));

  return (
    <div className="flex h-full min-h-0">

      {/* ── Left: profiles list ───────────────────────────────────────────────── */}
      <aside className="w-[210px] shrink-0 border-r border-white/[0.05] flex flex-col overflow-hidden bg-slate-950">
        <div className="flex-1 overflow-y-auto py-1">
          {loading && [...Array(5)].map((_, i) => (
            <div key={i} className="mx-2 my-1 h-[52px] rounded-xl bg-white/[0.03] animate-pulse" />
          ))}
          {!loading && perfis.map(p => {
            const isActive = selected === p.id;
            const modCount = (p.modulos || []).length;
            return (
              <button key={p.id} onClick={() => openPerfil(p)}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-r-2 group',
                  isActive
                    ? 'bg-blue-500/[0.07] border-blue-400'
                    : 'hover:bg-white/[0.025] border-transparent',
                ].join(' ')}
              >
                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0 ring-1 ring-black/20"
                  style={{ background: p.cor || '#10b981' }}
                >
                  {(p.avatar || p.id.slice(0, 2)).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-slate-300 truncate leading-tight">{p.nome}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-700 font-mono">{p.id}</span>
                    <span className="text-[9px] text-slate-700">·</span>
                    <span className="text-[9px] text-slate-700">{modCount} módulo{modCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                {p.id === 'admin' && (
                  <Shield size={10} className="text-violet-500 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Novo perfil */}
        <div className="shrink-0 p-2 border-t border-white/[0.05]">
          {!showNovo ? (
            <button onClick={() => setShowNovo(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-slate-800 text-[11px] text-slate-700 hover:text-emerald-400 hover:border-emerald-500/30 transition-all">
              <Plus size={13} /> Novo perfil
            </button>
          ) : (
            <div className="space-y-1.5 animate-fade-in">
              <input value={novoId} onChange={e => setNovoId(e.target.value)}
                placeholder="id-do-perfil"
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-white/[0.07] text-[11px] text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/40 font-mono transition-all" />
              <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
                placeholder="Nome exibido"
                onKeyDown={e => e.key === 'Enter' && criarNovo()}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-white/[0.07] text-[11px] text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/40 transition-all" />
              <div className="flex gap-1">
                <button onClick={criarNovo} disabled={criando || !novoId || !novoNome}
                  className="flex-1 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[11px] font-bold disabled:opacity-30 hover:bg-emerald-500/25 transition-colors">
                  {criando ? <Loader2 size={11} className="animate-spin mx-auto" /> : 'Criar'}
                </button>
                <button onClick={() => { setShowNovo(false); setNovoId(''); setNovoNome(''); }}
                  className="px-2.5 py-1.5 rounded-lg border border-white/[0.07] text-slate-600 hover:text-slate-300 transition-colors">
                  <X size={11} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Right: editor ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!draft && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-700 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/[0.05] flex items-center justify-center">
              <Shield size={24} />
            </div>
            <p className="text-sm text-slate-500 font-medium">Selecione um perfil</p>
            <p className="text-xs text-slate-700">Gerencie o acesso por módulo, tema e aparência</p>
          </div>
        )}

        {draft && (
          <div className="max-w-2xl p-5 space-y-4 pb-12 animate-fade-in">

            {/* Header card */}
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/60 border border-white/[0.07]">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-xl ring-2 ring-black/20 shrink-0"
                style={{ background: draft.cor || '#10b981' }}
              >
                {(draft.avatar || draft.id.slice(0,2)).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <input
                  value={draft.nome || ''}
                  onChange={e => setDraft(d => ({ ...d, nome: e.target.value }))}
                  className="text-[17px] font-bold bg-transparent text-slate-100 border-b border-transparent hover:border-slate-700 focus:border-blue-500/50 focus:outline-none w-full transition-colors pb-0.5 leading-tight"
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-mono text-slate-700 bg-slate-800 px-2 py-0.5 rounded-full border border-white/[0.06]">
                    {draft.id}
                  </span>
                  {draft.id === 'admin' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25 font-bold flex items-center gap-1">
                      <Shield size={9} /> Protegido
                    </span>
                  )}
                  <span className="text-[10px] text-slate-700">
                    {(draft.modulos || []).length}/{MODULOS_UI.length} módulos
                  </span>
                </div>
              </div>
            </div>

            {/* Identidade visual */}
            <SectionCard icon={null} title="Identidade visual">
              <div className="space-y-4">
                {/* Iniciais */}
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest w-20 shrink-0">Iniciais</label>
                  <input
                    value={draft.avatar || ''}
                    onChange={e => setDraft(d => ({ ...d, avatar: e.target.value.slice(0, 2).toUpperCase() }))}
                    maxLength={2}
                    placeholder={draft.id.slice(0, 2).toUpperCase()}
                    className="w-16 text-center px-2 py-1.5 rounded-lg bg-slate-800 border border-white/[0.07] text-sm font-black text-slate-200 focus:outline-none focus:border-blue-500/40 uppercase tracking-widest transition-all"
                  />
                </div>
                {/* Cor */}
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest w-20 shrink-0">Cor</label>
                  <div className="flex gap-2 flex-wrap">
                    {CORES.map(cor => (
                      <button
                        key={cor}
                        onClick={() => setDraft(d => ({ ...d, cor }))}
                        className={`w-6 h-6 rounded-full transition-all hover:scale-110 ${
                          draft.cor === cor
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110'
                            : 'ring-1 ring-black/20'
                        }`}
                        style={{ background: cor }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Tema */}
            <SectionCard icon={null} title="Tema de interface">
              <div className="grid grid-cols-2 gap-2">
                {TEMAS.map(t => (
                  <button key={t.id}
                    onClick={() => {
                      setDraft(d => ({ ...d, tema: t.id }));
                      // Preview live com transição suave
                      const _h = document.documentElement;
                      _h.classList.add('theme-transitioning');
                      _h.setAttribute('data-theme', t.id);
                      setTimeout(() => _h.classList.remove('theme-transitioning'), 400);
                    }}
                    className={[
                      'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left relative overflow-hidden',
                      draft.tema === t.id
                        ? 'border-blue-500/30 text-blue-300'
                        : 'border-white/[0.06] text-slate-500 hover:border-slate-600 hover:text-slate-300',
                    ].join(' ')}
                    style={draft.tema === t.id ? { background: `${t.dot}cc` } : { background: 'rgba(30,41,59,0.5)' }}
                  >
                    {/* Color swatch */}
                    <div className="flex -space-x-1 shrink-0">
                      <span className="w-4 h-4 rounded-full border-2 border-black/30 shadow-inner" style={{ background: t.dot }} />
                      <span className="w-4 h-4 rounded-full border-2 border-black/30 shadow-inner" style={{ background: t.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold leading-tight">{t.emoji} {t.label}</p>
                      <p className="text-[9px] opacity-60 leading-tight mt-0.5">{t.desc}</p>
                    </div>
                    {draft.tema === t.id && <CheckCircle2 size={13} className="ml-auto text-blue-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </SectionCard>

            {/* Módulos */}
            <SectionCard icon={null} title="Módulos com acesso"
              right={
                <div className="flex gap-2">
                  <button
                    onClick={() => setDraft(d => ({ ...d, modulos: MODULOS_UI.map(m => m.id) }))}
                    className="text-[10px] px-2 py-0.5 rounded text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-colors"
                  >
                    todos
                  </button>
                  <button
                    onClick={() => setDraft(d => ({ ...d, modulos: [] }))}
                    className="text-[10px] px-2 py-0.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors"
                  >
                    nenhum
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                {MODULOS_SECOES.map(secao => (
                  <div key={secao}>
                    <p className="text-[9px] font-bold text-slate-700 uppercase tracking-[0.12em] mb-2">{secao}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {MODULOS_UI.filter(m => m.secao === secao).map(mod => (
                        <ModuleToggle
                          key={mod.id}
                          mod={mod}
                          active={(draft.modulos || []).includes(mod.id)}
                          onChange={toggleModulo}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Action bar */}
            <div className="flex items-center gap-2 pt-1">
              <button onClick={salvar} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all disabled:opacity-50 active:scale-95 shadow-lg shadow-blue-900/30">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar perfil
              </button>
              {draft.id !== 'admin' && (
                <button onClick={deletar} disabled={deleting}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-all disabled:opacity-50">
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Deletar
                </button>
              )}
              {hasChanges && (
                <span className="ml-auto text-[10px] text-amber-500 flex items-center gap-1 animate-fade-in">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Alterações não salvas
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: USUÁRIOS
// ─────────────────────────────────────────────────────────────────────────────

function TabUsuarios({ showToast }) {
  const [users,    setUsers]    = useState([]);
  const [perfis,   setPerfis]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [editUid,  setEditUid]  = useState(null);
  const [roleMap,  setRoleMap]  = useState({});
  const [saving,   setSaving]   = useState({});
  const [query,    setQuery]    = useState('');

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function load() {
    setLoading(true); setError(null);
    try {
      const [u, p] = await Promise.all([
        apiFetch('/api/users'),
        fetch('/api/perfis').then(r => r.json()),
      ]);
      const userList = u.users || [];
      setUsers(userList);
      setPerfis(p.perfis || []);
      const map = {};
      userList.forEach(u => { map[u.uid] = u.role || ''; });
      setRoleMap(map);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function saveRole(uid) {
    setSaving(s => ({ ...s, [uid]: true }));
    try {
      await apiFetch(`/api/users/${uid}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: roleMap[uid] || null }),
      });
      setUsers(us => us.map(u => u.uid === uid ? { ...u, role: roleMap[uid] || null } : u));
      showToast('Role atualizado ✓');
      setEditUid(null);
    } catch (e) { showToast('Erro: ' + e.message, 'err'); }
    setSaving(s => ({ ...s, [uid]: false }));
  }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function initials(u) {
    const src = u.displayName || u.email || '?';
    return src.slice(0, 2).toUpperCase();
  }

  const filtered = query
    ? users.filter(u =>
        (u.email || '').toLowerCase().includes(query.toLowerCase()) ||
        (u.displayName || '').toLowerCase().includes(query.toLowerCase()) ||
        (u.role || '').toLowerCase().includes(query.toLowerCase())
      )
    : users;

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4 pb-10">

      {/* Info banner */}
      <div className="flex gap-3 p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/[0.04]">
        <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
        <div className="text-[12px] text-slate-400 leading-relaxed">
          <span className="font-bold text-blue-300">Como funciona o controle de acesso — </span>
          Cada usuário recebe um <code className="text-slate-300 bg-slate-800 px-1 rounded text-[11px]">role</code> nos custom claims do Firebase.
          O role determina quais módulos aparecem no menu lateral. Após alterar, peça ao usuário que faça
          logout e login novamente para atualizar o token.
        </div>
      </div>

      {/* Search + refresh */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filtrar por email, nome ou role…"
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-900 border border-white/[0.07] text-[12px] text-slate-200 placeholder-slate-700 focus:outline-none focus:border-blue-500/30 transition-all"
          />
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-xl border border-white/[0.07] text-slate-600 hover:text-slate-300 hover:bg-white/[0.04] transition-colors disabled:opacity-30">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[60px] rounded-xl bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      )}

      {/* Error — usually means non-admin */}
      {!loading && error && (
        <div className="flex gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.05]">
          <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[12px] text-slate-400 space-y-1">
            <p className="font-bold text-amber-300">Sem permissão para listar usuários</p>
            <p>O endpoint <code className="text-slate-300 bg-slate-800 px-1 rounded text-[11px]">/api/users</code> exige role <strong className="text-slate-300">admin</strong>. Faça login com uma conta admin para gerenciar usuários.</p>
            <p className="text-[10px] text-slate-700 font-mono mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-700 text-center">
          <Users size={28} />
          <p className="text-sm text-slate-500">{query ? 'Nenhum resultado' : 'Nenhum usuário encontrado'}</p>
        </div>
      )}

      {/* User list */}
      {!loading && !error && filtered.map(u => {
        const isEditing  = editUid === u.uid;
        const perfilObj  = perfis.find(p => p.id === u.role);
        const roleColor  = ROLE_COLORS[u.role] || 'bg-slate-700/40 text-slate-500 border-slate-600/40';

        return (
          <div key={u.uid}
            className={`rounded-xl border transition-all ${
              isEditing
                ? 'border-blue-500/30 bg-blue-500/[0.03] shadow-lg shadow-blue-900/10'
                : 'border-white/[0.06] bg-slate-900/20 hover:bg-slate-900/40'
            }`}
          >
            {/* Row */}
            <div className="flex items-center gap-3 p-3.5">
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-black text-white shrink-0 ring-2 ring-black/20"
                style={{ background: perfilObj?.cor || '#475569' }}
              >
                {initials(u)}
              </div>

              {/* Name / email */}
              <div className="flex-1 min-w-0">
                {u.displayName && (
                  <p className="text-[13px] font-semibold text-slate-200 truncate leading-tight">{u.displayName}</p>
                )}
                <p className={`text-[11px] font-mono truncate ${u.displayName ? 'text-slate-600' : 'text-slate-300'}`}>
                  {u.email}
                </p>
              </div>

              {/* Role badge */}
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                u.role ? roleColor : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}>
                {u.role || 'sem role'}
              </span>

              {/* Last sign-in */}
              <span className="text-[10px] text-slate-700 hidden md:block shrink-0 tabular-nums">
                {fmtDate(u.lastSignIn)}
              </span>

              {/* Edit toggle */}
              <button
                onClick={() => setEditUid(isEditing ? null : u.uid)}
                className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                  isEditing
                    ? 'text-blue-400 bg-blue-500/10'
                    : 'text-slate-700 hover:text-slate-300 hover:bg-white/[0.04]'
                }`}
                title={isEditing ? 'Fechar' : 'Editar role'}
              >
                {isEditing ? <X size={13} /> : <Settings2 size={13} />}
              </button>
            </div>

            {/* Inline editor */}
            {isEditing && (
              <div className="px-3.5 pb-3.5 space-y-2 animate-fade-in">
                <div className="h-px bg-white/[0.04]" />
                <p className="text-[10px] text-slate-700 font-bold uppercase tracking-widest">Atribuir perfil de acesso</p>
                <div className="flex items-center gap-2">
                  <select
                    value={roleMap[u.uid] || ''}
                    onChange={e => setRoleMap(m => ({ ...m, [u.uid]: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-white/[0.07] text-sm text-slate-200 focus:outline-none focus:border-blue-500/40 transition-all"
                  >
                    <option value="">— sem role —</option>
                    {perfis.map(p => (
                      <option key={p.id} value={p.id}>{p.nome}  ({p.id})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => saveRole(u.uid)}
                    disabled={saving[u.uid]}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all disabled:opacity-50 active:scale-95"
                  >
                    {saving[u.uid] ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Salvar
                  </button>
                </div>
                {/* UID info */}
                <p className="text-[10px] text-slate-700 font-mono">uid: {u.uid}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: SISTEMA
// ─────────────────────────────────────────────────────────────────────────────

function TabSistema({ showToast }) {
  const user = auth?.currentUser;
  const [claims,  setClaims]  = useState(null);
  const [copied,  setCopied]  = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    user?.getIdTokenResult(false)
      .then(r => setClaims(r.claims))
      .catch(() => {})
      .finally(() => setLoading(false));
    if (!user) setLoading(false);
  }, [user]);

  function copyUid() {
    if (!user?.uid) return;
    navigator.clipboard.writeText(user.uid).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const InfoRow = ({ label, value, mono, children }) => (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0 gap-4 min-h-[36px]">
      <span className="text-[11px] text-slate-600 shrink-0">{label}</span>
      {children || (
        <span className={`text-[11px] text-right break-all ${mono ? 'font-mono text-blue-300' : 'text-slate-300'}`}>
          {value ?? <span className="text-slate-700">—</span>}
        </span>
      )}
    </div>
  );

  const perfilRole = claims?.role;
  const perfilNome = perfilRole
    ? { admin: 'Super Admin', operacao: 'Operação', financeiro: 'Financeiro', catalogo: 'Catálogo', vendas: 'Vendas' }[perfilRole] || perfilRole
    : null;

  const claimsFiltered = claims
    ? Object.fromEntries(
        Object.entries(claims).filter(([k]) =>
          !['iss','sub','aud','iat','exp','auth_time','firebase','user_id'].includes(k)
        )
      )
    : null;

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4 max-w-xl pb-12">

      {/* Sessão atual */}
      <SectionCard icon={User} title="Sessão atual">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-white/[0.03] rounded animate-pulse" />)}
          </div>
        ) : user ? (
          <>
            <InfoRow label="Email"    value={user.email} />
            <InfoRow label="Nome"     value={user.displayName} />
            <InfoRow label="Perfil"   value={perfilNome || perfilRole} mono />
            <InfoRow label="Tenant"   value={claims?.tenantId} mono />
            <InfoRow label="Provedor" value={user.providerData?.[0]?.providerId} />
            <InfoRow label="UID Firebase">
              <button
                onClick={copyUid}
                className="flex items-center gap-1.5 text-[11px] font-mono text-blue-300 hover:text-blue-200 transition-colors"
              >
                <span className="truncate max-w-[180px]">{user.uid?.slice(0, 22)}…</span>
                {copied
                  ? <Check size={11} className="text-emerald-400 shrink-0" />
                  : <Copy size={11} className="shrink-0" />
                }
              </button>
            </InfoRow>
          </>
        ) : (
          <p className="text-xs text-slate-600">Não autenticado</p>
        )}
      </SectionCard>

      {/* Claims JSON */}
      {claimsFiltered && Object.keys(claimsFiltered).length > 0 && (
        <SectionCard icon={Key} title="Custom claims do token"
          right={
            <span className="text-[9px] text-slate-700 italic">atualiza a cada login</span>
          }
        >
          <pre className="text-[11px] font-mono text-slate-400 overflow-x-auto leading-relaxed bg-slate-900/60 rounded-lg p-3 border border-white/[0.05]">
            {JSON.stringify(claimsFiltered, null, 2)}
          </pre>
        </SectionCard>
      )}

      {/* App info */}
      <SectionCard icon={Globe} title="Aplicação">
        <InfoRow label="Sistema"   value="UniversoBox Hub" />
        <InfoRow label="Versão"    value="3.1 — Abril 2026" />
        <InfoRow label="Ambiente"  value={
          import.meta.env.MODE === 'production'
            ? '🚀 Produção (Railway)'
            : `🛠 Dev (${import.meta.env.MODE})`
        } />
        <InfoRow label="Build"     value={import.meta.env.VITE_APP_BUILD || 'local'} mono />
        <InfoRow label="Módulos"   value={`${MODULOS_UI.length} configurados`} />
        <InfoRow label="Perfis"    value="Gerenciados via Firestore + defaults" />
      </SectionCard>

      {/* Telegram */}
      <TelegramConfig />

      {/* Links */}
      <SectionCard icon={Database} title="Administração">
        <div className="space-y-0.5">
          {[
            { label: 'Firebase Console',          href: 'https://console.firebase.google.com' },
            { label: 'Firestore Database',         href: 'https://console.firebase.google.com/firestore' },
            { label: 'Firebase Auth — Usuários',   href: 'https://console.firebase.google.com/auth' },
            { label: 'Bling ERP',                  href: 'https://www.bling.com.br' },
            { label: 'Railway — Deploy & Logs',    href: 'https://railway.app' },
            { label: 'Cloudinary — Imagens',       href: 'https://cloudinary.com' },
          ].map(l => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-slate-600 hover:text-blue-400 hover:bg-blue-500/[0.04] transition-colors group">
              <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
              {l.label}
            </a>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
