/**
 * @file useOrderNotifier.js
 * @description Polling a cada 30s para novos pedidos pending.
 *              Dispara som + callback quando count aumenta.
 */

import { useEffect, useRef, useCallback } from 'react';

const TERMINAL_ID = (() => {
  let id = localStorage.getItem('expedicao_pro_terminal_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('expedicao_pro_terminal_id', id); }
  return id;
})();

function beepNewOrder() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // 3 bipes suaves descendentes — inconfundível com scan
    [880, 700, 560].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
      g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.18 + 0.15);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.18);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {}
}

export function useOrderNotifier({ enabled = true, intervalMs = 30_000, onNewOrders }) {
  const lastCount = useRef(null);
  const timerRef  = useRef(null);

  const poll = useCallback(async () => {
    try {
      const token = localStorage.getItem('expedicao_token') || '';
      const res = await fetch('/orders/list?status=pending&limit=1', {
        headers: { authorization: `Bearer ${token}`, 'x-terminal-id': TERMINAL_ID },
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const count = data?.total ?? (data?.items?.length ?? 0);

      if (lastCount.current !== null && count > lastCount.current) {
        const diff = count - lastCount.current;
        beepNewOrder();
        onNewOrders?.(diff, count);
        // Browser notification (se permissão concedida)
        if (Notification.permission === 'granted') {
          new Notification('📦 Novos pedidos!', {
            body: `${diff} novo(s) pedido(s) para separar`,
            icon: '/spa/icon-192.svg',
            tag: 'new-orders',
            renotify: true,
          });
        }
      }
      lastCount.current = count;
    } catch {}
  }, [onNewOrders]);

  useEffect(() => {
    if (!enabled) return;
    // Pede permissão de notificação
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    poll();
    timerRef.current = setInterval(poll, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [enabled, intervalMs, poll]);
}
