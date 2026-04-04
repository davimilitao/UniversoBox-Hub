/**
 * @file ImportarCSV.jsx
 * @description Migração React de importar.html — importação de planilha CSV do Bling.
 *              Corrige o bug de produtos com grade/variação: linha pai (sem SKU) tem
 *              o nome real; filhas herdam nome_pai + " — " + composição.
 * @version 1.0.0
 * @date 2026-04-04
 */

import { useState, useCallback, useRef } from 'react';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, X, RefreshCw,
  Package, Ruler, Weight, Image, Barcode, Layers, ChevronRight,
  Info, Zap, Tag,
} from 'lucide-react';

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

function splitLine(line, d) {
  const r = []; let c = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const x = line[i];
    if (x === '"') { q = !q; }
    else if (x === d && !q) { r.push(c); c = ''; }
    else { c += x; }
  }
  r.push(c);
  return r;
}

function findCol(headers, candidates) {
  const norm = s => s.toLowerCase().replace(/\s+/g, '').replace(/[()\/]/g, '');
  for (const c of candidates) {
    const i = headers.findIndex(h => norm(h) === norm(c));
    if (i !== -1) return i;
  }
  return -1;
}

function pNum(r) {
  const s = (r || '').toString().trim().replace(',', '.');
  if (!s || s === '0' || s === '0.00') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function pImgs(r) {
  return (r || '').split('|')
    .map(s => s.trim().replace(/\s/g, ''))
    .filter(u => /^https?:\/\//i.test(u))
    .slice(0, 10);
}

/**
 * Detecta se um campo "nome" parece ser apenas a composição/variação da grade do Bling.
 * Ex: "Cor:Azul;Tamanho:G" ou "Tamanho:M" → true
 * Ex: "Coleira Pet Reflectiva Tamanho G" → false
 */
function isComposicaoSomente(nome) {
  if (!nome) return false;
  // Formato Bling: chave:valor separados por ; ou ,
  // Ex: "Cor:Azul;Tamanho:G" ou "Tamanho:M;Cor:Rosa"
  const parts = nome.split(/[;,]/);
  return parts.length >= 1 && parts.every(p => /^[^:]+:[^:]+$/.test(p.trim()));
}

/**
 * Converte "Cor:Azul;Tamanho:G" → "Cor Azul / Tamanho G" (label legível)
 */
function formatComposicao(raw) {
  return raw.split(/[;,]/)
    .map(p => p.trim().replace(':', ' '))
    .filter(Boolean)
    .join(' / ');
}

/**
 * Parse CSV do Bling com suporte a grades/variações.
 * Linha PAI: sem SKU, tem nome completo → guarda como contexto.
 * Linhas FILHAS: SKU preenchido, nome pode ser só a composição → herda nome do pai.
 */
function parseCSV(text) {
  // BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  // Detecta delimitador
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = [';', ',', '\t']
    .map(d => ({ d, n: (firstLine.match(new RegExp('\\' + d, 'g')) || []).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { produtos: [], ignorados: 0, grades: 0 };

  const headers = splitLine(lines[0], delim).map(h => h.trim().replace(/^"|"$/g, ''));

  const fm = {
    sku:          findCol(headers, ['Código', 'Codigo', 'sku', 'SKU']),
    name:         findCol(headers, ['Descrição', 'Descricao', 'Nome', 'name']),
    bin:          findCol(headers, ['Localização', 'Localizacao', 'Local', 'bin']),
    ean:          findCol(headers, ['GTIN/EAN', 'EAN', 'GTIN']),
    eanBox:       findCol(headers, ['GTIN/EAN da Embalagem', 'EAN da Embalagem']),
    images:       findCol(headers, ['URL Imagens Externas', 'URL de Imagens Externas']),
    weight:       findCol(headers, ['Peso líquido (Kg)', 'Peso liquido (Kg)']),
    weightBruto:  findCol(headers, ['Peso bruto (Kg)', 'Peso Bruto (Kg)']),
    width:        findCol(headers, ['Largura do produto', 'Largura']),
    height:       findCol(headers, ['Altura do Produto', 'Altura do produto', 'Altura']),
    depth:        findCol(headers, ['Profundidade do produto', 'Profundidade']),
    stock:        findCol(headers, ['Estoque', 'estoque']),
    itensPorCaixa: findCol(headers, ['Itens p/ caixa', 'Itens por caixa']),
    preco:        findCol(headers, ['Preço', 'Preco']),
    precoCusto:   findCol(headers, ['Preço de custo', 'Preco de custo']),
    situacao:     findCol(headers, ['Situação', 'Situacao']),
    marca:        findCol(headers, ['Marca', 'marca']),
    tagsRaw:      findCol(headers, ['Grupo de Tags/Tags', 'Tags']),
  };

  const produtos = [];
  let ignorados = 0;
  let grades = 0;

  // Contexto do produto pai atual (para grades)
  let nomePai = null;
  let dadosPai = {}; // campos herdáveis (marca, tags, imagens do pai)

  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i], delim).map(v => v.trim().replace(/^"|"$/g, '').trim());
    const get = k => fm[k] !== -1 ? (vals[fm[k]] || '') : '';

    const sku  = get('sku').trim();
    const name = get('name').trim();

    // ── Linha PAI (sem SKU) — guarda contexto para as filhas ─────────────
    if (!sku && name) {
      nomePai  = name;
      dadosPai = {
        bin:       get('bin'),
        images:    pImgs(get('images')),
        marca:     get('marca'),
        tagsRaw:   get('tagsRaw'),
        situacao:  get('situacao'),
        preco:     pNum(get('preco')),
        precoCusto: pNum(get('precoCusto')),
        weight:    pNum(get('weight')),
        weightBruto: pNum(get('weightBruto')),
        width:     pNum(get('width')),
        height:    pNum(get('height')),
        depth:     pNum(get('depth')),
        itensPorCaixa: pNum(get('itensPorCaixa')),
      };
      continue;
    }

    // ── Linha sem SKU e sem nome → pular ─────────────────────────────────
    if (!sku) { ignorados++; continue; }

    // ── Validação do SKU ──────────────────────────────────────────────────
    if (sku.length > 60)                                  { ignorados++; continue; }
    if (/[\s:<>]/.test(sku))                              { ignorados++; continue; }
    if (!/^[A-Za-z0-9_\-.]+$/.test(sku))                 { ignorados++; continue; }

    // ── Resolve nome ──────────────────────────────────────────────────────
    let nomeResolvido = name;
    let isGrade = false;

    if (isComposicaoSomente(name) && nomePai) {
      // É uma variação: nome = pai + " — " + composição legível
      nomeResolvido = `${nomePai} — ${formatComposicao(name)}`;
      isGrade = true;
      grades++;
    } else if (!name && nomePai) {
      // Filha sem nome próprio — usa nome do pai diretamente
      nomeResolvido = nomePai;
      isGrade = true;
      grades++;
    } else {
      // Produto simples ou nome próprio: reseta contexto do pai
      nomePai  = null;
      dadosPai = {};
    }

    if (!nomeResolvido) { ignorados++; continue; }

    // ── Mescla com dados do pai (pai prevalece em campos vazios da filha) ─
    const w = pNum(get('width'))  || dadosPai.width;
    const h = pNum(get('height')) || dadosPai.height;
    const d = pNum(get('depth'))  || dadosPai.depth;

    const imgs = pImgs(get('images'));

    produtos.push({
      sku,
      name:          nomeResolvido,
      _isGrade:      isGrade,
      bin:           get('bin')      || dadosPai.bin      || '',
      ean:           get('ean')      || '',
      eanBox:        get('eanBox')   || '',
      images:        imgs.length ? imgs : (dadosPai.images || []),
      weight:        pNum(get('weight'))      ?? dadosPai.weight      ?? null,
      weightBruto:   pNum(get('weightBruto')) ?? dadosPai.weightBruto ?? null,
      width:         w,
      height:        h,
      depth:         d,
      stock:         pNum(get('stock'))       ?? null,
      itensPorCaixa: pNum(get('itensPorCaixa')) ?? dadosPai.itensPorCaixa ?? null,
      preco:         pNum(get('preco'))       ?? dadosPai.preco       ?? null,
      precoCusto:    pNum(get('precoCusto'))  ?? dadosPai.precoCusto  ?? null,
      situacao:      get('situacao')  || dadosPai.situacao  || '',
      marca:         get('marca')     || dadosPai.marca     || '',
      tagsRaw:       get('tagsRaw')   || dadosPai.tagsRaw   || '',
    });
  }

  return { produtos, ignorados, grades };
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'slate' }) {
  const colors = {
    emerald: 'text-emerald-400',
    blue:    'text-blue-400',
    amber:   'text-amber-400',
    purple:  'text-purple-400',
    slate:   'text-slate-400',
  };
  return (
    <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-900 border border-white/[0.07]">
      <span className={`text-3xl font-black tabular-nums leading-none ${colors[color]}`}>{value}</span>
      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-1.5">{label}</span>
      {sub && <span className="text-[10px] text-slate-700 mt-0.5">{sub}</span>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ImportarCSV() {
  const [parsedData,    setParsedData]    = useState(null); // { produtos, ignorados, grades }
  const [fileName,      setFileName]      = useState('');
  const [dragging,      setDragging]      = useState(false);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState(null); // { ok, count, errors }
  const [previewFilter, setPreviewFilter] = useState('todos'); // todos|grades|semfoto|semdim
  const fileRef = useRef();

  // ── File handling ────────────────────────────────────────────────────────
  function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = e => {
      const result = parseCSV(e.target.result);
      setParsedData(result);
    };
    reader.readAsText(file, 'utf-8');
  }

  const onDrop = useCallback(e => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, []);

  // ── Import ───────────────────────────────────────────────────────────────
  async function handleImport() {
    if (!parsedData?.produtos?.length) return;
    setImporting(true);
    setImportResult(null);
    const token = localStorage.getItem('expedicao_token') || '';
    const BATCH = 50;
    let totalOk = 0, totalErr = 0;
    const prods = parsedData.produtos;

    try {
      for (let i = 0; i < prods.length; i += BATCH) {
        const batch = prods.slice(i, i + BATCH).map(({ _isGrade, ...p }) => p); // remove campo interno
        const r = await fetch('/import/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ produtos: batch }),
        });
        const data = await r.json();
        if (data.ok) totalOk += data.count ?? batch.length;
        else          totalErr += batch.length;
      }
      setImportResult({ ok: true, count: totalOk, errors: totalErr });
    } catch (e) {
      setImportResult({ ok: false, message: e.message });
    } finally {
      setImporting(false);
    }
  }

  // ── Preview filtering ────────────────────────────────────────────────────
  const previewProdutos = (() => {
    if (!parsedData) return [];
    let arr = parsedData.produtos;
    if (previewFilter === 'grades')  arr = arr.filter(p => p._isGrade);
    if (previewFilter === 'semfoto') arr = arr.filter(p => !p.images?.length);
    if (previewFilter === 'semdim')  arr = arr.filter(p => !p.width || !p.height || !p.depth);
    return arr.slice(0, 30);
  })();

  const stats = parsedData ? {
    total:   parsedData.produtos.length,
    grades:  parsedData.grades,
    comDim:  parsedData.produtos.filter(p => p.width && p.height && p.depth).length,
    comFoto: parsedData.produtos.filter(p => p.images?.length > 0).length,
    semDim:  parsedData.produtos.filter(p => !p.width || !p.height || !p.depth).length,
    ignorados: parsedData.ignorados,
  } : null;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-slate-950 animate-fade-in">

      {/* Topbar */}
      <header className="shrink-0 flex items-center gap-3 px-4 h-14 border-b border-white/[0.06] bg-slate-900">
        <div className="w-7 h-7 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <Upload size={14} className="text-emerald-400" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-100 leading-none">Importar CSV do Bling</h1>
          <p className="text-[10px] text-slate-500 mt-0.5">Suporte a produtos simples e grades/variações</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl mx-auto w-full">

        {/* ── Drop Zone ── */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={[
            'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-all',
            dragging
              ? 'border-emerald-400/60 bg-emerald-500/5'
              : parsedData
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-white/[0.1] bg-slate-900/60 hover:border-white/[0.2] hover:bg-slate-900',
          ].join(' ')}
        >
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={e => handleFile(e.target.files?.[0])} />

          {parsedData ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 size={22} className="text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-emerald-300">{fileName}</p>
                <p className="text-xs text-slate-500 mt-1">{stats.total} produtos prontos para importar</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); setParsedData(null); setFileName(''); setImportResult(null); }}
                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors underline"
              >
                Trocar arquivo
              </button>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-white/[0.08] flex items-center justify-center">
                <Upload size={22} className="text-slate-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-300">Arraste o CSV aqui ou clique para selecionar</p>
                <p className="text-xs text-slate-600 mt-1">Exportado direto do Bling — suporta produtos com grade/variação</p>
              </div>
            </>
          )}
        </div>

        {/* ── Info Box — como exportar do Bling ── */}
        {!parsedData && (
          <div className="flex gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/15">
            <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-400 space-y-1 leading-relaxed">
              <p className="font-semibold text-blue-300">Como exportar do Bling:</p>
              <p>Produtos → Listar Produtos → Exportar → <strong>CSV</strong></p>
              <p>Marque todos os campos incluindo <strong>Localização, GTIN/EAN, Dimensões, Peso, Fotos externas</strong>.</p>
              <p className="text-slate-600">Produtos com grade exportam a linha pai (sem código) + filhas (código + composição). O importador resolve automaticamente o nome completo.</p>
            </div>
          </div>
        )}

        {/* ── Stats ── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <StatCard label="Produtos"   value={stats.total}    color="emerald" />
            <StatCard label="Grades"     value={stats.grades}   color="purple"  sub="variações resolvidas" />
            <StatCard label="Com foto"   value={stats.comFoto}  color="blue" />
            <StatCard label="Com dims"   value={stats.comDim}   color="blue" />
            <StatCard label="Sem dims"   value={stats.semDim}   color={stats.semDim > 0 ? 'amber' : 'slate'} />
            <StatCard label="Ignorados"  value={stats.ignorados} color={stats.ignorados > 0 ? 'amber' : 'slate'} sub="SKU inválido" />
          </div>
        )}

        {/* ── Grade alert ── */}
        {stats?.grades > 0 && (
          <div className="flex gap-3 p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
            <Layers size={15} className="text-purple-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              <span className="text-purple-300 font-semibold">{stats.grades} variações</span> de grades foram resolvidas — os nomes completos foram reconstruídos a partir da linha pai do Bling.
              Veja aba <strong>"Grades"</strong> na prévia abaixo.
            </p>
          </div>
        )}

        {/* ── Preview table ── */}
        {parsedData && (
          <div className="rounded-xl border border-white/[0.07] overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.05] bg-slate-900/60">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Prévia</p>
              <div className="flex gap-1.5 ml-auto">
                {[
                  { id: 'todos',   label: 'Todos' },
                  { id: 'grades',  label: `Grades (${stats.grades})` },
                  { id: 'semfoto', label: 'Sem foto' },
                  { id: 'semdim',  label: 'Sem dims' },
                ].map(f => (
                  <button key={f.id} onClick={() => setPreviewFilter(f.id)}
                    className={[
                      'text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-colors',
                      previewFilter === f.id
                        ? 'bg-slate-700 text-slate-200 border-slate-500'
                        : 'bg-transparent text-slate-600 border-white/[0.07] hover:border-slate-600',
                    ].join(' ')}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.05] bg-slate-900/40">
                    <th className="text-left px-3 py-2 text-[10px] text-slate-600 font-semibold uppercase tracking-wider w-36">SKU</th>
                    <th className="text-left px-3 py-2 text-[10px] text-slate-600 font-semibold uppercase tracking-wider">Nome</th>
                    <th className="text-left px-3 py-2 text-[10px] text-slate-600 font-semibold uppercase tracking-wider w-24">Dims (cm)</th>
                    <th className="text-left px-3 py-2 text-[10px] text-slate-600 font-semibold uppercase tracking-wider w-16">Peso</th>
                    <th className="text-left px-3 py-2 text-[10px] text-slate-600 font-semibold uppercase tracking-wider w-16">Estoque</th>
                    <th className="text-left px-3 py-2 text-[10px] text-slate-600 font-semibold uppercase tracking-wider w-10">Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {previewProdutos.map((p, i) => (
                    <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-blue-400 text-[11px]">{p.sku}</span>
                          {p._isGrade && (
                            <span className="text-[9px] px-1 rounded bg-purple-500/15 text-purple-400 border border-purple-500/20">grade</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-300 max-w-xs">
                        <span className="block truncate">{p.name}</span>
                      </td>
                      <td className="px-3 py-2">
                        {(p.width && p.height && p.depth)
                          ? <span className="text-blue-400 tabular-nums">{p.width}×{p.height}×{p.depth}</span>
                          : <span className="text-slate-700">—</span>
                        }
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-400">{p.weight ? `${p.weight} kg` : <span className="text-slate-700">—</span>}</td>
                      <td className="px-3 py-2 tabular-nums">
                        <span className={p.stock != null ? (p.stock === 0 ? 'text-red-400' : 'text-slate-300') : 'text-slate-700'}>
                          {p.stock ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {p.images?.length > 0
                          ? <CheckCircle2 size={13} className="text-emerald-400" />
                          : <span className="text-slate-700">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                  {previewProdutos.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-600 text-xs">Nenhum item neste filtro</td></tr>
                  )}
                </tbody>
              </table>
              {parsedData.produtos.length > 30 && (
                <p className="text-[10px] text-slate-700 text-center py-2 border-t border-white/[0.04]">
                  Mostrando 30 de {parsedData.produtos.length} — todos serão importados
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Import result ── */}
        {importResult && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${
            importResult.ok
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : 'bg-red-500/5 border-red-500/20'
          }`}>
            {importResult.ok
              ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              : <AlertTriangle size={18} className="text-red-400 shrink-0" />
            }
            <div>
              {importResult.ok ? (
                <>
                  <p className="text-sm font-semibold text-emerald-300">Importação concluída!</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {importResult.count} produtos salvos no Firestore.
                    {importResult.errors > 0 && ` ${importResult.errors} falharam.`}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-red-300">Erro na importação</p>
                  <p className="text-xs text-slate-500 mt-0.5">{importResult.message}</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Import button ── */}
        {parsedData && !importResult && (
          <button
            onClick={handleImport}
            disabled={importing || !parsedData.produtos.length}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all shadow-lg shadow-emerald-900/30"
          >
            {importing
              ? <><RefreshCw size={16} className="animate-spin" /> Importando…</>
              : <><Upload size={16} /> Importar {stats.total} produtos para o Firestore</>
            }
          </button>
        )}

        {importResult?.ok && (
          <button
            onClick={() => { setParsedData(null); setFileName(''); setImportResult(null); }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.08] text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} /> Importar outro arquivo
          </button>
        )}

      </div>
    </div>
  );
}
