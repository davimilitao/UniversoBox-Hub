import React, { useState } from 'react';
import { useMeiosPagamento } from '../../../hooks/useMeiosPagamento';
import { CreditCard, Plus, User, Calendar, ShieldCheck } from 'lucide-react';

export default function MeiosPagamento() {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <CreditCard className="text-emerald-500" /> Meios de Pagamento
        </h2>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all"
        >
          <Plus size={18} /> Novo Cartão/Conta
        </button>
      </div>

      {/* FORMULÁRIO DE CADASTRO */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-slate-900 border border-white/5 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
          <div className="col-span-1 md:col-span-3 pb-2 border-b border-white/5 flex items-center gap-2 text-emerald-400 text-sm">
             <ShieldCheck size={16} /> <span>Ambiente Seguro: Não salvamos números completos nem CVV.</span>
          </div>
          
          <input required placeholder="Apelido (Ex: Nubank Empresa)" className="bg-slate-800 text-white p-3 rounded-xl border-none outline-none focus:ring-1 focus:ring-emerald-500"
            value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} />
            
          <input required placeholder="Final do Cartão (Ex: 1234)" maxLength="4" className="bg-slate-800 text-white p-3 rounded-xl border-none outline-none focus:ring-1 focus:ring-emerald-500"
            value={form.final} onChange={e => setForm({...form, final: e.target.value.replace(/\D/g, '')})} />

          <select className="bg-slate-800 text-white p-3 rounded-xl border-none outline-none"
            value={form.bandeira} onChange={e => setForm({...form, bandeira: e.target.value})}>
            <option value="Mastercard">Mastercard</option>
            <option value="Visa">Visa</option>
            <option value="Elo">Elo</option>
            <option value="Pix">Conta Pix / Saldo</option>
          </select>

          <input required placeholder="Responsável pelo Cartão" className="bg-slate-800 text-white p-3 rounded-xl border-none outline-none"
            value={form.responsavel} onChange={e => setForm({...form, responsavel: e.target.value})} />

          <input required type="number" placeholder="Limite Total (R$)" className="bg-slate-800 text-white p-3 rounded-xl border-none outline-none"
            value={form.limiteTotal} onChange={e => setForm({...form, limiteTotal: e.target.value})} />

          <div className="flex gap-2">
            <input required type="number" placeholder="Dia Fechamento" min="1" max="31" className="w-1/2 bg-slate-800 text-white p-3 rounded-xl border-none outline-none"
              value={form.diaFechamento} onChange={e => setForm({...form, diaFechamento: e.target.value})} />
            <input required type="number" placeholder="Dia Vencimento" min="1" max="31" className="w-1/2 bg-slate-800 text-white p-3 rounded-xl border-none outline-none"
              value={form.diaVencimento} onChange={e => setForm({...form, diaVencimento: e.target.value})} />
          </div>

          <div className="col-span-1 md:col-span-3 flex justify-end mt-2">
             <button type="submit" className="bg-emerald-500 text-slate-950 px-6 py-2 rounded-xl font-bold">Salvar Cartão</button>
          </div>
        </form>
      )}

      {/* LISTA DE CARTÕES CADASTRADOS */}
      {loading ? (
        <p className="text-slate-400">Carregando meios de pagamento...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {meios.map(meio => (
            <div key={meio.id} className="bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 p-5 rounded-2xl relative overflow-hidden group">
              {/* Decorativo de Cartão */}
              <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
              
              <div className="flex justify-between items-start mb-6 relative">
                <div>
                  <h3 className="text-lg font-bold text-white">{meio.nome}</h3>
                  <p className="text-xs text-slate-400 uppercase tracking-widest">{meio.bandeira}</p>
                </div>
                <CreditCard className="text-slate-500" />
              </div>

              <div className="text-2xl font-mono tracking-widest text-white mb-6">
                **** **** **** {meio.final}
              </div>

              <div className="flex justify-between items-end text-xs text-slate-400">
                <div className="space-y-1">
                  <div className="flex items-center gap-1"><User size={12}/> {meio.responsavel}</div>
                  <div className="flex items-center gap-1"><Calendar size={12}/> Vence dia {meio.diaVencimento}</div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase">Limite Disponível</p>
                  <p className="text-lg font-bold text-emerald-400">
                    R$ {(meio.limiteDisponivel || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}