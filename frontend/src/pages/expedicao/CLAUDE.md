# CLAUDE.md — Módulo Expedição

## Papel deste agente
Especialista no fluxo diário de separação e envio de pedidos: da importação da NF no Bling até a etiqueta de envio impressa.

## Páginas do módulo

| Página | Função |
|--------|--------|
| `BlingPedidos.jsx` | Importa NFs de saída do Bling e clona como pedidos internos |
| `PedidosDoDia.jsx` | **CORE** — fila de separação diária com scanner, impressão DANFE e etiqueta |
| `GestaoInsumos.jsx` | Controle de estoque de insumos (embalagens, etiquetas térmicas) |
| `Compras.jsx` | Orquestrador 5 abas: Pedidos Abertos, Pedidos Fechados, A Caminho, Novo Pedido, Inteligência |
| `compras/AbaPedidosAbertos.jsx` | Pedidos manuais aguardando XML NF-e; botão "Importar XML" |
| `compras/AbaPedidosFechados.jsx` | Pedidos confirmados via NF-e; CTA para lançar no Financeiro |
| `compras/AbaACaminho.jsx` | Rastreio de itens em trânsito (extraído sem mudanças) |
| `compras/AbaMontarPedido.jsx` | Montar novo pedido com detecção de duplicatas entre pedidos abertos |
| `compras/AbaInteligencia.jsx` | Dashboard BI de compras (extraído sem mudanças) |
| `compras/ModalFecharComXml.jsx` | Upload XML NF-e → match de itens → confirmação e fechamento |
| `compras/ModalLancarFinanceiro.jsx` | Modal que abre FormLancarDespesa pré-preenchido com dados da NF |

## Regras de negócio críticas

### Pipeline de status (NUNCA alterar a sequência ou os nomes)
```
pending → picked → packed → expedited
```
Cada mudança de status grava `updatedAtMs` e `terminalId` no Firestore.

### Clonagem de NF
- Apenas NFs com DANFE autorizada podem ser clonadas
- A cloagem valida o SKU antes de criar o documento em `/orders`
- O ID do pedido interno é diferente do número da NF no Bling
- NFs já clonadas ficam no localStorage (`bling_clonados`) — não re-importar

### Detecção de marketplace
Feita pelo campo `clienteNome` da NF — padrão `(usuario.ml)` → Mercado Livre.
Se o parsing mudar, o roteamento de etiquetas de envio quebra.

### Insumos e embalagens
- Cada pedido consome insumos conforme produto (definido no módulo Catálogo)
- `estoque_minimo` em `insumos` dispara alerta visual (badge vermelho)
- Custo unitário é sempre calculado: `custo_aquisicao / quantidade_por_formato` (nunca entrada manual)

## APIs e endpoints usados

### Bling (via backend)
- `GET /bling/nfs` — lista NFs de saída autorizadas
- `POST /bling/clonar` — converte NF em pedido interno (`/orders`)
- `GET /bling/danfe/{nfId}` — busca PDF do DANFE
- `GET /bling/status` — verifica se token OAuth2 está ativo

### Mercado Livre (via backend)
- `GET /api/ml/orders/{mlOrderId}/label` — etiqueta de envio ML

### Backend interno
- `GET /orders` — lista pedidos pendentes
- `PATCH /orders/{id}/status` — atualiza status do pedido
- `POST /orders/{id}/scan` — associa código escaneado ao pedido
- `GET /orders/{id}/etiqueta-bin` — etiqueta ZPL para impressora térmica
- `GET /api/transit` — itens a caminho (módulo Compras)
- `PATCH /api/transit/{itemId}/received` — confirma recebimento

### Compras — reposição de estoque
- `GET /api/purchase-orders` — lista pedidos; suporta `?status=pending|fechado` (novo)
- `POST /api/compras` — cria pedido de reposição manual
- `POST /api/compras/parse-xml` — parseia XML NF-e; retorna `{nf, itens}` sem gravar nada
- `POST /api/compras/:id/fechar` — fecha pedido via NF-e: atualiza status, grava custoUnitario por item, incrementa `products.stock` via Firestore batch
- `PATCH /api/purchase-orders/:id` — atualização segura de metadados (`finDespesaId`, `notas`)

## Coleções Firestore

| Coleção | Operação | Descrição |
|---------|----------|-----------|
| `orders/{id}` | Leitura + Escrita | Pedidos internos de separação |
| `insumos/{id}` | Leitura + Escrita | Estoque de insumos |
| `purchase_orders/{id}` | Leitura + Escrita | Pedidos de reposição — campos-chave abaixo |
| `products/{sku}` | Escrita (increment) | `stock` incrementado ao fechar pedido via XML NF-e |
| `bling_tokens/main` | Leitura (via backend) | Token OAuth2 do Bling |

### Campos de `purchase_orders` adicionados na v2.0.0

| Campo | Tipo | Quando |
|-------|------|--------|
| `status` | `'pending'\|'fechado'` | criação / fechamento |
| `valorTotal` | `number` | fechamento via XML |
| `fornecedor` | `string` | fechamento via XML |
| `fornecedorCnpj` | `string` | fechamento via XML |
| `notaFiscalNumero` | `string` | fechamento via XML |
| `notaFiscalSerie` | `string` | fechamento via XML |
| `dataFechamento` | `number` (ms) | fechamento via XML |
| `finDespesaId` | `string\|null` | lançamento no Financeiro |
| `items[n].custoUnitario` | `number` | fechamento via XML (match por SKU) |

## Integrações de hardware
- **QZ Tray** — necessário para impressão de etiqueta ZPL em impressora térmica (Zebra)
- **Câmera** — scanner de código de barras via ZXing (requer permissão do navegador)
- **Áudio** — beep de confirmação/erro no scanner

## Checklist antes de qualquer mudança

- [ ] A mudança afeta os nomes dos campos em `/orders`? → verificar `PedidosDoDia.jsx` e `BlingPedidos.jsx`
- [ ] A mudança afeta o endpoint `/bling/clonar`? → testar todo o fluxo de importação de NF
- [ ] A mudança afeta o parsing de `clienteNome`? → testar detecção de marketplace (ML, Shopee, Magalu)
- [ ] A mudança afeta o módulo Catálogo? → `product_overrides` e insumos por SKU podem ser impactados
- [ ] A mudança afeta impressão? → testar DANFE e etiqueta ZPL com QZ Tray real

**`PedidosDoDia.jsx` é a operação crítica do negócio — qualquer alteração deve ser testada manualmente antes de ir para produção.**

## Integrações entre módulos (v2.0.0)

### Expedição → Financeiro
- Ao fechar um pedido via XML, o botão **"Lançar no Financeiro"** abre `ModalLancarFinanceiro`
- O modal usa `FormLancarDespesa` com `initialValues` pré-preenchido (fornecedor, valor, NF)
- Após confirmação: `POST /api/fin-despesas` cria despesa tipo `investimento` na categoria `'Compras de Mercadoria'`
- `PATCH /api/purchase-orders/:id` grava `finDespesaId` linkando os dois registros
- Despesa tipo `investimento` gera parcelas automaticamente em `fin_parcelas` (aparece em Contas.jsx)

### Expedição → Catálogo
- `POST /api/compras/:id/fechar` incrementa `products.stock` via Firestore batch para cada SKU com match no XML
- Produtos que tinham `stock === 0` (ruptura) saem automaticamente da listagem de ruptura do Catálogo
- Itens do XML sem match de SKU exibem CTA "Cadastrar no catálogo" → link para `/spa/catalogo/admin`

### Detecção de duplicatas (Compras → Compras)
- `AbaMontarPedido` carrega pedidos abertos e constrói mapa `{sku: [{pedidoId, qty}]}`
- Badge laranja com tooltip CSS puro indica SKUs já presentes em pedidos abertos
- Não bloqueia adição — apenas avisa

## Próximos passos planejados

1. ~~**Tela de Compras — Nota Fiscal de Entrada (XML)**~~ ✅ Implementado em 2026-04-12
2. ~~**Link Compras → Catálogo**~~ ✅ Implementado via CTA + auto-increment de stock em 2026-04-12
3. **Alertas de insumos:** cruzar consumo por pedido com estoque atual para gerar sugestão automática de reposição
