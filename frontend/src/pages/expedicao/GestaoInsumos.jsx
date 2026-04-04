import React, { useState, useEffect } from 'react';
import { Package, Plus, Hash, DollarSign, X, AlertTriangle, Tag, Calculator, Loader2, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import { useInsumos } from '../../hooks/useInsumos';

export default function GestaoInsumos() {
  const [insumos, setInsumos] = useState([]);
  const { getInsumos, addInsumo, updateInsumo, deleteInsumo, loading } = useInsumos();

  // Estados para o Modal Principal (Criar / Editar)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [insumoEmEdicao, setInsumoEmEdicao] = useState(null);
  
  // Estados para a Reposição
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [insumoSelecionado, setInsumoSelecionado] = useState(null);
  const [restockData, setRestockData] = useState({ quantidade_comprada: '', valor_pago: '' });

  // Estado do Formulário
  const estadoInicialForm = {
    nome: '', categoria: 'Embalagem', unidade_medida_uso: 'Unidade (un)',
    estoque_atual: '', estoque_minimo: '', formato_aquisicao: 'Rolo',
    quantidade_por_formato: '', custo_aquisicao: ''
  };
  const [formData, setFormData] = useState(estadoInicialForm);

  useEffect(() => { carregarDados(); }, []);

  const carregarDados = async () => {
    const dados = await getInsumos();
    setInsumos(dados);
  };

  const calcularCustoUnitario = () => {
    const custo = parseFloat(formData.custo_aquisicao);
    const qtd = parseInt(formData.quantidade_por_formato);
    return (!isNaN(custo) && !isNaN(qtd) && qtd > 0) ? (custo / qtd) : 0;
  };

  // ABRIR MODAIS
  const abrirModalNovo = () => {
    setModoEdicao(false);
    setInsumoEmEdicao(null);
    setFormData(estadoInicialForm);
    setIsModalOpen(true);
  };

  const abrirModalEdicao = (insumo) => {
    setModoEdicao(true);
    setInsumoEmEdicao(insumo.id);
    setFormData({
      nome: insumo.nome, categoria: insumo.categoria, unidade_medida_uso: insumo.unidade_medida_uso,
      estoque_atual: insumo.estoque_atual, estoque_minimo: insumo.estoque_minimo, 
      formato_aquisicao: insumo.formato_aquisicao, quantidade_por_formato: insumo.quantidade_por_formato, 
      custo_aquisicao: insumo.custo_aquisicao
    });
    setIsModalOpen(true);
  };

  // SALVAR (CRIAR ou ATUALIZAR)
  const handleSalvar = async () => {
    if (!formData.nome) return alert("Preencha o nome!");
    
    const dadosParaSalvar = {
      ...formData,
      estoque_atual: parseInt(formData.estoque_atual) || 0,
      estoque_minimo: parseInt(formData.estoque_minimo) || 0,
      quantidade_por_formato: parseInt(formData.quantidade_por_formato) || 1,
      custo_aquisicao: parseFloat(formData.custo_aquisicao) || 0,
      custo_unitario_calculado: calcularCustoUnitario()
    };

    if (modoEdicao) {
      await updateInsumo(insumoEmEdicao, dadosParaSalvar);
    } else {
      await addInsumo(dadosParaSalvar);
    }

    await carregarDados();
    setIsModalOpen(false);
  };

  // EXCLUIR
  const handleExcluir = async (id) => {
    // Alerta de confirmação nativo do navegador
    if (window.confirm("Tem certeza que deseja apagar este insumo? Isso não pode ser desfeito.")) {
      await deleteInsumo(id);
      await carregarDados();
    }
  };

  // REPOSIÇÃO
  const handleRestock = async () => {
    if (!restockData.quantidade_comprada || !restockData.valor_pago) return alert("Preencha os dados.");
    const novoEstoque = insumoSelecionado.estoque_atual + parseInt(restockData.quantidade_comprada);
    const novoCustoAquisicao = parseFloat(restockData.valor_pago);
    const novoCustoUnitario = novoCustoAquisicao / insumoSelecionado.quantidade_por_formato;

    await updateInsumo(insumoSelecionado.id, {
      estoque_atual: novoEstoque, custo_aquisicao: novoCustoAquisicao, custo_unitario_calculado: novoCustoUnitario
    });
    await carregarDados();
    setIsRestockModalOpen(false);
    setRestockData({ quantidade_comprada: '', valor_pago: '' });
  };

  const custoUnitarioExibicao = calcularCustoUnitario();

  return (
    <div className="p-6 max-w-7xl mx-auto flex-1 overflow-y-auto">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Package className="text-emerald-400" /> Gestão de Insumos</h1>
          <p className="text-slate-400 mt-1">Controle real de custos para Kits de Embalagem.</p>
        </div>
        <button onClick={abrirModalNovo} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded font-medium flex items-center gap-2">
          <Plus size={20} /> Novo Insumo
        </button>
      </div>

      {/* LISTA DE CARDS */}
      {loading && insumos.length === 0 ? (
        <div className="text-emerald-400 flex items-center gap-2"><Loader2 className="animate-spin" /> Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {insumos.map((insumo) => {
            const isCritico = insumo.estoque_atual <= insumo.estoque_minimo;
            
            return (
              <div key={insumo.id} className="bg-slate-800/50 border border-slate-700 p-5 rounded-xl hover:border-emerald-500/50 transition-colors flex flex-col justify-between group">
                <div>
                  <div className="flex justify-between mb-4">
                    <div className={`p-2 rounded-lg ${isCritico ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {isCritico ? <AlertTriangle size={24} /> : <Tag size={24} />}
                    </div>
                    {/* AÇÕES: Editar e Excluir (Aparecem suaves no canto direito) */}
                    <div className="flex gap-2">
                      <button onClick={() => abrirModalEdicao(insumo)} className="p-1.5 text-slate-400 hover:text-emerald-400 bg-slate-800 rounded transition-colors" title="Editar">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => handleExcluir(insumo.id)} className="p-1.5 text-slate-400 hover:text-red-400 bg-slate-800 rounded transition-colors" title="Excluir">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 bg-slate-700 text-slate-300 rounded-full h-fit mb-2 inline-block">{insumo.categoria}</span>
                  <h3 className="text-white font-semibold text-lg leading-tight mb-4">{insumo.nome}</h3>
                  <div className="space-y-2 border-t border-slate-700/50 pt-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400 flex items-center gap-1"><Hash size={14}/> Estoque:</span>
                      <span className={`font-medium ${isCritico ? 'text-red-400' : 'text-white'}`}>{insumo.estoque_atual}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400 flex items-center gap-1"><DollarSign size={14}/> Custo Un.:</span>
                      <span className="text-emerald-400 font-medium">R$ {insumo.custo_unitario_calculado?.toFixed(4).replace('.', ',')}</span>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => { setInsumoSelecionado(insumo); setIsRestockModalOpen(true); }}
                  className="w-full mt-5 bg-slate-700/50 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 border border-slate-600 hover:border-emerald-500/50 py-2 rounded-lg flex items-center justify-center gap-2 transition-all text-sm font-medium"
                >
                  <RefreshCw size={16} /> Dar Entrada (Repor)
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL PRINCIPAL (CRIAR E EDITAR) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
              <h2 className="text-xl font-bold text-white">
                {modoEdicao ? 'Editar Insumo' : 'Cadastrar Insumo'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white"><X size={24} /></button>
            </div>

            {/* O Formulário é exatamente o mesmo! */}
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm text-slate-400 mb-1">Nome do Insumo</label>
                  <input type="text" value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Categoria</label>
                  <select value={formData.categoria} onChange={(e) => setFormData({...formData, categoria: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500">
                    <option>Embalagem</option><option>Rotulagem (Etiquetas)</option><option>Fechamento (Fitas)</option><option>Avisos/Lacres</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Unidade de Medida (Uso)</label>
                  <select value={formData.unidade_medida_uso} onChange={(e) => setFormData({...formData, unidade_medida_uso: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500">
                    <option>Unidade (un)</option><option>Centímetros (cm)</option><option>Metros (m)</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
                <h3 className="text-emerald-400 text-sm font-semibold mb-3 flex items-center gap-2"><Hash size={16}/> Controle de Estoque</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Estoque Atual</label>
                    <input type="number" value={formData.estoque_atual} onChange={(e) => setFormData({...formData, estoque_atual: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Estoque Mínimo</label>
                    <input type="number" value={formData.estoque_minimo} onChange={(e) => setFormData({...formData, estoque_minimo: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500" />
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
                <h3 className="text-emerald-400 text-sm font-semibold mb-3 flex items-center gap-2"><Calculator size={16}/> Engenharia de Custos</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Formato Compra</label>
                    <select value={formData.formato_aquisicao} onChange={(e) => setFormData({...formData, formato_aquisicao: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500">
                      <option>Rolo</option><option>Fardo/Pacote</option><option>Bobina</option><option>Unidade</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Qtd por Formato</label>
                    <input type="number" value={formData.quantidade_por_formato} onChange={(e) => setFormData({...formData, quantidade_por_formato: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Valor Pago (R$)</label>
                    <input type="number" step="0.01" value={formData.custo_aquisicao} onChange={(e) => setFormData({...formData, custo_aquisicao: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500" />
                  </div>
                </div>
                <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex justify-between items-center">
                  <span className="text-slate-300 text-sm">Custo Unitário Calculado:</span>
                  <span className="text-emerald-400 font-bold text-lg">R$ {custoUnitarioExibicao.toFixed(4).replace('.', ',')}</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-800">
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancelar</button>
                <button onClick={handleSalvar} disabled={loading} className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium">
                  {loading ? 'Salvando...' : (modoEdicao ? 'Salvar Alterações' : 'Salvar Insumo')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE REPOSIÇÃO */}
      {isRestockModalOpen && insumoSelecionado && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
         <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl w-full max-w-md shadow-2xl">
           <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
             <h2 className="text-xl font-bold text-white flex items-center gap-2"><RefreshCw className="text-emerald-400" /> Reposição</h2>
             <button onClick={() => setIsRestockModalOpen(false)} className="text-slate-400 hover:text-white"><X size={24} /></button>
           </div>
           <div className="mb-6 bg-slate-800/50 p-4 rounded-lg">
             <p className="text-sm text-slate-400 mb-1">Insumo:</p>
             <p className="text-lg font-semibold text-white">{insumoSelecionado.nome}</p>
           </div>
           <div className="space-y-4">
             <div>
               <label className="block text-sm text-slate-400 mb-1">Qtd Comprada ({insumoSelecionado.unidade_medida_uso})</label>
               <input type="number" value={restockData.quantidade_comprada} onChange={(e) => setRestockData({...restockData, quantidade_comprada: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500" />
             </div>
             <div>
               <label className="block text-sm text-slate-400 mb-1">Valor Pago (R$)</label>
               <input type="number" step="0.01" value={restockData.valor_pago} onChange={(e) => setRestockData({...restockData, valor_pago: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500" />
             </div>
             <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
               <button onClick={() => setIsRestockModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancelar</button>
               <button onClick={handleRestock} disabled={loading} className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium">
                 {loading ? 'Processando...' : 'Confirmar Entrada'}
               </button>
             </div>
           </div>
         </div>
       </div>
      )}
    </div>
  );
}