/**
 * @file GraficoPizza.jsx
 * @module financeiro
 * @description Gráfico donut de distribuição por categoria (campo "nome").
 *              Categorias com menos de 3% do total são agrupadas em "Outros".
 * @version 1.0.0
 * @date 2026-04-01
 * @author UniversoLab
 *
 * @changelog
 *   1.0.0 — 2026-04-01 — Criação inicial para o PainelFinanceiro.
 */

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { BRL } from '../../../utils/financeiroUtils';

// Paleta que contrasta bem no fundo slate-800
const CORES = ['#34d399', '#60a5fa', '#f97316', '#a78bfa', '#fb7185', '#fbbf24', '#22d3ee', '#e879f9'];

function TooltipCustom({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value, percent } = payload[0].payload;
  return (
    <div className="rounded-lg bg-slate-900 border border-white/10 p-3 text-sm shadow-xl">
      <p className="font-semibold text-slate-200">{name}</p>
      <p className="text-slate-400">{BRL.format(value)}</p>
      <p className="text-slate-500">{(percent * 100).toFixed(1)}%</p>
    </div>
  );
}

export function GraficoPizza({ despesasMes }) {
  // Agrupa por categoria
  const mapa = {};
  despesasMes.forEach(d => {
    const cat = d.categoria || d.nome || 'Sem categoria';
    mapa[cat] = (mapa[cat] || 0) + d.valor;
  });

  const totalGeral = Object.values(mapa).reduce((s, v) => s + v, 0);

  if (totalGeral === 0) {
    return (
      <div className="rounded-xl bg-slate-800 border border-white/5 p-6 flex items-center justify-center h-64">
        <p className="text-slate-500 text-sm">Sem dados no mês selecionado</p>
      </div>
    );
  }

  // Separa categorias com < 3% em "Outros"
  let outros = 0;
  const principais = [];
  Object.entries(mapa).forEach(([nome, valor]) => {
    if (valor / totalGeral < 0.03) {
      outros += valor;
    } else {
      principais.push({ name: nome, value: valor });
    }
  });
  if (outros > 0) principais.push({ name: 'Outros', value: outros });
  principais.sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-xl bg-slate-800 border border-white/5 p-5">
      <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">
        Distribuição por Categoria
      </h2>
      <div className="flex flex-col lg:flex-row items-center gap-6">
        <ResponsiveContainer width={220} height={220}>
          <PieChart>
            <Pie
              data={principais}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={2}
              dataKey="value"
            >
              {principais.map((_, i) => (
                <Cell key={i} fill={CORES[i % CORES.length]} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<TooltipCustom />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Legenda lateral */}
        <ul className="flex flex-col gap-2 flex-1 min-w-0">
          {principais.map((item, i) => (
            <li key={item.name} className="flex items-center gap-2 text-sm">
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: CORES[i % CORES.length] }}
              />
              <span className="truncate text-slate-300 flex-1">{item.name}</span>
              <span className="text-slate-400 shrink-0">{BRL.format(item.value)}</span>
              <span className="text-slate-600 shrink-0 w-12 text-right">
                {((item.value / totalGeral) * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
