'use strict';

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
let todasDespesas   = [];
let filtroStatus    = 'all';
let filtroCategoria = 'all';
let mesAtivo        = '';
let abasMeses       = [];
let ordemData       = 'desc'; // 'desc' = mais recente primeiro, 'asc' = mais antigo primeiro

const NOME_MES = {
  '01':'Janeiro','02':'Fevereiro','03':'Março','04':'Abril',
  '05':'Maio','06':'Junho','07':'Julho','08':'Agosto',
  '09':'Setembro','10':'Outubro','11':'Novembro','12':'Dezembro'
};

const CATEGORIAS = [
  { value:'all',                      label:'Todas',                  emoji:'📊' },
  { value:'Transporte / Frete',       label:'Transporte / Frete',     emoji:'🚚' },
  { value:'Transporte Flex',          label:'Transporte Flex',        emoji:'⚡' },
  { value:'Embalagens / Etiquetas',   label:'Embalagens / Etiquetas', emoji:'📦' },
  { value:'Impostos',                 label:'Impostos',               emoji:'🏛️' },
  { value:'Outros',                   label:'Outros',                 emoji:'📎' },
];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast show ${type}`;
  setTimeout(() => el.classList.remove('show'), 3500);
}

function formatCurrency(val) {
  return (Number(val)||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

function isAdmin() {
  try {
    // 1. Verifica localStorage (salvo no login)
    const stored = localStorage.getItem("expedicao_user");
    if (stored) {
      const role = JSON.parse(stored).role || "";
      if (role) return role === "admin";
    }
    // 2. Fallback: verifica via window.ERPMenu (menu.js já carregado)
    if (window.ERPMenu) return window.ERPMenu.getRealRole() === "admin";
    // 3. Sem dados = dev local
    return true;
  } catch { return false; }
}

function escHtml(str) {
  return String(str).replace(/'/g,"&#39;").replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────
// 1. CARREGAR DADOS
// ─────────────────────────────────────────────
async function carregarDespesas() {
  try {
    const res  = await fetch('/api/despesas');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    todasDespesas = data.items || [];
    processarMeses();
  } catch (err) {
    document.getElementById('listaDespesas').innerHTML =
      `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--accent-red);">Erro ao carregar: ${err.message}</td></tr>`;
  }
}

// ─────────────────────────────────────────────
// 2. ABAS DE MÊS
// ─────────────────────────────────────────────
function processarMeses() {
  const setMeses = new Set();
  const hoje     = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

  todasDespesas.forEach(it => {
    let mesAno = 'Outros';
    if (it.data) {
      const partes = it.data.split('/');
      if (partes.length === 3) {
        const m = parseInt(partes[1], 10);
        const y = parseInt(partes[2], 10);
        if (y > anoAtual || (y === anoAtual && m > mesAtual)) mesAno = 'Futuro';
        else if (!isNaN(m) && !isNaN(y)) mesAno = `${String(m).padStart(2,'0')}/${y}`;
      }
    }
    it.mesAnoID = mesAno;
    setMeses.add(mesAno);
  });

  abasMeses = Array.from(setMeses).sort((a, b) => {
    if (a === 'Futuro') return -1; if (b === 'Futuro') return 1;
    if (a === 'Outros') return  1; if (b === 'Outros') return -1;
    const [m1,y1] = a.split('/'); const [m2,y2] = b.split('/');
    if (y1 !== y2) return Number(y2) - Number(y1);
    return Number(m2) - Number(m1);
  });

  const mesAtualStr = `${String(mesAtual).padStart(2,'0')}/${anoAtual}`;
  if (!mesAtivo || !abasMeses.includes(mesAtivo)) {
    const reais = abasMeses.filter(m => m !== 'Futuro' && m !== 'Outros');
    mesAtivo = abasMeses.includes(mesAtualStr) ? mesAtualStr : (reais[0] || abasMeses[0] || '');
  }

  renderizarAbas();
  renderizarFiltrosCategorias();
  aplicarFiltros();
}

function renderizarAbas() {
  const container = document.getElementById('tabsContainer');
  if (!abasMeses.length) {
    container.innerHTML = `<button class="tab-btn active">Sem Lançamentos</button>`;
    return;
  }
  container.innerHTML = abasMeses.map(mesAno => {
    let label = mesAno;
    if (mesAno === 'Futuro') label = 'Futuros ⏳';
    else if (mesAno !== 'Outros') {
      const [m, y] = mesAno.split('/');
      label = `${NOME_MES[m] || m} ${y}`;
    }
    return `<button class="tab-btn ${mesAno === mesAtivo ? 'active':''}"
              onclick="setAba('${mesAno}')">${label}</button>`;
  }).join('');
}

function setAba(mesAno) {
  mesAtivo = mesAno;
  renderizarAbas();
  aplicarFiltros();
}

// ─────────────────────────────────────────────
// 3. FILTROS DE CATEGORIA (chips)
// ─────────────────────────────────────────────
function renderizarFiltrosCategorias() {
  const container = document.getElementById('filtrosCategorias');
  if (!container) return;
  container.innerHTML = CATEGORIAS.map(cat => `
    <button class="cat-chip ${filtroCategoria === cat.value ? 'active':''}"
            onclick="setCategoria('${cat.value}')">${cat.emoji} ${cat.label}</button>
  `).join('');
}

function setCategoria(val) {
  filtroCategoria = val;
  renderizarFiltrosCategorias();
  aplicarFiltros();
}

// ─────────────────────────────────────────────
// 4. FILTROS COMBINADOS + ORDENAÇÃO
// ─────────────────────────────────────────────
function toggleOrdemData() {
  ordemData = ordemData === 'desc' ? 'asc' : 'desc';
  // Atualiza o ícone do header
  const th = document.getElementById('th-data');
  if (th) th.textContent = ordemData === 'desc' ? 'Data ↓' : 'Data ↑';
  aplicarFiltros();
}

function aplicarFiltros() {
  let filtradas = todasDespesas.filter(it => {
    const passMes  = it.mesAnoID === mesAtivo;
    const passSt   = filtroStatus === 'all' || it.situacao.toLowerCase().includes(filtroStatus);
    const passCat  = filtroCategoria === 'all' || it.nome === filtroCategoria;
    return passMes && passSt && passCat;
  });

  // Ordenação por data (usa timestamp já calculado no backend)
  filtradas.sort((a, b) =>
    ordemData === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
  );

  renderizarLista(filtradas);
  calcularDashboard(filtradas);
}

// ─────────────────────────────────────────────
// 5. DASHBOARD
// ─────────────────────────────────────────────
function calcularDashboard(itens) {
  let total = 0, pago = 0, pendente = 0;
  itens.forEach(it => {
    const val = Number(it.valor)||0;
    total += val;
    if (it.situacao.toLowerCase().includes('pago'))     pago     += val;
    if (it.situacao.toLowerCase().includes('pendente')) pendente += val;
  });
  document.getElementById('dash-total').textContent    = formatCurrency(total);
  document.getElementById('dash-pago').textContent     = formatCurrency(pago);
  document.getElementById('dash-pendente').textContent = formatCurrency(pendente);
  document.getElementById('dash-count').textContent    =
    `${itens.length} registro${itens.length !== 1 ? 's':''}`;

  const catLabel = CATEGORIAS.find(c => c.value === filtroCategoria)?.label || 'Todas';
  document.getElementById('dash-filter-label').textContent =
    filtroCategoria === 'all' ? 'Total Geral' : `Total · ${catLabel}`;
}

// ─────────────────────────────────────────────
// 6. TABELA
// ─────────────────────────────────────────────
function renderizarLista(itens) {
  const tbody   = document.getElementById('listaDespesas');
  const admin   = isAdmin();
  const colspan = admin ? 8 : 7;

  if (!itens.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}"
      style="text-align:center;padding:40px;color:var(--text-muted);">
      Nenhuma despesa para os filtros selecionados.</td></tr>`;
    return;
  }

  tbody.innerHTML = itens.map(it => {
    const isPago      = it.situacao.toLowerCase().includes('pago');
    const classTag    = isPago ? 's-pago' : 's-pendente';
    const labelStatus = isPago ? 'PAGO' : 'PENDENTE';
    const itEncoded   = encodeURIComponent(JSON.stringify(it));

    const btnDelete = admin
      ? `<td style="text-align:center;">
           <button onclick="confirmarDelete(${it.id},'${escHtml(it.descricao||it.nome)}')"
             title="Apagar despesa" class="icon-btn btn-delete">🗑️</button>
         </td>`
      : '';

    return `
      <tr data-id="${it.id}">
        <td class="td-date">${it.data||'—'}</td>
        <td class="td-cat">${it.nome||'—'}</td>
        <td class="td-desc">${it.descricao||'—'}</td>
        <td class="td-value">${formatCurrency(it.valor)}</td>
        <td><span class="status-badge ${classTag}">${labelStatus}</span></td>
        <td style="text-align:center;">
          <button onclick="baixarComprovantePDF(decodeURIComponent('${itEncoded}'))"
            title="Baixar comprovante PDF" class="icon-btn btn-pdf">📄</button>
        </td>
        <td style="text-align:center;">
          <button onclick="compartilharDespesa(decodeURIComponent('${itEncoded}'))"
            title="Compartilhar via WhatsApp" class="icon-btn btn-share">📤</button>
        </td>
        ${btnDelete}
      </tr>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 7. ADICIONAR DESPESA
// ─────────────────────────────────────────────
async function adicionarDespesa(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSalvar');
  btn.disabled = true; btn.textContent = 'Processando...';

  const bodyData = {
    data:      document.getElementById('add-data').value.trim(),
    nome:      document.getElementById('add-nome').value,
    descricao: document.getElementById('add-descricao').value.trim(),
    valor:     document.getElementById('add-valor').value.trim(),
    situacao:  document.getElementById('add-situacao').value,
  };

  try {
    const res  = await fetch('/api/despesas', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(bodyData),
    });
    const data = await res.json();
    if (!data.ok) throw new Error('Falha ao salvar na planilha');

    toast('Despesa lançada! Gerando comprovante...', 'ok');
    gerarComprovantePDF(bodyData);

    document.getElementById('add-descricao').value = '';
    document.getElementById('add-valor').value     = '';
    await carregarDespesas();
  } catch (err) {
    toast(`Erro: ${err.message}`, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '+ Adicionar Despesa';
  }
}

// ─────────────────────────────────────────────
// 8. DELETE (somente admin)
// ─────────────────────────────────────────────
function confirmarDelete(rowIndex, label) {
  if (!isAdmin()) return toast('Acesso negado.', 'err');
  if (!confirm(`Apagar "${label}"?\n\nRemove a linha da planilha permanentemente.`)) return;
  deletarDespesa(rowIndex);
}

async function deletarDespesa(rowIndex) {
  try {
    const token = localStorage.getItem("expedicao_token") || "";
    if (!token) {
      toast("Você precisa estar logado para deletar.", "err");
      return;
    }
    const res = await fetch(`/api/despesas/${rowIndex}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Falha ao deletar");

    const row = document.querySelector(`tr[data-id="${rowIndex}"]`);
    if (row) { row.style.transition = "opacity .25s"; row.style.opacity = "0"; }
    setTimeout(async () => carregarDespesas(), 300);
    toast("Despesa removida.", "ok");
  } catch (err) {
    toast(`Erro ao deletar: ${err.message}`, "err");
  }
}

// ─────────────────────────────────────────────
// 9. PDF
// ─────────────────────────────────────────────
function _preencherTemplate(dados) {
  const agora      = new Date();
  const dataEmissao= agora.toLocaleDateString('pt-BR') + ' ' +
                     agora.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
  const idDoc      = 'DEP-' + agora.getFullYear() +
                     String(agora.getMonth()+1).padStart(2,'0') +
                     String(agora.getDate()).padStart(2,'0') + '-' +
                     String(agora.getTime()).slice(-5);

  const valorNum = typeof dados.valor === 'number'
    ? dados.valor
    : parseFloat((dados.valor||'0').replace(/[R$\s]/g,'').replace(/\./g,'').replace(',','.')) || 0;

  document.getElementById('pdf-id-despesa').textContent    = 'Nº ' + idDoc;
  document.getElementById('pdf-data-emissao').textContent  = 'Emitido em: ' + dataEmissao;
  document.getElementById('pdf-campo-data').textContent      = dados.data      || '—';
  document.getElementById('pdf-campo-categoria').textContent = dados.nome      || '—';
  document.getElementById('pdf-campo-descricao').textContent = dados.descricao || '—';
  document.getElementById('pdf-campo-status').textContent    = dados.situacao  || '—';
  document.getElementById('pdf-campo-valor').textContent     =
    valorNum.toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
  return idDoc;
}

function gerarComprovantePDF(dados) {
  const idDoc = _preencherTemplate(dados);
  const el    = document.getElementById('pdf-comprovante');
  el.style.display = 'block';
  html2pdf().set({
    margin:10, filename:`Comprovante_${idDoc}.pdf`,
    image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2},
    jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
  }).from(el).save().then(() => {
    el.style.display = 'none';
    toast('Comprovante gerado!', 'ok');
  });
}

function baixarComprovantePDF(itJson) {
  const it = typeof itJson === 'string' ? JSON.parse(itJson) : itJson;
  gerarComprovantePDF(it);
}

// ─────────────────────────────────────────────
// 10. COMPARTILHAR VIA WHATSAPP
// ─────────────────────────────────────────────
async function compartilharDespesa(itJson) {
  const it       = typeof itJson === 'string' ? JSON.parse(itJson) : itJson;
  const valorFmt = (Number(it.valor)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const isPago   = (it.situacao||'').toLowerCase().includes('pago');

  const texto =
    `💰 *Despesa — Universo Compra Certa*\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `📅 Data: ${it.data||'—'}\n` +
    `🏷️ Categoria: ${it.nome||'—'}\n` +
    `📝 Descrição: ${it.descricao||'—'}\n` +
    `💵 Valor: *${valorFmt}*\n` +
    `Status: ${isPago ? '✅ PAGO' : '⏳ PENDENTE'}\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `_Expedição Pro · Universo Compra Certa_`;

  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (isMobile && navigator.share) {
    try {
      _preencherTemplate(it);
      const el = document.getElementById('pdf-comprovante');
      el.style.display = 'block';
      const blob = await html2pdf()
        .set({margin:10, html2canvas:{scale:2}, jsPDF:{unit:'mm',format:'a4'}})
        .from(el).outputPdf('blob');
      el.style.display = 'none';
      const file = new File([blob], `Despesa_${it.data||'sem-data'}.pdf`, {type:'application/pdf'});
      if (navigator.canShare?.({files:[file]})) {
        await navigator.share({title:'Comprovante de Despesa', text:texto, files:[file]});
        return;
      }
      await navigator.share({title:'Comprovante de Despesa', text:texto});
      return;
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('[compartilhar]', err);
    }
  }
  window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
function preencherDataHoje() {
  const campo = document.getElementById('add-data');
  if (!campo || campo.value) return; // não sobrescreve se já preenchido
  const hoje = new Date();
  const dd   = String(hoje.getDate()).padStart(2, '0');
  const mm   = String(hoje.getMonth() + 1).padStart(2, '0');
  const yyyy = hoje.getFullYear();
  campo.value = `${dd}/${mm}/${yyyy}`;
}

preencherDataHoje();
carregarDespesas();
