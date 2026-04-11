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
| `fin_compras/{id}` | Leitura + Escrita | Pedidos de reposição de estoque |
| `fin_parcelas/{id}` | Leitura + Escrita | Parcelas geradas das compras |
| `fin_meios_pagamento/{id}` | Leitura + Escrita | Cartões e métodos de pagamento |

## Impacto em outros módulos

- **Expedição (Compras):** `fin_compras` é compartilhada — mudanças de schema afetam ambos
- **Catálogo:** custo de entrada do produto (NF de compra) virá aqui quando o fluxo XML for implementado
- Se Google Sheets ficar indisponível → PainelFinanceiro, GestaoDespesas e GestaoMargem retornam vazio (sem fallback local)

## Checklist antes de qualquer mudança

- [ ] A mudança afeta `fin_parcelas`? → verificar cálculo de limite de cartão e Contas.jsx
- [ ] A mudança afeta `GET /api/despesas`? → verificar PainelFinanceiro e GestaoDespesas
- [ ] A mudança afeta o schema de `fin_compras`? → verificar o módulo Expedição (Compras.jsx)
- [ ] A mudança afeta a coluna `situacao` do Sheets? → verificar filtros de pago/pendente
- [ ] A mudança afeta a formatação de moeda (BRL)? → verificar todos os gráficos Recharts

## Próximos passos planejados

1. **Contas a pagar via NF XML de entrada:** quando o fluxo XML de compra (Expedição → Compras) for implementado, as parcelas serão geradas automaticamente a partir do XML, não entrada manual
2. **Filtros de dados mais dedicados à visão do negócio:** substituir filtros genéricos por filtros centrados na operação diária (ex: "compras da semana", "despesas por canal")
3. **Painel de margem com dados reais de venda:** cruzar dados de venda do Bling/ML com custo de entrada para margem por SKU
