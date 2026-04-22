/**
 * @file Toast.jsx
 * @module ui
 * @description Notificação flutuante. Aceita tipo/type: "ok" = sucesso; "err"|"erro" = erro; "info" = azul.
 * @version 1.1.0
 * @date 2026-04-22
 * @changelog
 *   1.1.0 — Aceita prop `type` além de `tipo`; suporte a "info"; posição configurável (right|center).
 *   1.0.0 — Versão inicial.
 */

import { CheckCircle, XCircle, Info } from 'lucide-react';

const STYLES = {
  ok:   'bg-emerald-900/90 border-emerald-600/50 text-emerald-300',
  err:  'bg-red-900/90 border-red-600/50 text-red-300',
  erro: 'bg-red-900/90 border-red-600/50 text-red-300',
  info: 'bg-blue-900/90 border-blue-600/50 text-blue-300',
};
const ICONS = { ok: CheckCircle, err: XCircle, erro: XCircle, info: Info };

export function Toast({ msg, tipo, type, position = 'right' }) {
  if (!msg) return null;
  const t    = tipo ?? type ?? 'info';
  const cls  = STYLES[t] ?? STYLES.err;
  const Icon = ICONS[t]  ?? XCircle;
  const pos  = position === 'center'
    ? 'bottom-6 left-1/2 -translate-x-1/2'
    : 'bottom-6 right-6';

  return (
    <div className={`fixed ${pos} z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border animate-slide-in-right ${cls}`}>
      <Icon size={16} />
      {msg}
    </div>
  );
}
