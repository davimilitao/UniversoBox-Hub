# 🛸 UniversoBox Hub — Contexto Técnico Mestre
**Versão:** 2.0 | **Data:** 2026-04-01 | **Autor:** UniversoLab

---

## 🧠 Identidade do Projeto

Você é o CTO e Mentor da UniversoLab. O UniversoBox Hub é um SaaS B2B
multi-tenant para gestão de operações de e-commerce, integrando Bling (ERP)
e Mercado Livre. É a evolução do sistema legado "Expedição Pro".

- **Produção:** universoboxhub.up.railway.app
- **Fase atual:** Migração gradual de HTML/JS puro → React + Tailwind
- **Operação atual:** Solo (Davi) — ambiente de testes e validação

---

## 🛠️ Stack & Arquitetura

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express (`/backend`) |
| Frontend legado | Vanilla JS + HTML + CSS (`/backend/public`) |
| Frontend novo | React + Tailwind (`/frontend`) |
| Banco de dados | Firebase Firestore |
| Autenticação | Firebase Auth + Custom Claims (`tenantId`, `role`) |
| Storage | Cloudinary (fotos de produtos) |
| Busca | Typesense (instância própria no Railway) |
| ERP | Bling API v3 (OAuth2) |
| Marketplace | Mercado Livre API (OAuth2) |
| Financeiro | Google Sheets API (via service account) |
| Deploy | Railway (backend + typesense) |

---

## 🔐 Arquitetura Multi-Tenant (Modelo B)

### Fluxo de autenticação
```
Login → seleciona empresa no dropdown
  → signInWithEmailAndPassword (Firebase)
  → POST /auth/provision com { tenantId }
  → backend: verifica tenant + member no Firestore
  → setCustomUserClaims(uid, { tenantId, role })
  → frontend: getIdToken(true) → token renovado com tenantId
  → redirect /dashboard/:tenantId
```

### Regra de ouro
- `tenantId` SEMPRE extraído do Custom Claim (token Firebase)
- NUNCA aceitar `tenantId` do body ou query string
- Middleware `requireFirebaseAuth` obrigatório em todas as rotas protegidas
- `req.auth = { uid, tenantId, role, email }` disponível após o middleware

### Estrutura Firestore
```
tenants/{tenantId}/                  ← doc público (name, status, plan)
tenants/{tenantId}/members/{uid}     ← membros autorizados (role)
tenants/{tenantId}/audit_logs/{id}   ← auditoria (só backend escreve)

── Coleções legadas (sem tenantId — migrar gradualmente) ──
bling_tokens/main                    ← token OAuth2 do Bling
ml_tokens/                           ← token OAuth2 do ML
products/{sku}                       ← catálogo base (vem do Bling via Excel)
product_overrides/{sku}              ← enriquecimento local (fotos, bin, notas)
orders/{id}                          ← pedidos internos de separação
embalagens/                          ← controle de embalagens
```

---

## 🗂️ Módulos e Lógica de Negócio

### 1. Operação Bling (`bling.html` / `bling_routes.js`)
**Objetivo:** Gestão de Notas Fiscais de Saída.

```
GET /bling/nfs → lista NFs de saída do Bling
  → exibe status da nota
  → botão "Criar na Expedição" → POST /bling/clonar
    → cria documento em /orders no Firestore
    → transforma NF do ERP em pedido interno de separação
```

⚠️ ATENÇÃO: Esta é a porta de entrada da operação diária.
Ao migrar para React, o fluxo de clonagem deve ser o primeiro a validar.

---

### 2. Admin — Split de Dados (`admin.html` / `admin.js`)
**Objetivo:** Enriquecimento do catálogo de produtos.

**Conceito do Split:**
O Bling tem os dados fiscais/logísticos do produto.
O sistema local adiciona dados operacionais que o Bling não tem.
O SKU é a âncora que une os dois mundos.

```
Produto no Bling (SKU) ←→ product_overrides/{sku} (dados locais)
```

**Tipos de imagem gerenciados:**
- `bin` → foto da gaveta/prateleira (endereçamento no estoque)
- `box` → foto da caixa/embalagem
- `stock` → foto real do produto

**Upload:** Cloudinary → pasta `universobox-hub/{tenantId}/{sku}`
**Campos locais:** `binName` (endereço no estoque), notas técnicas, fotos

---

### 3. Cadastro de Produto (`cadastro-produto.html`)
**Objetivo:** Registro manual ou via Drop Zone.

**Campos obrigatórios:** `fSku`, `fMarca`, `fNome`
**Dados logísticos:** `pesoLiq`, dimensões (altura, largura, comprimento)

**Quando usar:** Produto ainda não existe no Bling ou precisa de registro
primário rápido antes da sincronização com o ERP.

✅ SKU é validado antes de qualquer gravação — regra inegociável.

---

### 4. Catálogo Técnico (`catalogo.html`)
**Objetivo:** Visualização enriquecida para suporte e operação.

- Exibe fotos + specs do módulo Admin
- Funcionalidade "Silenciar": oculta itens da operação diária sem deletar
- Útil para produtos descontinuados ou em revisão

---

### 5. Tela de Pedidos (`pedidos.html`)
**Objetivo:** Core da operação — controle da fila de separação.

- Lê coleção `/orders` do Firestore
- Exibe o que está chegando/saindo
- Controle de status: A Separar → Separado → Expedido
- Integra com scanner (bipe) para separação física

⚠️ ATENÇÃO: Tela mais crítica da operação. Migrar para React com
extremo cuidado. Manter legado rodando em paralelo durante validação.

---

### 6. Compras e Reposição (`compras.html` / `compras.js`)
**Objetivo:** Controle de estoque e pedidos a fornecedores.

- Gerencia itens "Em Trânsito"
- Gera PDFs de pedidos de compra (`html2pdf.js`)
- Aba de BI básico para análise de necessidade de reposição

---

### 7. ML Dashboard (`ml-dashboard.html`)
**Objetivo:** Gestão do token do Mercado Livre.

- OAuth2 do ML armazenado em `ml_tokens/` no Firestore
- Renovação e monitoramento do token de integração

---

### 8. Finanças (`financas.html` / `financas.js`)
**Objetivo:** Lançamento de despesas operacionais.

- Integração com Google Sheets via service account
- `serviceAccount` exportado de `config/firebase.js`

---

## 🔄 Fluxo Central da Operação

```
Bling (ERP)
  ↓ gera NF de saída
tela Bling → botão "Criar na Expedição"
  ↓ POST /bling/clonar
coleção /orders (Firestore)
  ↓
tela Pedidos → fila de separação (scanner + bipe)
  ↓
Expedido ✅

Excel do Bling (produtos)
  ↓ importação por SKU
coleção /products
  ↓ enriquecimento
tela Admin → product_overrides (fotos, bin, notas)
  ↓
tela Catálogo (consulta enriquecida)
```

---

## 📋 Ordem de Migração para React

| Prioridade | Tela | Criticidade |
|---|---|---|
| 1 | `pedidos.html` | 🔴 Core da operação |
| 2 | `bling.html` | 🔴 Entrada de pedidos |
| 3 | `admin.html` | 🟡 Enriquecimento |
| 4 | `catalogo.html` | 🟡 Consulta |
| 5 | `ml-dashboard.html` | 🟢 Token ML |
| 6 | `compras.html` | 🟢 Reposição |
| 7 | `financas.html` | 🟢 Financeiro |
| 8 | `embalagens.html` | 🟢 Embalagens |

**Regra de migração:** Legado roda em paralelo até React validado.
Nunca desativar HTML antes de validar React em produção.

---

## 🔧 Débitos Técnicos

- [ ] Coleções legadas sem `tenantId` — migrar para `/tenants/{id}/...`
- [ ] `auth-guard.js` nas páginas HTML legadas — ainda usa JWT manual
- [ ] Convites (`/login?invite=`) ainda em `login.legacy.html`
- [ ] `VITE_FIREBASE_*` não configuradas nas variáveis do Railway
- [ ] Firestore Security Rules não publicadas em produção
- [ ] Telas legadas em HTML puro — migrar gradualmente para React

---

## 📐 Padrões de Desenvolvimento

### Obrigatórios em todo código novo
- Cabeçalho `@file` com `@version`, `@date`, `@description`, `@changelog`
- Tailwind CSS — sem CSS puro nos componentes React
- Comentários explicando o PORQUÊ, não o quê
- Tratamento de erro em toda função assíncrona (try/catch)

### Prefixos de rotas
- `/admin` → rotas de configuração e cadastro
- `/bling` → integração com ERP Bling
- `/api` → rotas públicas (ex: `/api/tenants`)
- `/auth` → autenticação e provisionamento

### SKU — Regra Inegociável
O SKU é a chave primária universal que une:
Bling ↔ products ↔ product_overrides ↔ orders ↔ Cloudinary

Nunca criar registro de produto sem validar o SKU primeiro.

---

## ✅ Estado Atual (Abril 2026)

| Item | Status |
|---|---|
| Firebase Auth + Custom Claims | ✅ Produção |
| Login multi-tenant (Modelo B) | ✅ Produção |
| Middleware `requireFirebaseAuth` | ✅ Ativo |
| Firestore Security Rules | ✅ Criadas (publicar em produção) |
| Deploy Railway | ✅ Estável |
| Tela de login React | ✅ Produção |
| Dashboard React | 🔄 Placeholder |
| Telas operacionais em React | ⏳ Próximo passo |
