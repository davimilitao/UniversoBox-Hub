import React, { useState, useMemo } from 'react';
import { useMeiosPagamento } from '../../../hooks/useMeiosPagamento';
import { CreditCard, Plus, User, Calendar, ShieldCheck, Banknote, Sparkles, Activity } from 'lucide-react';

export default function MeiosPagamento({ parcelas = [] }) {
  const { meios, loading, adicionarMeio } = useMeiosPagamento();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nome: '', // Ex: Cartão Nubank Empresa
    final: '', // Apenas 4 dígitos
    bandeira: 'Mastercard',
    responsavel: '', // Davi, Sócio, etc.
    limiteTotal: '',
    diaFechamento: '',
    diaVencimento: ''
  });

  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function brl(v) { return BRL.format(v || 0); }

  const handleSave = async (e) => {
    e.preventDefault();
    const res = await adicionarMeio({
      ...form,
      limiteTotal: parseFloat(form.limiteTotal),
      final: form.final.slice(-4) // Força pegar só os últimos 4
    });
    
    if (res.success) {
      setShowForm(false);
      setForm({ nome: '', final: '', bandeira: 'Mastercard', responsavel: '', limiteTotal: '', diaFechamento: '', diaVencimento: '' });
    }
  };

  // Calcula totais dinâmicos para cada meio de pagamento
  const meiosComTotais = useMemo(() => {
    return meios.map(meio => {
      const parcelasDoMeio = parcelas.filter(p => p.meioId === meio.id);
      
      const dividaAberta = parcelasDoMeio
        .filter(p => p.status === 'pendente')
        .reduce((sum, p) => sum + (p.valor || 0), 0);
        
      const totalPago = parcelasDoMeio
        .filter(p => p.status === 'pago')
        .reduce((sum, p) => sum + (p.valor || 0), 0);
        
      const limiteTotal = Number(meio.limiteTotal || 0);
      const limiteDisponivel = Math.max(0, limiteTotal - dividaAberta);
      
      return {
        ...meio,
        dividaAberta,
        totalPago,
        limiteDisponivel
      };
    });
  }, [meios, parcelas]);

  // Divide os meios em trilhas (Daniel, Davi, Outros)
  const { trilhaDaniel, trilhaDavi, trilhaOutros } = useMemo(() => {
    const daniel = [];
    const davi = [];
    const outros = [];
    
    meiosComTotais.forEach(m => {
      const resp = String(m.responsavel || '').toLowerCase();
      if (resp.includes('daniel')) {
        daniel.push(m);
      } else if (resp.includes('davi')) {
        davi.push(m);
      } else {
        outros.push(m);
      }
    });
    
    return { trilhaDaniel: daniel, trilhaDavi: davi, trilhaOutros: outros };
  }, [meiosComTotais]);

  const getTrackTotals = (trackList) => {
    const divida = trackList.reduce((sum, m) => sum + m.dividaAberta, 0);
    const pago = trackList.reduce((sum, m) => sum + m.totalPago, 0);
    return { divida, pago };
  };

  const totalsDaniel = getTrackTotals(trilhaDaniel);
  const totalsDavi = getTrackTotals(trilhaDavi);
  const totalsOutros = getTrackTotals(trilhaOutros);

  function renderCard(meio) {
    const pct = meio.limiteTotal > 0 ? Math.min(100, (meio.dividaAberta / meio.limiteTotal) * 100) : 0;
    const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-emerald-500';
    
    return (
      <div key={meio.id} className="bg-slate-900/90 border border-white/5 p-4 rounded-xl relative overflow-hidden group hover:border-emerald-500/20 transition-all">
        {/* Decorativo de Cartão no Hover */}
        <div className="absolute -right-10 -top-10 w-24 h-24 bg-white/5 rounded-full blur-xl group-hover:bg-emerald-500/5 transition-all duration-300"></div>
        
        {/* Linha 1: Nome do cartão e final */}
        <div className="flex justify-between items-start mb-2 relative">
          <div>
            <h4 className="text-sm font-bold text-white leading-tight group-hover:text-emerald-400 transition-colors">{meio.nome}</h4>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">
              {meio.bandeira} {meio.final ? `•••• ${meio.final}` : ''}
            </p>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 border border-white/5 text-slate-400">
            venc. {meio.diaVencimento}
          </span>
        </div>

        {/* Linha 2: Barra de Progresso do Limite (Apenas se limiteTotal > 0) */}
        {meio.limiteTotal > 0 ? (
          <div className="mt-3 mb-3">
            <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-mono">
              <span>Uso do Limite</span>
              <span>{pct.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }}></div>
            </div>
          </div>
        ) : (
          <div className="my-2 border-t border-white/5"></div>
        )}

        {/* Linha 3: Valores Financeiros */}
        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs pt-1 border-t border-white/[0.03]">
          <div>
            <p className="text-[9px] uppercase tracking-wider text-slate-600 font-bold">Dívida Aberta</p>
            <p className="font-bold text-red-400 font-mono mt-0.5">{brl(meio.dividaAberta)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-wider text-slate-600 font-bold">Total Pago</p>
            <p className="font-bold text-emerald-400 font-mono mt-0.5">{brl(meio.totalPago)}</p>
          </div>
          <div className="col-span-2 flex justify-between items-center text-[10px] text-slate-400 font-mono border-t border-white/[0.03] pt-1.5 mt-0.5">
            <span>Disponível:</span>
            <span className="font-bold text-slate-200">
              {meio.limiteTotal > 0 ? `${brl(meio.limiteDisponivel)} / ${brl(meio.limiteTotal)}` : 'Saldo Ilimitado'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  function renderTrackHeader(titulo, totalizadores, cor = 'emerald') {
    const clr = {
      emerald: 'border-emerald-500/20 text-emerald-400',
      blue:    'border-blue-500/20 text-blue-400',
      slate:   'border-white/10 text-slate-400'
    }[cor];

    return (
      <div className={`flex items-center justify-between px-4 py-2.5 bg-slate-900/60 border-l-2 rounded-r-xl ${clr} mb-4`}>
        <div className="flex items-center gap-2">
          <Activity size={14} />
          <h3 className="text-xs font-black uppercase tracking-wider text-white">{titulo}</h3>
        </div>
        <div className="flex gap-4 text-[10px] font-mono">
          <div>
            <span className="text-slate-600 font-bold">ABERTO: </span>
            <span className="text-red-400 font-bold">{brl(totalizadores.divida)}</span>
          </div>
          <div>
            <span className="text-slate-600 font-bold">PAGO: </span>
            <span className="text-emerald-400 font-bold">{brl(totalizadores.pago)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <CreditCard className="text-emerald-500" /> Meios de Pagamento & Trilhas
        </h2>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all text-sm"
        >
          <Plus size={16} /> Novo Cartão/Conta
        </button>
      </div>

      {/* FORMULÁRIO DE CADASTRO */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-slate-900 border border-white/5 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
          <div className="col-span-1 md:col-span-3 pb-2 border-b border-white/5 flex items-center gap-2 text-emerald-400 text-xs">
             <ShieldCheck size={14} /> <span>Ambiente Seguro: Não salvamos números completos nem CVV.</span>
          </div>
          
          <input required placeholder="Apelido (Ex: Nubank Empresa)" className="bg-slate-800 text-white p-3 rounded-xl border-none outline-none focus:ring-1 focus:ring-emerald-500 text-sm"
            value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} />
            
          <input required placeholder="Final do Cartão (Ex: 1234)" maxLength="4" className="bg-slate-800 text-white p-3 rounded-xl border-none outline-none focus:ring-1 focus:ring-emerald-500 text-sm"
            value={form.final} onChange={e => setForm({...form, final: e.target.value.replace(/\D/g, '')})} />

          <select className="bg-slate-800 text-white p-3 rounded-xl border-none outline-none text-sm"
            value={form.bandeira} onChange={e => setForm({...form, bandeira: e.target.value})}>
            <option value="Mastercard">Mastercard</option>
            <option value="Visa">Visa</option>
            <option value="Elo">Elo</option>
            <option value="Pix">Conta Pix / Saldo</option>
          </select>

          <input required placeholder="Responsável pelo Cartão" className="bg-slate-800 text-white p-3 rounded-xl border-none outline-none text-sm"
            value={form.responsavel} onChange={e => setForm({...form, responsavel: e.target.value})} />

          <input required type="number" placeholder="Limite Total (R$)" className="bg-slate-800 text-white p-3 rounded-xl border-none outline-none text-sm"
            value={form.limiteTotal} onChange={e => setForm({...form, limiteTotal: e.target.value})} />

          <div className="flex gap-2">
            <input required type="number" placeholder="Dia Fechamento" min="1" max="31" className="w-1/2 bg-slate-800 text-white p-3 rounded-xl border-none outline-none text-sm"
              value={form.diaFechamento} onChange={e => setForm({...form, diaFechamento: e.target.value})} />
            <input required type="number" placeholder="Dia Vencimento" min="1" max="31" className="w-1/2 bg-slate-800 text-white p-3 rounded-xl border-none outline-none text-sm"
              value={form.diaVencimento} onChange={e => setForm({...form, diaVencimento: e.target.value})} />
          </div>

          <div className="col-span-1 md:col-span-3 flex justify-end mt-2">
             <button type="submit" className="bg-emerald-500 text-slate-950 px-6 py-2 rounded-xl font-bold text-sm">Salvar Cartão</button>
          </div>
        </form>
      )}

      {/* LISTA DE CARTÕES ORGANIZADA POR TRILHAS */}
      {loading ? (
        <p className="text-slate-400 text-sm">Carregando meios de pagamento...</p>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* TRILHA DANIEL */}
            <div className="bg-slate-950/40 border border-white/[0.03] p-5 rounded-2xl">
              {renderTrackHeader("Trilha Daniel", totalsDaniel, "blue")}
              {trilhaDaniel.length === 0 ? (
                <p className="text-slate-600 text-xs py-4 text-center">Nenhum meio de pagamento cadastrado nesta trilha.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {trilhaDaniel.map(renderCard)}
                </div>
              )}
            </div>

            {/* TRILHA DAVI */}
            <div className="bg-slate-950/40 border border-white/[0.03] p-5 rounded-2xl">
              {renderTrackHeader("Trilha Davi", totalsDavi, "emerald")}
              {trilhaDavi.length === 0 ? (
                <p className="text-slate-600 text-xs py-4 text-center">Nenhum meio de pagamento cadastrado nesta trilha.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {trilhaDavi.map(renderCard)}
                </div>
              )}
            </div>
          </div>

          {/* TRILHA OUTROS */}
          {trilhaOutros.length > 0 && (
            <div className="bg-slate-950/40 border border-white/[0.03] p-5 rounded-2xl">
              {renderTrackHeader("Trilha Geral & Outros", totalsOutros, "slate")}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {trilhaOutros.map(renderCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}