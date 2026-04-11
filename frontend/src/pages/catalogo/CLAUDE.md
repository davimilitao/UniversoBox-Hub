# CLAUDE.md — Módulo Catálogo

## Papel deste agente
Especialista em cadastro, enriquecimento e gestão de imagens de produtos — ponto de conexão entre o Bling (ERP) e os dados operacionais locais.

## Páginas do módulo

| Página | Função |
|--------|--------|
| `CatalogoPro.jsx` | Visão unificada do catálogo com score de completude e edição rápida |
| `AdminProdutos.jsx` | Enriquecimento local: bin, fotos (stock/bin/box), notas, embalagem usada |
| `ImageStudio.jsx` | Hub central de edição de imagens: crop, remoção de fundo, upload para Bling |
| `ImportarCSV.jsx` | Importação em massa via CSV exportado do Bling (com suporte a grades/variações) |
| `AutomacaoCadastro.jsx` | Cadastro e edição bidirecional com o Bling (lê e salva de volta no ERP) |

## Arquitetura Split Bling / Local (conceito central)

```
Bling ERP (products/{sku})          ← dados fiscais, logísticos, preço, imagens
product_overrides/{sku}             ← dados operacionais: bin, fotos locais, notas, insumos usados
```

O **SKU é a âncora** que une os dois mundos. O frontend mescla os dois no momento da exibição.

## Regras de negócio críticas

### SKU — regra inegociável
- Máximo 60 caracteres
- Sem espaços, `<`, `>` ou `:`
- Apenas alfanumérico + `_`, `-`, `.`
- SKU é a chave primária em `products`, `product_overrides`, `orders` e no Cloudinary
- Nunca criar produto sem validar o SKU primeiro

### Score de completude (CatalogoPro)
```
foto      → 25%
EAN/GTIN  → 20%
dimensões → 20%
preço     → 20%
peso      → 15%
```

### Tipos de foto por produto (AdminProdutos / ImageStudio)
- `stock` — foto real do produto (principal para marketplace)
- `bin` — foto da localização física (prateleira/gaveta)
- `box` — foto da embalagem usada
- Máximo 10 fotos por produto

### Cloudinary — estrutura de pastas
```
universobox-hub/{tenantId}/{sku}/
```
Nunca enviar imagem fora dessa estrutura — o SKU é usado para vincular imagem ao produto.

### Grade/Variações (ImportarCSV)
- Linha PAI (sem SKU): carrega nome e dados contextuais
- Linha FILHA (com SKU): se o nome for só composição (`Cor:Azul;Tamanho:G`), resolve como `{nomePai} — {composição legível}`
- Filha herda da pai: marca, imagens, dimensões (se vazia)

### Embalagem por produto (AdminProdutos)
Tolerância de encaixe: dimensão do produto ≤ dimensão da embalagem × 1.25

### AutomacaoCadastro — bidirecional com Bling
- Lê produto do Bling via SKU/EAN
- Edita localmente e salva de volta com `PUT /catalogo/produto/{id}`
- Imagens também são enviadas para o Bling

## APIs e endpoints usados

### Bling (via backend)
- `GET /catalogo/buscar?q={sku|ean|nome}` — busca produto
- `GET /catalogo/produto/{id}` — detalhe do produto
- `GET /catalogo/categorias` — lista de categorias do Bling
- `PUT /catalogo/produto/{id}` — salva produto de volta no Bling (AutomacaoCadastro)
- `POST /catalogo/produto/{id}/imagem` — envia imagem para o Bling

### Cloudinary (via backend)
- `POST /admin/save-photo-cloudinary/{sku}` — upload de foto; retorna URL pública

### Backend interno
- `GET /api/catalogo/produto/{id}` — thumbnail para BlingPedidos (Expedição usa isso)

## Coleções Firestore

| Coleção | Operação | Descrição |
|---------|----------|-----------|
| `products/{sku}` | Leitura + Escrita | Catálogo base sincronizado do Bling |
| `product_overrides/{sku}` | Leitura + Escrita | Enriquecimento local (fotos, bin, notas) |
| `embalagens/{id}` | Leitura | Embalagens disponíveis para matching |

## Impacto em outros módulos

- **Expedição depende de:** `product_overrides/{sku}.displayImage` (thumbnail nos pedidos) e `insumos` por produto (embalagem usada)
- **Financeiro usa:** dados de custo de produto para cálculo de margem
- Se o SKU mudar de formato → quebra `orders`, `product_overrides`, Cloudinary e Expedição

## Checklist antes de qualquer mudança

- [ ] A mudança afeta o SKU como chave? → verificar impacto em Expedição, Financeiro e Cloudinary
- [ ] A mudança afeta `product_overrides`? → verificar BlingPedidos (thumbnail) e AdminProdutos
- [ ] A mudança afeta upload de imagem? → testar Cloudinary + sincronização com Bling
- [ ] A mudança afeta o parsing de CSV? → testar com arquivo real exportado do Bling (incluindo grades)
- [ ] A mudança afeta `PUT /catalogo/produto/{id}`? → testar AutomacaoCadastro → salvar → buscar no Bling

## Próximos passos planejados

1. **Fusão AdminProdutos + AutomacaoCadastro em sistema de abas:** aba "Local" (product_overrides) + aba "Bling" (leitura/edição direta no ERP) — mesma tela, dois contextos
2. **Fluxo de recebimento de NF → cadastro:** ao receber item pela NF de entrada (Compras), abrir AdminProdutos para novos SKUs que ainda não existem localmente
3. **Empurrar imagens editadas de volta ao Bling:** ImageStudio já edita; falta o botão "Salvar no Bling" que chama `PUT /catalogo/produto/{id}` com as novas imagens
4. **CatalogoPro como central do item:** evoluir para mostrar dados de vendas (marketplace), expedição (saídas por dia) e custo de entrada (NF de compra)
