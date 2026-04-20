/**
 * @file ImportarEstoque.jsx
 * @description Upload do CSV "Visão Financeira do Estoque" exportado do Bling.
 *              Parseia o arquivo, mostra preview e salva no Firestore via API.
 */
import { useState, useRef, useCallback } from 'react';
import { Upload, CheckCircle, AlertTriangle, Package, Clock, RefreshCw } from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUM = new Intl.NumberFormat('pt-BR');

function diasAtras(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diff / 86400000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

export function ImportarEstoque({ onImportado }) {
  const [dragging, setDragging] = useState(false);
  const [status,   setStatus]   = useState(null);   // null | 'loading' | 'success' | 'error'
  const [msg,      setMsg]      = useState('');
  const [resultado, setResultado] = useState(null);  // { totalEstoque, totalItens, totalQuantidade, ... }
  const inputRef = useRef();

  const processar = useCallback(async (file) => {
    if (!file || !file.name.toLowerCase().match(/\.(csv|txt)$/)) {
      setStatus('error');
      setMsg('Selecione um arquivo CSV exportado do Bling (Estoque → Relatórios → Visão Financeira do Estoque).');
      return;
    }
    setStatus('loading');
    setMsg('');

    const form = new FormData();
    form.append('arquivo', file);

    try {
      const token = await getAuthToken();
      const res = await fetch('/api/fin-estoque/importar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

      setStatus('success');
      setMsg(`${json.totalItens} itens · ${NUM.format(json.totalQuantidade)} unidades`);
      setResultado({
        ...json,
        importadoEm: new Date().toISOString(),
        arquivoNome: file.name,
      });
      onImportado?.();
    } catch (e) {
      setStatus('error');
      setMsg(e.message);
    }
  }, [onImportado]);

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processar(file);
  }, [processar]);

  const onInput = e => {
    const file = e.target.files[0];
    if (file) processar(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Instruções */}
      <div className="rounded-xl bg-slate-800/50 border border-white/5 p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <Package size={15} className="text-violet-400" />
          Como exportar o Estoque do Bling
        </h3>
        <ol className="text-xs text-slate-400 flex flex-col gap-1.5 list-decimal list-inside">
          <li>No Bling, acesse <span className="text-slate-200 font-medium">Estoque → Relatórios → Visão Financeira do Estoque</span></li>
          <li>Aguarde o relatório carregar todos os produtos</li>
          <li>Clique em <span className="text-slate-200 font-medium">Exportar → CSV</span></li>
          <li>Arraste o arquivo baixado na área abaixo</li>
        </ol>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all
          ${dragging
            ? 'border-violet-500 bg-violet-500/10'
            : 'border-white/10 bg-slate-800/30 hover:border-white/20 hover:bg-slate-800/50'}`}
      >
        <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden" onChange={onInput} />
        {status === 'loading'
          ? <RefreshCw size={28} className="text-violet-400 animate-spin" />
          : <Upload size={28} className={dragging ? 'text-violet-400' : 'text-slate-500'} />
        }
        <div className="text-center">
          <p className="text-sm text-slate-300 font-medium">
            {status === 'loading' ? 'Processando...' : 'Arraste o CSV do Estoque aqui'}
          </p>
          <p className="text-xs text-slate-600 mt-1">ou clique para selecionar o arquivo</p>
        </div>
      </div>

      {/* Feedback */}
      {status === 'success' && resultado && (
        <div className="rounded-xl bg-violet-900/20 border border-violet-700/40 p-4 flex items-start gap-3">
          <CheckCircle size={16} className="text-violet-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-violet-400 font-medium">Estoque importado!</p>
            <p className="text-xs text-slate-400 mt-0.5">{msg}</p>
            <p className="text-lg font-bold text-slate-100 mt-2">{BRL.format(resultado.totalEstoque)}</p>
            <p className="text-xs text-slate-500">valor total em estoque</p>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="rounded-xl bg-red-900/20 border border-red-700/40 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-400 font-medium">Erro na importação</p>
            <p className="text-xs text-slate-400 mt-0.5">{msg}</p>
          </div>
        </div>
      )}

      {/* Última importação */}
      {resultado && (
        <div className="rounded-xl bg-slate-800 border border-white/5 p-4 flex items-center gap-3">
          <Clock size={15} className="text-slate-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400">
              <span className="text-slate-200 font-medium">{resultado.arquivoNome}</span>
              {' · '}importado {diasAtras(resultado.importadoEm)}
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              {resultado.totalItens} itens · {NUM.format(resultado.totalQuantidade)} unidades · {BRL.format(resultado.totalEstoque)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
