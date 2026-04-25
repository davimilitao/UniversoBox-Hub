'use strict';
/**
 * @file jobs/notificador.js
 * @description Notificador via Telegram — Tier 1 (urgente) + Tier 2 (alertas matinais).
 *
 * Tier 1 — urgente (polling contínuo):
 *   - Nova reclamação ML aberta ou em mediação → a cada 5min
 *   - Novo pedido criado → hook direto via notificarNovoPedido()
 *
 * Tier 2 — alertas matinais (1x/dia 08:00 BR):
 *   - Despesas/parcelas vencendo amanhã
 *   - Insumos abaixo do estoque mínimo
 *   - Cartões com vencimento em ≤ 3 dias
 *
 * Tier 2 — lembrete coleta (1x/dia 12:00 BR):
 *   - Coleta do dia não registrada
 */

const { sendTelegram, sendTelegramSilent, telegramConfigurado } = require('../utils/telegram');

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// ─── estado em memória (reseta no restart — OK para sistema pequeno) ──────────
const estado = {
  claimIdsNotificados: new Set(),
  checkDia: { manha: null, meio: null },  // 'YYYY-MM-DD' quando cada check rodou
  ultimoPedidoCount: null,
};

// ─── deps injetadas na inicialização ─────────────────────────────────────────
let _admin        = null;
let _mlEnsureToken = null;
let _ML_API_BASE  = null;

// ─── helpers ─────────────────────────────────────────────────────────────────

function horaBR() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date());
}

function dataBR() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());  // YYYY-MM-DD
}

function hojeInicio() {
  const d = new Date();
  const br = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  return new Date(`${br}T00:00:00-03:00`);
}

function amanhaInicio() {
  const t = hojeInicio();
  t.setDate(t.getDate() + 1);
  return t;
}

function amanhaFim() {
  const t = amanhaInicio();
  t.setDate(t.getDate() + 1);
  return t;
}

/** Carrega todos os chatIds registrados (uma entrada por tenant). */
async function carregarChatIds() {
  try {
    const snap = await _admin.firestore().collection('telegram_config').where('ativo', '==', true).get();
    return snap.docs.map(d => ({ chatId: d.data().chatId, tenantId: d.id }));
  } catch (e) {
    console.error('[Notificador] Erro ao carregar chatIds:', e.message);
    return [];
  }
}

// ─── Tier 1: Reclamações ML ───────────────────────────────────────────────────

async function checkClaims() {
  if (!telegramConfigurado()) return;
  try {
    const token = await _mlEnsureToken();
    const headers = { Authorization: `Bearer ${token}` };

    const [abertas, mediacao] = await Promise.all([
      fetch(`${_ML_API_BASE}/post-purchase/claims/search?role=seller&status=opened&limit=20`, { headers })
        .then(r => r.ok ? r.json() : { data: [] }),
      fetch(`${_ML_API_BASE}/post-purchase/claims/search?role=seller&status=in_mediation&limit=20`, { headers })
        .then(r => r.ok ? r.json() : { data: [] }),
    ]);

    const claimsAbertas   = abertas.data   || abertas.results   || [];
    const claimsMediacao  = mediacao.data  || mediacao.results  || [];
    const todos = [...claimsAbertas, ...claimsMediacao];

    const configs = await carregarChatIds();
    if (!configs.length) return;

    for (const claim of todos) {
      const id = String(claim.id);
      if (estado.claimIdsNotificados.has(id)) continue;
      estado.claimIdsNotificados.add(id);

      const emMediacao = claimsMediacao.some(c => String(c.id) === id);
      const comprador  = claim.players?.find(p => p.role === 'complainant')?.user_id || '?';
      const motivo     = claim.reason_id || claim.reason || 'motivo não informado';

      const emoji  = emMediacao ? '🚨' : '⚠️';
      const status = emMediacao ? 'EM MEDIAÇÃO — ação necessária!' : 'Reclamação aberta';
      const texto  = `${emoji} <b>ML: ${status}</b>\n\nComprador: <code>${comprador}</code>\nMotivo: ${motivo}\nID: #${id}\n\n<a href="https://www.mercadolivre.com.br/vendas/reclamacoes">→ Ver no Mercado Livre</a>`;

      for (const { chatId } of configs) {
        await sendTelegram(chatId, texto);
      }
    }
  } catch (e) {
    if (!e.message?.includes('ml_not_authorized')) {
      console.error('[Notificador] checkClaims:', e.message);
    }
  }
}

// ─── Tier 1: Notificar novo pedido (chamado diretamente do endpoint) ──────────

async function notificarNovoPedido({ clienteNome, marketplace, qtdItens, logistica, isPriority }) {
  if (!telegramConfigurado()) return;
  try {
    const configs = await carregarChatIds();
    if (!configs.length) return;

    const emoji     = isPriority ? '🔴' : '📦';
    const mod       = logistica === 'flex' ? 'Flex' : logistica === 'fulfillment' ? 'Full' : 'Agência';
    const prioridade = isPriority ? ' — <b>PRIORITÁRIO</b>' : '';
    const texto     = `${emoji} <b>Novo pedido${prioridade}</b>\n\nCliente: ${clienteNome || 'ML'}\nMarketplace: ${marketplace || 'ML'}\nModalidade: ${mod}\nItens: ${qtdItens}\nHorário: ${horaBR()}`;

    for (const { chatId } of configs) {
      await sendTelegram(chatId, texto);
    }
  } catch (e) {
    console.error('[Notificador] notificarNovoPedido:', e.message);
  }
}

// ─── Tier 2: Checks matinais (08:00) ─────────────────────────────────────────

async function checkDespesasVencendo(configs) {
  try {
    const aman = amanhaInicio();
    const amanFim = amanhaFim();
    const amanTs  = _admin.firestore.Timestamp.fromDate(aman);
    const amanFimTs = _admin.firestore.Timestamp.fromDate(amanFim);

    // fin_despesas vencendo amanhã
    const despSnap = await _admin.firestore()
      .collection('fin_despesas')
      .where('situacao', '==', 'pendente')
      .where('data', '>=', amanTs)
      .where('data', '<', amanFimTs)
      .get();

    // fin_parcelas vencendo amanhã
    const parcSnap = await _admin.firestore()
      .collection('fin_parcelas')
      .where('status', '==', 'pendente')
      .where('vencimento', '>=', amanTs)
      .where('vencimento', '<', amanFimTs)
      .get();

    const despesas = despSnap.docs.map(d => d.data());
    const parcelas = parcSnap.docs.map(d => d.data());

    if (!despesas.length && !parcelas.length) return;

    const linhas = [];
    for (const d of despesas) {
      linhas.push(`• ${d.fornecedor || d.categoria} — ${BRL.format(d.valor)}`);
    }
    for (const p of parcelas) {
      linhas.push(`• ${p.fornecedor} (${p.numeroParcela}/${p.totalParcelas}) — ${BRL.format(p.valor)}`);
    }

    const total = [...despesas, ...parcelas].reduce((s, x) => s + (x.valor || 0), 0);
    const texto = `💳 <b>Vence amanhã — ${BRL.format(total)}</b>\n\n${linhas.join('\n')}\n\n→ /financeiro/despesas`;

    for (const { chatId } of configs) {
      await sendTelegramSilent(chatId, texto);
    }
  } catch (e) {
    console.error('[Notificador] checkDespesasVencendo:', e.message);
  }
}

async function checkInsumosCriticos(configs) {
  try {
    const snap = await _admin.firestore().collection('insumos').get();
    const criticos = snap.docs
      .map(d => d.data())
      .filter(i => typeof i.estoque_atual === 'number' && typeof i.estoque_minimo === 'number'
                   && i.estoque_atual <= i.estoque_minimo);

    if (!criticos.length) return;

    const linhas = criticos.map(i =>
      `• ${i.nome} — ${i.estoque_atual} ${i.unidade_medida_uso || 'un.'} (mín: ${i.estoque_minimo})`
    );
    const texto = `📦 <b>Insumos abaixo do mínimo</b>\n\n${linhas.join('\n')}\n\n→ /expedicao/insumos`;

    for (const { chatId } of configs) {
      await sendTelegramSilent(chatId, texto);
    }
  } catch (e) {
    console.error('[Notificador] checkInsumosCriticos:', e.message);
  }
}

async function checkCartoesVencendo(configs) {
  try {
    const snap = await _admin.firestore().collection('fin_meios_pagamento').where('ativo', '==', true).get();
    const meios = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const alertas = [];

    for (const m of meios) {
      if (!m.diaVencimento) continue;
      const mes = hoje.getMonth();
      const ano = hoje.getFullYear();
      const ultimoDia = (mo, a) => new Date(a, mo + 1, 0).getDate();
      let venc = new Date(ano, mes, Math.min(m.diaVencimento, ultimoDia(mes, ano)));
      if (venc <= hoje) {
        venc = new Date(ano, mes + 1, Math.min(m.diaVencimento, ultimoDia(mes + 1, ano)));
      }
      const dias = Math.ceil((venc - hoje) / 86400000);
      if (dias <= 3) {
        alertas.push({ nome: m.nome, dias, data: venc.toLocaleDateString('pt-BR') });
      }
    }

    if (!alertas.length) return;

    const linhas = alertas.map(a =>
      `• ${a.nome} — vence ${a.dias === 0 ? 'HOJE' : `em ${a.dias} dia${a.dias > 1 ? 's' : ''}`} (${a.data})`
    );
    const texto = `💳 <b>Cartão(ões) vencendo em breve</b>\n\n${linhas.join('\n')}\n\n→ /financeiro/despesas`;

    for (const { chatId } of configs) {
      await sendTelegram(chatId, texto);
    }
  } catch (e) {
    console.error('[Notificador] checkCartoesVencendo:', e.message);
  }
}

async function checkColetaNaoRegistrada(configs) {
  try {
    const hoje = dataBR();
    const snap = await _admin.firestore()
      .collection('coletas_agenda')
      .where('data', '==', hoje)
      .limit(1)
      .get();

    if (!snap.empty) return; // coleta já registrada

    const texto = `🚛 <b>Lembrete: coleta do dia não registrada</b>\n\nSão 12h e nenhuma coleta foi registrada hoje (${hoje}).\n\n→ Registre em /expedicao/coletas`;

    for (const { chatId } of configs) {
      await sendTelegram(chatId, texto);
    }
  } catch (e) {
    console.error('[Notificador] checkColetaNaoRegistrada:', e.message);
  }
}

// ─── Orquestrador de horários ─────────────────────────────────────────────────

async function checkHorario() {
  if (!telegramConfigurado()) return;

  const [hora, minuto] = horaBR().split(':').map(Number);
  const hoje = dataBR();

  // 08:00–08:04 — alertas matinais
  if (hora === 8 && minuto < 5 && estado.checkDia.manha !== hoje) {
    estado.checkDia.manha = hoje;
    const configs = await carregarChatIds();
    if (configs.length) {
      await Promise.all([
        checkDespesasVencendo(configs),
        checkInsumosCriticos(configs),
        checkCartoesVencendo(configs),
      ]);
    }
  }

  // 12:00–12:04 — lembrete coleta
  if (hora === 12 && minuto < 5 && estado.checkDia.meio !== hoje) {
    estado.checkDia.meio = hoje;
    const configs = await carregarChatIds();
    if (configs.length) {
      await checkColetaNaoRegistrada(configs);
    }
  }
}

// ─── Inicialização ────────────────────────────────────────────────────────────

function iniciarNotificador({ admin, mlEnsureToken, ML_API_BASE }) {
  _admin         = admin;
  _mlEnsureToken = mlEnsureToken;
  _ML_API_BASE   = ML_API_BASE;

  if (!telegramConfigurado()) {
    console.log('[Notificador] TELEGRAM_BOT_TOKEN não configurado — notificações desativadas.');
    return;
  }

  console.log('[Notificador] Iniciando...');

  // Polling de claims ML — a cada 5min
  setInterval(checkClaims, 5 * 60 * 1000);

  // Verificação de horário — a cada 1min
  setInterval(checkHorario, 60 * 1000);

  // Primeira execução após 15s (evita sobrecarga no boot)
  setTimeout(() => {
    checkClaims().catch(() => {});
    checkHorario().catch(() => {});
  }, 15_000);

  console.log('[Notificador] Ativo — claims ML (5min), alertas 08h e 12h.');
}

module.exports = { iniciarNotificador, notificarNovoPedido };
