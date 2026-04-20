/**
 * @file ImportarDRE.jsx
 * @description Upload do CSV "DRE" exportado do Bling.
 *              Analisa o arquivo, mostra preview e salva no Firestore via API.
 */
import { useState, useRef, useCallback } from 'react';
import { Upload, CheckCircle, AlertTriangle, FileText, Clock, RefreshCw } from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PERC = v => `${(v * 100).toFixed(1)}%`;

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function diasAtras(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diff / 86400000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

export function ImportarDRE({ onImportado }) {
  const [dragging, setDragging]   = useState(false);
  const [arquivo,  setArquivo]    = useState(null);   // { name, preview[] }
  const [status,   setStatus]     = useState(null);   // null | 'loading' | 'success' | 'error'
  const [msg,      setMsg]        = useState('');
  const [ultima,   setUltima]     = useState(null);   // metadado última importação
  const inputRef  = useRef();

  const processar = useCallback(async (file) => {
    if (!file || !file.name.toLowerCase().match(/\.(csv|txt)$/)) {
      setStatus('error');
      setMsg('Selecione um arquivo CSV exportado do Bling (Financeiro → DRE → Exportar).');
      return;
    }
    setStatus('loading');
    setMsg('');

    const form = new FormData();
    form.append('arquivo', file);

    try {
      // Não usar apiFetch aqui — ele força Content-Type: application/json
      // quebrando o multipart/form-data. Fazemos fetch manual com só o Authorization.
      const token = await getAuthToken();
      const res = await fetch('/api/fin-dre/importar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

      setStatus('success');
      setMsg(`${json.mesesImportados} meses importados: ${json.meses.join(', ')}`);
      setArquivo({ name: file.name, preview: json.preview || [] });
      setUltima({ ultimaImportacao: new Date().toISOString(), arquivoNome: file.name, mesesImportados: json.meses });
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
          <FileText size={15} className="text-blue-400" />
          Como exportar o DRE do Bling
        </h3>
        <ol className="text-xs text-slate-400 flex flex-col gap-1.5 list-decimal list-inside">
          <li>No Bling, acesse <span className="text-slate-200 font-medium">Financeiro → Relatório de Finanças → DRE</span></li>
          <li>Selecione o período desejado (ex: Jan/2026 a Dez/2026)</li>
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
            ? 'border-emerald-500 bg-emerald-500/10'
            : 'border-white/10 bg-slate-800/30 hover:border-white/20 hover:bg-slate-800/50'}`}
      >
        <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden" onChange={onInput} />
        {status === 'loading'
          ? <RefreshCw size={28} className="text-emerald-400 animate-spin" />
          : <Upload size={28} className={dragging ? 'text-emerald-400' : 'text-slate-500'} />
        }
        <div className="text-center">
          <p className="text-sm text-slate-300 font-medium">
            {status === 'loading' ? 'Processando...' : 'Arraste o CSV do DRE aqui'}
          </p>
          <p className="text-xs text-slate-600 mt-1">ou clique para selecionar o arquivo</p>
        </div>
      </div>

      {/* Feedback */}
      {status === 'success' && (
        <div className="rounded-xl bg-emerald-900/20 border border-emerald-700/40 p-4 flex items-start gap-3">
          <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-emerald-400 font-medium">Importado com sucesso!</p>
            <p className="text-xs text-slate-400 mt-0.5">{msg}</p>
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
      {ultima && (
        <div className="rounded-xl bg-slate-800 border border-white/5 p-4 flex items-center gap-3">
          <Clock size={15} className="text-slate-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400">
              <span className="text-slate-200 font-medium">{ultima.arquivoNome}</span>
              {' · '}importado {diasAtras(ultima.ultimaImportacao)}
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              Meses: {ultima.mesesImportados?.join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Preview */}
      {arquivo?.preview?.length > 0 && (
        <div className="rounded-xl bg-slate-800 border border-white/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Preview — dados importados</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-slate-900/50">
                  <th className="px-3 py-2 text-left text-slate-500 font-medium">Mês</th>
                  <th className="px-3 py-2 text-right text-slate-500 font-medium">Rec. Bruta</th>
                  <th className="px-3 py-2 text-right text-slate-500 font-medium">Custo Merc.</th>
                  <th className="px-3 py-2 text-right text-slate-500 font-medium">Lucro Bruto</th>
                  <th className="px-3 py-2 text-right text-slate-500 font-medium">Desp. Financ.</th>
                  <th className="px-3 py-2 text-right text-slate-500 font-medium">Resultado Líq.</th>
                  <th className="px-3 py-2 text-right text-slate-500 font-medium">Marg. Líq.</th>
                </tr>
              </thead>
              <tbody>
                {arquivo.preview.map((row, i) => {
                  const marg = row.receitaBruta > 0 ? row.resultadoLiquido / row.receitaBruta : 0;
                  return (
                    <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-slate-300 font-medium">{row.mesAno}</td>
                      <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{BRL.format(row.receitaBruta)}</td>
                      <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{BRL.format(row.custoMercadoria)}</td>
                      <td className="px-3 py-2 text-right text-slate-200 tabular-nums">{BRL.format(row.lucroBruto)}</td>
                      <td className="px-3 py-2 text-right text-orange-400/80 tabular-nums">{BRL.format(row.despesaFinanceira)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={row.resultadoLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {BRL.format(row.resultadoLiquido)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={marg >= 0.1 ? 'text-emerald-400' : marg >= 0.05 ? 'text-yellow-400' : 'text-red-400'}>
                          {PERC(marg)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
