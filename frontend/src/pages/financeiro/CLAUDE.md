# CLAUDE.md — Módulo Financeiro

## Papel deste agente
Especialista em despesas, contas a pagar, análise de margem e BI financeiro — integra Google Sheets (despesas) com Firestore (compras e parcelas).

## Páginas do módulo

| Página | Função |
|--------|--------|
| `PainelFinanceiro.jsx` | Dashboard BI: resumo mensal de despesas com gráficos (barras + pizza) |
| `GestaoDespesas.jsx` | Lançamento e filtro de despesas (fonte: Google Sheets) |
| `Contas.jsx` | Contas a pagar: parcelas de compras com urgência e pagamento em lote |
| `GestaoMargem.jsx` | Análise de margem bruta e líquida ao longo do tempo |

## Fontes de dados (duas, independentes)

### Google Sheets — despesas operacionais
- Fonte de verdade para todas as despesas (`/api/despesas`)
- Service account do Firebase tem acesso de Editor
- Colunas obrigatórias: `data` (DD/MM/YYYY), `nome` (categoria), `valor`, `situacao` (pago/pendente)
- Categorias NÃO são hardcoded — extraídas dinamicamente da coluna `nome`
- Aba separada `Margem` para dados de margem bruta/líquida

### Firestore — compras e parcelas
- `fin_compras/{id}` — pedidos de reposição de estoque
- `fin_parcelas/{id}` — parcelas geradas automaticamente das compras
- `fin_meios_pagamento/{id}` — cartões/métodos com limite e dia de vencimento

## Regras de negócio críticas

### Geração automática de parcelas (fin_parcelas)
Ao criar uma compra em `fin_compras`:
- N parcelas geradas com `vencimento` calculado a partir de `meioId.diaVencimento`
- Juros simples aplicados se `taxaMensal > 0`
- Centavos de arredondamento vão para a última parcela
- Nunca editar parcelas individualmente — sempre recriar via compra

### Urgência de vencimento (Contas.jsx)
```
dias < 0    → vermelho   (vencida)
dias === 0  → laranja    (hoje)
dias <= 3   → amarelo    (chegando)
dias > 3    → normal     (ok)
```

### Limite de cartão
- Diminui quando parcela é criada (valor comprometido)
- Aumenta quando parcela é marcada como paga
- Nunca alterar o limite diretamente — flui pelas parcelas

### Categorias de despesa
- Totalmente data-driven — não existe lista fixa no código
- Para adicionar categoria: basta usar um nome novo no Google Sheets
- Filtros do frontend extraem valores únicos da coluna `nome`

### Compartilhamento WhatsApp (Contas.jsx)
Formato fixo ao copiar seleção de contas:
```
*Contas selecionadas*
• Fornecedor (x/n) — Descrição | R$ valor | DD/MM | Meio
*Total: R$ total*
```
Não alterar este formato sem combinar com o time.

## APIs e endpoints usados

### Google Sheets (via backend — service account)
- `GET /api/despesas` — lista despesas com filtros opcionais de mês
- `POST /api/despesas` — appenda nova linha na planilha
- `GET /api/margem` — lê aba "Margem" para dados de margem bruta/líquida

### Firestore (hooks customizados)
- `useCompras()` — escuta `fin_compras` em tempo real
- `useDespesas()` — fetch via `/api/despesas` (não Firestore)
- `useMeiosPagamento()` — escuta `fin_meios_pagamento` em tempo real

## Coleções Firestore

| Coleção | Operação | Descrição |
|---------|----------|-----------|
| `fin_despesas/{id}` | Leitura + Escrita | **Nova** — despesas com comprovante (banco primário) |
| `fin_compras/{id}` | Leitura + Escrita | Pedidos de reposição de estoque / investimentos parcelados |
| `fin_parcelas/{id}` | Leitura + Escrita | Parcelas geradas das compras |
| `fin_meios_pagamento/{id}` | Leitura + Escrita | Cartões e métodos de pagamento |

## Schema: fin_despesas (novo — 11/04/2026)

```javascript
{
  data: Timestamp,
  tipo: 'mensal_fixa' | 'operacional' | 'investimento',
  categoria: string,        // 'Hosting/TI', 'ADS', 'Logística', etc.
  fornecedor: string,
  descricao: string,
  valor: number,
  situacao: 'pago' | 'pendente',
  meioId: string | null,
  compraId: string | null,  // preenchido se tipo === 'investimento'
  comprovante: {
    tipo: 'boleto' | 'pix' | 'transferencia' | 'manual',
    codigoAutenticacao: string,
    banco: string, dataOriginal: string, arquivo: string,
  } | null,
  tenantId: string, uid: string, createdAt: Timestamp,
}
```

**Skill:** `/comprovante` — lê PDF em `C:\Users\milit\comprovantes\` e lança automaticamente.
**Planilha local:** `C:\Users\milit\controle-financeiro-universobox.xlsx`
**Tipo Investimento:** cria `fin_compras` + `fin_parcelas` automaticamente (aparece em Contas.jsx).

## Novos endpoints (backend/server.js)

- `POST /api/fin-despesas` — lança no Firestore; se investimento, cria parcelas em lote
- `GET /api/fin-despesas` — lista com filtros `?tipo=`, `?categoria=`, `?mes=YYYY-MM`

Os endpoints `/api/despesas` (Google Sheets) continuam funcionando durante a transição.

## Impacto em outros módulos

- **Expedição → Financeiro (novo — 2026-04-12):** `ModalLancarFinanceiro` em `compras/` chama `POST /api/fin-despesas` diretamente com tipo `investimento` e categoria `'Compras de Mercadoria'`. O `finDespesaId` retornado é gravado em `purchase_orders/{id}` via `PATCH /api/purchase-orders/:id`.
- **`FormLancarDespesa` agora aceita `initialValues`:** prop opcional (default `{}`) que pré-preenche o formulário — qualquer caller existente não é afetado.
- **`fin_compras` vs `fin_despesas`:** o fluxo de compras da Expedição usa `fin_despesas` (tipo `investimento`), não `fin_compras` diretamente. Mudanças no schema de `fin_despesas` afetam o modal.
- **Contas.jsx:** investimentos tipo `investimento` lançados pela Expedição aparecem aqui automaticamente (via `fin_parcelas`).
- Se Google Sheets ficar indisponível → PainelFinanceiro e GestaoMargem retornam vazio (sem fallback).

## Checklist antes de qualquer mudança

- [ ] A mudança afeta `fin_despesas`? → verificar skill `/comprovante` e endpoints novos
- [ ] A mudança afeta `fin_parcelas`? → verificar cálculo de limite de cartão e Contas.jsx
- [ ] A mudança afeta `GET /api/despesas`? → verificar PainelFinanceiro e GestaoDespesas (legado)
- [ ] A mudança afeta o schema de `fin_compras`? → verificar Expedição (Compras.jsx)
- [ ] A mudança afeta formatação de moeda (BRL)? → verificar todos os gráficos Recharts

## Próximos passos planejados

1. Migrar GestaoDespesas para consumir `fin_despesas` (Firestore) em vez de Google Sheets
2. ~~Contas a pagar via NF XML de entrada~~ ✅ Expedição lança investimento via XML NF-e (2026-04-12)
3. Filtros dedicados à visão do negócio (por tipo, por categoria, semana atual)
4. Painel de margem com dados reais de venda: cruzar Bling/ML com custo de entrada por SKU
