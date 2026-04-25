'use strict';
/**
 * @file utils/telegram.js
 * @description Helper para envio de mensagens via Telegram Bot API.
 *   Usa axios (já instalado). Falhas são logadas mas nunca propagam —
 *   o sistema não pode quebrar por falha no Telegram.
 */

const axios = require('axios');

const TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const BASE    = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

/**
 * Envia mensagem para um chatId via Telegram.
 * @param {string|number} chatId
 * @param {string}        text  — suporta HTML (negrito <b>, etc.)
 * @param {object}        opts  — opções extras da API Telegram
 */
async function sendTelegram(chatId, text, opts = {}) {
  if (!BASE || !chatId) return;
  try {
    await axios.post(`${BASE}/sendMessage`, {
      chat_id:    chatId,
      text,
      parse_mode: 'HTML',
      ...opts,
    }, { timeout: 8000 });
  } catch (e) {
    console.error('[Telegram] Falha ao enviar:', e.response?.data?.description || e.message);
  }
}

/**
 * Envia mensagem silenciosa (sem notificação sonora — para alertas não urgentes).
 */
async function sendTelegramSilent(chatId, text, opts = {}) {
  return sendTelegram(chatId, text, { ...opts, disable_notification: true });
}

/**
 * Retorna true se o bot está configurado (TOKEN presente no .env).
 */
function telegramConfigurado() {
  return Boolean(TOKEN);
}

/**
 * Busca updates recentes para ajudar o usuário a descobrir seu chatId.
 */
async function getUpdates() {
  if (!BASE) return [];
  try {
    const res = await axios.get(`${BASE}/getUpdates?limit=20&timeout=0`, { timeout: 8000 });
    return res.data?.result || [];
  } catch (e) {
    console.error('[Telegram] getUpdates falhou:', e.message);
    return [];
  }
}

module.exports = { sendTelegram, sendTelegramSilent, telegramConfigurado, getUpdates };
