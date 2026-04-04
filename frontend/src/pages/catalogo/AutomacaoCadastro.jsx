import React, { useState, useEffect } from 'react';
import { Search, Loader2, PackageCheck, ArrowLeft, Truck, Zap, CheckCircle, AlertCircle } from 'lucide-react';

export default function AutomacaoCadastro() {
  const [ean, setEan] = useState('');
  const [status, setStatus] = useState('idle'); // idle | processing | review | exporting | success | error
  const [produto, setProduto] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [exportError, setExportError] = useState('');
  const [blingId, setBlingId] = useState(null);

  useEffect(() => {
    fetch('/api/catalogo/categorias')
      .then(res => res.json())
      .then(data => setCategorias(Array.isArray(data) ? data : []))
      .catch(() => setCategorias([]));
  }, []);

  const handleBusca = async () => {
    if (!ean.trim()) return;
    setStatus('processing');
    try {
      const res = await fetch('/api/catalogo/processar-ean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ean: ean.trim() })
      });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error);

      // Auto-seleciona categoria se a IA sugeriu uma
      if (dados.categoriaSugerida && categorias.length) {
        const match = categorias.find(c =>
          c.nome.toLowerCase().includes(dados.categoriaSugerida.toLowerCase()) ||
          dados.categoriaSugerida.toLowerCase().includes(c.nome.toLowerCase())
        );
        if (match) dados.idCategoria = String(match.id);
      }

      setProduto(dados);
      setStatus('review');
    } catch (err) {
      setStatus('idle');
    }
  };

  const handleExportar = async () => {
    setStatus('exporting');
    setExportError('');
    try {
      const res = await fetch('/api/catalogo/criar-produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(produto)
      });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error);
      setBlingId(dados.id);
      setStatus('success');
    } catch (err) {
      setExportError(err.message || 'Erro ao exportar');
      setStatus('review');
    }
  };

  const handleNovo = () => {
    setEan('');
    setProduto(null);
    setBlingId(null);
    setExportError('');
    setStatus('idle');
  };

  if (status === 'idle') return (
    <div className="p-20 flex flex-col items-center justify-center">
      <h1 className="text-white text-3xl font-black mb-2 tracking-tighter">Automação de Cadastro</h1>
      <p className="text-slate-500 text-sm mb-8">Digite o EAN e a IA preenche o cadastro automaticamente</p>
      <div className="flex gap-2 w-full max-w-xl bg-slate-900 p-2 rounded-2xl border border-slate-700">
        <input
          className="flex-1 bg-transparent p-4 text-white outline-none text-xl font-bold"
          placeholder="EAN ou Código de Barras..."
          value={ean}
          onChange={(e) => setEan(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleBusca()}
          autoFocus
        />
        <button onClick={handleBusca} className="bg-emerald-500 text-white px-8 rounded-xl font-black">
          BUSCAR
        </button>
      </div>
    </div>
  );

  if (status === 'processing') return (
    <div className="p-20 text-center text-white space-y-3">
      <Loader2 className="animate-spin inline" size={32}/>
      <p className="text-slate-400">IA analisando produto...</p>
    </div>
  );

  if (status === 'success') return (
    <div className="p-20 flex flex-col items-center justify-center gap-6">
      <CheckCircle size={64} className="text-emerald-400"/>
      <div className="text-center">
        <h2 className="text-white text-2xl font-black">Produto Criado no Bling!</h2>
        {blingId && <p className="text-slate-400 mt-1">ID Bling: <span className="text-emerald-400 font-mono">{blingId}</span></p>}
      </div>
      <button onClick={handleNovo} className="bg-slate-800 text-white px-8 py-4 rounded-2xl font-black hover:bg-slate-700">
        Cadastrar Novo Produto
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-slate-900 p-6 rounded-2xl border border-white/5">
        <h2 className="text-xl font-black text-white uppercase tracking-widest">Revisão do Cadastro Bling</h2>
        <button onClick={handleNovo} className="text-slate-500 hover:text-white flex items-center gap-2">
          <ArrowLeft size={18}/> Novo Produto
        </button>
      </div>

      {produto?.jaExiste && (
        <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 text-yellow-400">
          <AlertCircle size={18}/>
          <span className="text-sm font-bold">Produto já existe no Bling — campos pré-preenchidos. Você pode atualizar os dados e exportar novamente.</span>
        </div>
      )}

      {exportError && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-400">
          <AlertCircle size={18}/>
          <span className="text-sm font-bold">{exportError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-slate-900 border border-white/5 rounded-3xl p-8 space-y-6 shadow-2xl">
            <div className="grid grid-cols-12 gap-4">

              <div className="col-span-12">
                <label className="text-[10px] text-slate-500 font-bold uppercase ml-1">Título (Nome do Produto)</label>
                <input
                  className="w-full bg-slate-800 border border-white/5 p-4 rounded-xl text-white font-bold outline-none focus:border-emerald-500"
                  value={produto?.fNome || ''}
                  onChange={(e) => setProduto({...produto, fNome: e.target.value})}
                />
              </div>

              <div className="col-span-6">
                <label className="text-[10px] text-slate-500 font-bold uppercase ml-1">SKU</label>
                <input
                  className="w-full bg-slate-800 border border-white/5 p-4 rounded-xl text-emerald-400 font-mono font-bold outline-none"
                  value={produto?.fSku || ''}
                  onChange={(e) => setProduto({...produto, fSku: e.target.value})}
                />
              </div>

              <div className="col-span-6">
                <label className="text-[10px] text-slate-500 font-bold uppercase ml-1">Categoria Bling</label>
                <select
                  className="w-full bg-slate-800 border border-white/5 p-4 rounded-xl text-white outline-none focus:border-emerald-500"
                  value={produto?.idCategoria || ''}
                  onChange={(e) => setProduto({...produto, idCategoria: e.target.value})}
                >
                  <option value="">Selecione a Categoria...</option>
                  {categorias.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.nome}</option>
                  ))}
                </select>
                {produto?.categoriaSugerida && (
                  <p className="text-[10px] text-slate-500 mt-1 ml-1">IA sugeriu: <span className="text-emerald-500">{produto.categoriaSugerida}</span></p>
                )}
              </div>

              <div className="col-span-4">
                <label className="text-[10px] text-slate-500 font-bold uppercase ml-1">Marca</label>
                <input
                  className="w-full bg-slate-800 border border-white/5 p-4 rounded-xl text-white outline-none"
                  value={produto?.fMarca || ''}
                  onChange={(e) => setProduto({...produto, fMarca: e.target.value})}
                />
              </div>
              <div className="col-span-4">
                <label className="text-[10px] text-slate-500 font-bold uppercase ml-1">NCM</label>
                <input
                  className="w-full bg-slate-800 border border-white/5 p-4 rounded-xl text-white outline-none"
                  value={produto?.fNcm || ''}
                  onChange={(e) => setProduto({...produto, fNcm: e.target.value})}
                />
              </div>
              <div className="col-span-4">
                <label className="text-[10px] text-slate-500 font-bold uppercase ml-1">Preço</label>
                <input
                  className="w-full bg-slate-800 border border-white/5 p-4 rounded-xl text-white outline-none"
                  value={produto?.fPreco || ''}
                  onChange={(e) => setProduto({...produto, fPreco: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-white/5 rounded-3xl p-8 shadow-xl">
            <div className="flex items-center gap-2 text-slate-500 mb-6 font-bold text-xs uppercase tracking-widest">
              <Truck size={16}/> Logística (Peso e Medidas)
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Peso Líquido (kg)', key: 'fPesoLiq' },
                { label: 'Peso Bruto (kg)',   key: 'fPesoBruto' },
                { label: 'Altura (cm)',        key: 'fAltura' },
                { label: 'Largura (cm)',       key: 'fLargura' },
              ].map(item => (
                <div key={item.key} className="bg-slate-800/50 p-4 rounded-2xl border border-white/5">
                  <label className="text-[10px] text-slate-600 block font-black">{item.label}</label>
                  <input
                    className="bg-transparent text-white w-full font-bold outline-none mt-1"
                    value={produto?.[item.key] || ''}
                    onChange={(e) => setProduto({...produto, [item.key]: e.target.value})}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900 border border-white/5 rounded-3xl p-4 overflow-hidden shadow-2xl">
            {produto?.imagens?.[0] ? (
              <div className="bg-white rounded-2xl p-4 aspect-square flex items-center justify-center">
                <img src={produto.imagens[0]} className="max-h-full object-contain" alt="Foto Principal"/>
              </div>
            ) : (
              <div className="bg-slate-800 rounded-2xl aspect-square flex items-center justify-center text-slate-600 text-sm">
                Sem imagem
              </div>
            )}
            <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <p className="text-[10px] text-emerald-400 font-bold uppercase flex items-center gap-2">
                <Zap size={10}/> Análise da IA Concluída
              </p>
              <p className="text-xs text-slate-400 mt-1">Revise os campos antes de exportar.</p>
            </div>
          </div>

          <button
            onClick={handleExportar}
            disabled={status === 'exporting'}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 p-8 rounded-3xl font-black text-2xl flex flex-col items-center gap-2 shadow-2xl shadow-emerald-500/30 transition-all active:scale-95"
          >
            {status === 'exporting'
              ? <><Loader2 size={32} className="animate-spin"/> EXPORTANDO...</>
              : <><PackageCheck size={32}/> EXPORTAR PARA BLING</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
