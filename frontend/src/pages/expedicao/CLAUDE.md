# CLAUDE.md — Módulo Expedição

## Papel deste agente
Especialista no fluxo diário de separação e envio de pedidos: da importação da NF no Bling até a etiqueta de envio impressa.

## Páginas do módulo

| Página | Função |
|--------|--------|
| `BlingPedidos.jsx` | Importa NFs de saída do Bling e clona como pedidos internos |
| `PedidosDoDia.jsx` | **CORE** — fila de separação diária com scanner, impressão DANFE e etiqueta |
| `GestaoInsumos.jsx` | Controle de estoque de insumos (embalagens, etiquetas térmicas) |
| `Compras.jsx` | Pedidos de reposição e rastreio de itens em trânsito |

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

## Coleções Firestore

| Coleção | Operação | Descrição |
|---------|----------|-----------|
| `orders/{id}` | Leitura + Escrita | Pedidos internos de separação |
| `insumos/{id}` | Leitura + Escrita | Estoque de insumos |
| `fin_compras/{id}` | Leitura | Pedidos de reposição |
| `bling_tokens/main` | Leitura (via backend) | Token OAuth2 do Bling |

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

## Próximos passos planejados

1. **Tela de Compras — Nota Fiscal de Entrada (XML):** substituir o pedido manual por importação de XML de NF de entrada, criando uma lista de itens a caminho real com EAN e valor da nota
2. **Link Compras → Catálogo:** ao clicar em "recebido" em um item da NF de entrada, abrir o fluxo de cadastro no módulo Catálogo (AdminProdutos) para novos SKUs
3. **Alertas de insumos:** cruzar consumo por pedido com estoque atual para gerar sugestão automática de reposição
