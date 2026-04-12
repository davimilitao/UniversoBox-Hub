/**
 * @file FormNovaCompra.jsx
 * @module financeiro/components
 * @description Formulário para lançar uma nova compra parcelada (fin_compras + fin_parcelas).
 *              Extraído de Contas.jsx para uso na aba "Parcelas" de GestaoFinanceira.jsx.
 * @version 1.0.0
 * @date 2026-04-12
 */

import { useState, useMemo } from 'react';
import {
  ShieldCheck, AlertTriangle, BarChart2, Loader2, CheckCircle2, Banknote,
} from 'lucide-react';
import { calcParcelas } from '../../../hooks/useCompras';
import { brl } from '../../../utils/financeiroUtils';

/**
 * @param {object} props
 * @param {Array}    props.meios        — lista de meios de pagamento
 * @param {Function} props.lancarCompra — função do hook useCompras
 * @param {boolean}  props.saving       — estado de carregamento
 * @param {Function} [props.onSucesso]  — callback chamado após lançamento com sucesso
 */
export function FormNovaCompra({ meios, lancarCompra, saving, onSucesso }) {
  const EMPTY = {
    fornecedor: '', descricao: '', totalBruto: '', numeroParcelas: '1',
    taxaJuros: '', meioId: '', sku: '', qtd: '', avista: true,
  };
  const [f,    setF]    = useState(EMPTY);
  const [erro, setErro] = useState('');
  const [ok,   setOk]   = useState(false);

  const meio  = meios.find(m => m.id === f.meioId);
  const total = parseFloat(f.totalBruto) || 0;
  const n     = parseInt(f.numeroParcelas) || 1;
  const taxa  = parseFloat(f.taxaJuros) || 0;

  const { totalComJuros, valorBase } = useMemo(
    () => total > 0 ? calcParcelas(total, n, taxa) : { totalComJuros: 0, valorBase: 0 },
    [total, n, taxa],
  );

  const custoUnit = total > 0 && parseInt(f.qtd) > 0
    ? (total / parseInt(f.qtd)).toFixed(2) : '';

  function dataPrimeiraParcela() {
    const hoje = new Date();
    const dia  = meio?.diaVencimento || 10;
    const mes  = hoje.getDate() < dia ? hoje.getMonth() : hoje.getMonth() + 1;
    return new Date(hoje.getFullYear(), mes, dia);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    if (!f.fornecedor.trim()) { setErro('Informe o fornecedor'); return; }
    if (!total || total <= 0) { setErro('Valor total inválido'); return; }
    if (!f.meioId)            { setErro('Selecione o meio de pagamento'); return; }

    const result = await lancarCompra({
      fornecedor:       f.fornecedor.trim(),
      descricao:        f.descricao.trim(),
      totalBruto:       total,
      numeroParcelas:   f.avista ? 1 : n,
      taxaJuros:        f.avista ? 0 : taxa,
      meioId:           meio.id,
      meioNome:         meio.nome,
      meioBandeira:     meio.bandeira,
      diaVencimento:    meio.diaVencimento || 10,
      dataPrimeiraParcela: dataPrimeiraParcela(),
      sku:              f.sku.trim(),
      qtd:              parseInt(f.qtd) || 0,
      custoUnitario:    parseFloat(custoUnit) || 0,
    });

    if (result.ok) {
      setOk(true);
      setF(EMPTY);
      setTimeout(() => { setOk(false); onSucesso?.(); }, 1500);
    } else {
      setErro(result.error || 'Erro ao lançar compra');
    }
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
        <div>
          <p className={lbl}>Fornecedor *</p>
          <input className={inp} placeholder="Ex: Distribuidora SP" required
            value={f.fornecedor} onChange={e => setF(p => ({ ...p, fornecedor: e.target.value }))} />
        </div>
        <div>
          <p className={lbl}>Descrição / Produto</p>
          <input className={inp} placeholder="Ex: Pelúcias 100un"
            value={f.descricao} onChange={e => setF(p => ({ ...p, descricao: e.target.value }))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className={lbl}>Valor Total R$ *</p>
          <input className={inp} type="number" min="0.01" step="0.01" placeholder="0,00" required
            value={f.totalBruto} onChange={e => setF(p => ({ ...p, totalBruto: e.target.value }))} />
        </div>
        <div>
          <p className={lbl}>Meio de Pagamento *</p>
          <select className={inp} required value={f.meioId}
            onChange={e => setF(p => ({ ...p, meioId: e.target.value }))}>
            <option value="">Selecionar…</option>
            {meios.map(m => (
              <option key={m.id} value={m.id}>
                {m.nome}{m.final ? ` (${m.final})` : ''} — {m.bandeira}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* À vista vs parcelado */}
      <div className="bg-slate-900 border border-white/[0.05] rounded-2xl p-4 space-y-4">
        <div className="flex gap-2">
          {[
            { v: true,  label: 'À Vista / Pix / Boleto' },
            { v: false, label: 'Parcelado no Cartão'    },
          ].map(o => (
            <button type="button" key={String(o.v)}
              onClick={() => setF(p => ({ ...p, avista: o.v, numeroParcelas: o.v ? '1' : p.numeroParcelas }))}
              className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${
                f.avista === o.v
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : 'border-white/[0.05] text-slate-600 hover:text-slate-400'
              }`}>
              {o.label}
            </button>
          ))}
        </div>

        {!f.avista && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className={lbl}>Nº de parcelas</p>
              <select className={inp} value={f.numeroParcelas}
                onChange={e => setF(p => ({ ...p, numeroParcelas: e.target.value }))}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}x</option>
                ))}
              </select>
            </div>
            <div>
              <p className={lbl}>Taxa de juros % a.m.</p>
              <input className={inp} type="number" min="0" step="0.01" placeholder="0.00 (sem juros)"
                value={f.taxaJuros} onChange={e => setF(p => ({ ...p, taxaJuros: e.target.value }))} />
            </div>
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
              <span className="text-white font-black font-mono tabular-nums">
                {f.avista ? brl(total) : brl(valorBase)}
              </span>
            </div>
            {meio && !f.avista && (
              <p className="text-[10px] text-slate-600">
                1ª parcela: {dataPrimeiraParcela().toLocaleDateString('pt-BR')} · vence dia {meio.diaVencimento} de cada mês
              </p>
            )}
          </div>
        )}
      </div>

      {/* Integração Margem (opcional) */}
      <div className="bg-slate-900 border border-white/[0.05] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-blue-400">
          <BarChart2 size={12} />
          <span className="font-bold uppercase tracking-wider">Opcional: Integração com Margem</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className={lbl}>SKU do produto</p>
            <input className={inp} placeholder="Ex: BUBA-01"
              value={f.sku} onChange={e => setF(p => ({ ...p, sku: e.target.value }))} />
          </div>
          <div>
            <p className={lbl}>Quantidade</p>
            <input className={inp} type="number" min="1" placeholder="0"
              value={f.qtd} onChange={e => setF(p => ({ ...p, qtd: e.target.value }))} />
          </div>
          <div>
            <p className={lbl}>Custo unitário</p>
            <div className={`${inp} flex items-center text-emerald-400 font-mono cursor-not-allowed`}>
              {custoUnit ? `R$ ${custoUnit}` : <span className="text-slate-700">automático</span>}
            </div>
          </div>
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
          : ok   ? <><CheckCircle2 size={16} /> Lançado!</>
          :         <><Banknote size={16} /> Lançar Compra</>}
      </button>
    </form>
  );
}
