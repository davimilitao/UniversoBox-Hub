import React, { useState, useEffect } from 'react';
import { Barcode, UploadCloud, Wand2, CheckCircle2, Search, Zap, Image as ImageIcon, Loader2, Box, Scale, Layers, Fingerprint, PackagePlus, Trash2 } from 'lucide-react';
import { useInsumos } from '../../hooks/useInsumos'; 

export default function AutomacaoCadastro() {
  const [ean, setEan] = useState('');
  const [modoAutomatico, setModoAutomatico] = useState(false); 
  const [status, setStatus] = useState('idle'); 

  const { getInsumos } = useInsumos();
  const [insumosLista, setInsumosLista] = useState([]);
  const [insumoSelecionadoId, setInsumoSelecionadoId] = useState('');
  const [kitEmbalagem, setKitEmbalagem] = useState([]);

  useEffect(() => {
    async function carregarInsumos() {
      const dados = await getInsumos();
      setInsumosLista(dados);
    }
    carregarInsumos();
  }, [getInsumos]);

  const handleAddInsumoAoKit = () => {
    if (!insumoSelecionadoId) return;
    const insumo = insumosLista.find(i => i.id === insumoSelecionadoId);
    
    if (insumo) {
      const existe = kitEmbalagem.find(k => k.id === insumo.id);
      if (existe) {
        setKitEmbalagem(kitEmbalagem.map(k => k.id === insumo.id ? { ...k, quantidade_uso: k.quantidade_uso + 1 } : k));
      } else {
        setKitEmbalagem([...kitEmbalagem, { ...insumo, quantidade_uso: 1 }]);
      }
    }
    setInsumoSelecionadoId(''); 
  };

  const handleRemoveInsumoDoKit = (id) => {
    setKitEmbalagem(kitEmbalagem.filter(k => k.id !== id));
  };

  const custoTotalKit = kitEmbalagem.reduce((acc, curr) => acc + ((curr.custo_unitario_calculado || 0) * curr.quantidade_uso), 0);

  const mockDadosGerados = {
    nome: "Espelho 2 em 1 Safety 1st Black para Banco Traseiro",
    sku_gerado: "BEBACEESP2M1", 
    descricao: "Desenvolvido para garantir a segurança do seu bebê durante os passeios de carro...",
    idCategoriaBling: "11121", 
    peso_bruto: "0.450", peso_liquido: "0.300",
    dimensoes: { largura: "25", altura: "5", profundidade: "30" },
    imagens: [
      "https://via.placeholder.com/300/1e293b/10b981?text=Espelho+Tratado+1",
      "https://via.placeholder.com/300/1e293b/10b981?text=Espelho+Detalhe+2",
      "https://via.placeholder.com/300/1e293b/10b981?text=Caixa+Produto+3",
      "https://via.placeholder.com/300/1e293b/10b981?text=Uso+no+Carro+4",
      "https://via.placeholder.com/300/1e293b/10b981?text=Manual+5"
    ]
  };

  const categoriasBling = [
    { id: "12345", nome: "Calçados Esportivos > Tênis" },
    { id: "67890", nome: "Eletrônicos > Acessórios" },
    { id: "11121", nome: "Bebês > Acessórios de Segurança" }
  ];

  const handleProcessar = () => {
    if (!ean) return alert("Digite um EAN válido.");
    setStatus('processing');
    setTimeout(() => { setStatus(modoAutomatico ? 'success' : 'review'); }, 2500);
  };

  const handleConfirmarBling = () => {
    setStatus('processing');
    setTimeout(() => setStatus('success'), 1500);
  };

  const resetar = () => {
    setEan('');
    setKitEmbalagem([]);
    setStatus('idle');
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wand2 className="text-emerald-400" /> Automação de Catálogo
          </h1>
          <p className="text-slate-400 mt-1">Busca de EAN, SKU Semântico e Custeio Logístico.</p>
        </div>

        <div className="bg-slate-800 p-1.5 rounded-xl border border-slate-700 flex items-center gap-2">
          <button onClick={() => setModoAutomatico(false)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!modoAutomatico ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
            Modo Revisão
          </button>
          <button onClick={() => setModoAutomatico(true)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${modoAutomatico ? 'bg-emerald-500/20 text-emerald-400 shadow border border-emerald-500/30' : 'text-slate-400 hover:text-white'}`}>
            <Zap size={16} /> Modo Turbo
          </button>
        </div>
      </div>

      {status === 'idle' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in zoom-in duration-300">
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl flex flex-col justify-center">
            <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <Barcode size={18} className="text-emerald-400" /> Código EAN / GTIN
            </label>
            <input 
              type="text" value={ean} onChange={(e) => setEan(e.target.value)} placeholder="Ex: 7891234567890" 
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white text-lg focus:border-emerald-500"
            />
          </div>

          <div className="bg-slate-800/50 border border-slate-700 border-dashed p-6 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-800 transition-colors">
            <div className="p-4 bg-slate-900 rounded-full mb-4">
              <UploadCloud className="text-slate-400" size={32} />
            </div>
            <h3 className="text-white font-medium">Foto Base (Opcional)</h3>
          </div>

          <div className="md:col-span-2">
            <button onClick={handleProcessar} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/20 text-lg transition-all active:scale-95">
              <Search size={24} /> Consultar Ficha Técnica
            </button>
          </div>
        </div>
      )}

      {status === 'processing' && (
        <div className="py-20 flex flex-col items-center justify-center">
          <Loader2 className="animate-spin text-emerald-500 mb-4" size={48} />
          <h2 className="text-xl font-bold text-white mb-2">Processando Automação...</h2>
          <p className="text-slate-400">Extraindo dados, gerando SKU e tratando imagens.</p>
        </div>
      )}

      {status === 'review' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500">
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl">
            
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="text-emerald-400" /> Revisão de Cadastro (Bling)
              </h2>
              <span className="bg-slate-900 text-slate-300 px-3 py-1 rounded-full text-sm border border-slate-700">EAN: {ean}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              <div className="lg:col-span-7 space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm text-slate-400 mb-1">Nome do Produto</label>
                    <input type="text" defaultValue={mockDadosGerados.nome} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1 flex items-center gap-2">
                      <Fingerprint size={14} className="text-emerald-400"/> SKU Base
                    </label>
                    <div className="relative">
                      <input type="text" defaultValue={mockDadosGerados.sku_gerado} className="w-full bg-slate-900 border border-emerald-500/50 rounded-lg pl-4 pr-8 py-2 text-emerald-400 font-bold uppercase" />
                      <Wand2 size={14} className="text-emerald-500/50 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm text-slate-400 mb-1 flex items-center gap-2">
                    <Layers size={14} className="text-emerald-400"/> Categoria (Sugestão IA)
                  </label>
                  <select defaultValue={mockDadosGerados.idCategoriaBling} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    {categoriasBling.map(cat => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                    <label className="text-sm font-medium text-emerald-400 mb-3 flex items-center gap-2"><Scale size={16}/> Pesos (kg)</label>
                    <div className="space-y-3">
                      <div>
                        <span className="text-xs text-slate-400 block mb-1">Bruto (com embalagem)</span>
                        <input type="number" step="0.001" defaultValue={mockDadosGerados.peso_bruto} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white text-sm" />
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block mb-1">Líquido (só o produto)</span>
                        <input type="number" step="0.001" defaultValue={mockDadosGerados.peso_liquido} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-white text-sm" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                    <label className="text-sm font-medium text-emerald-400 mb-3 flex items-center gap-2"><Box size={16}/> Dimensões (cm)</label>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="w-1/3 min-w-0"><span className="text-xs text-slate-400 block mb-1">Larg.</span><input type="number" defaultValue={mockDadosGerados.dimensoes.largura} className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white text-sm" /></div>
                        <div className="w-1/3 min-w-0"><span className="text-xs text-slate-400 block mb-1">Alt.</span><input type="number" defaultValue={mockDadosGerados.dimensoes.altura} className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white text-sm" /></div>
                        <div className="w-1/3 min-w-0"><span className="text-xs text-slate-400 block mb-1">Prof.</span><input type="number" defaultValue={mockDadosGerados.dimensoes.profundidade} className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white text-sm" /></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-700">
                  <div className="flex justify-between items-center mb-4">
                    <label className="font-medium text-white flex items-center gap-2">
                      <PackagePlus size={18} className="text-emerald-400"/> Compor Kit de Embalagem
                    </label>
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Custo de Expedição:</span>
                      <span className="text-emerald-400 font-bold text-lg">R$ {custoTotalKit.toFixed(2).replace('.', ',')}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <select 
                      value={insumoSelecionadoId} 
                      onChange={(e) => setInsumoSelecionadoId(e.target.value)} 
                      className="w-full sm:flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 truncate"
                    >
                      <option value="">Selecione um insumo...</option>
                      {insumosLista.map(insumo => (
                        <option key={insumo.id} value={insumo.id}>
                          {insumo.nome} - R$ {insumo.custo_unitario_calculado?.toFixed(2).replace('.', ',')}
                        </option>
                      ))}
                    </select>
                    <button 
                      onClick={handleAddInsumoAoKit}
                      className="w-full sm:w-auto bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-600 shrink-0"
                    >
                      Adicionar
                    </button>
                  </div>

                  {kitEmbalagem.length > 0 ? (
                    <div className="space-y-2">
                      {kitEmbalagem.map(item => (
                        <div key={item.id} className="flex justify-between items-center bg-slate-800/50 p-2 rounded border border-slate-700/50">
                          <div className="flex items-center gap-3">
                            <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-1 rounded">
                              {item.quantidade_uso}x
                            </span>
                            <span className="text-sm text-slate-300">{item.nome}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-slate-400">
                              R$ {(item.custo_unitario_calculado * item.quantidade_uso).toFixed(2).replace('.', ',')}
                            </span>
                            <button onClick={() => handleRemoveInsumoDoKit(item.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 border border-dashed border-slate-700 rounded-lg text-slate-500 text-sm">
                      Nenhum insumo selecionado. O produto será cadastrado sem custo logístico vinculado.
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1 flex justify-between">
                    Descrição do Anúncio <Wand2 size={14} className="text-emerald-400" />
                  </label>
                  <textarea rows="4" defaultValue={mockDadosGerados.descricao} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white resize-none"></textarea>
                </div>
              </div>

              <div className="lg:col-span-5 border-l-0 lg:border-l border-slate-700 lg:pl-8 mt-6 lg:mt-0">
                <label className="block text-sm text-slate-400 mb-3 flex items-center gap-2">
                  <ImageIcon size={16} /> Estúdio (Imagens Tratadas)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 aspect-video bg-slate-900 rounded-lg border border-slate-700 overflow-hidden relative">
                    <img src={mockDadosGerados.imagens[0]} alt="Principal" className="w-full h-full object-cover" />
                    <span className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">1200x1200px</span>
                  </div>
                  {mockDadosGerados.imagens.slice(1).map((img, idx) => (
                    <div key={idx} className="aspect-square bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                      <img src={img} alt={`Secundaria ${idx}`} className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-slate-700">
              <button onClick={resetar} className="px-6 py-2 text-slate-400 hover:text-white transition-colors font-medium">Descartar</button>
              <button onClick={handleConfirmarBling} className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 text-lg transition-transform active:scale-95">
                Exportar para Bling
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="text-emerald-500" size={40} />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Produto Exportado!</h2>
          <p className="text-slate-400 mb-8">Todos os dados, imagens e a regra de embalagem já estão salvos.</p>
          <button onClick={resetar} className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white px-6 py-3 rounded-xl font-medium">
            Próximo Produto
          </button>
        </div>
      )}
    </div>
  );
}