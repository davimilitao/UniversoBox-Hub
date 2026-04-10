/**
 * @file GraficoBarras.jsx
 * @module financeiro
 * @description Gráfico de barras agrupadas (Pago vs Pendente) dos últimos 6 meses
 *              disponíveis nos dados. Usa Recharts BarChart.
 * @version 1.0.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-04-01 — Criação inicial para o PainelFinanceiro.
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { parseDataBR, labelMesAno } from '../../../hooks/useDespesas';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function TooltipCustom({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-slate-800 border border-white/10 p-3 text-sm shadow-xl">
      <p className="font-semibold text-slate-200 mb-2">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {BRL.format(p.value)}
        </p>
      ))}
    </div>
  );
}

export function GraficoBarras({ despesas }) {
  // Agrupa todas as despesas por mês/ano e pega os 6 mais recentes
  const mapasMeses = {};
  despesas.forEach(d => {
    const parsed = parseDataBR(d.data);
    if (!parsed) return;
    const key = labelMesAno(parsed);
    if (!mapasMeses[key]) {
      // Guarda timestamp para ordenar depois
      mapasMeses[key] = { label: key, pago: 0, pendente: 0, ts: new Date(`${parsed.ano}-${String(parsed.mes).padStart(2,'0')}-01`).getTime() };
    }
    if (d.situacao === 'pago')      mapasMeses[key].pago     += d.valor;
    if (d.situacao === 'pendente')  mapasMeses[key].pendente += d.valor;
  });

  const dados = Object.values(mapasMeses)
    .sort((a, b) => a.ts - b.ts)
    .slice(-6)
    .map(({ label, pago, pendente }) => ({ label, Pago: pago, Pendente: pendente }));

  if (!dados.length) {
    return (
      <div className="rounded-xl bg-slate-800 border border-white/5 p-6 flex items-center justify-center h-64">
        <p className="text-slate-500 text-sm">Sem dados para exibir</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
      <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">
        Pago vs Pendente — últimos 6 meses
      </h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={dados} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<TooltipCustom />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Bar dataKey="Pago"     fill="#34d399" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Pendente" fill="#f97316" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
