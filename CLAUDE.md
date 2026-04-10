# UniversoBox Hub — Contexto Técnico para o Claude Code (v2.0)

> **Leia este arquivo inteiro antes de qualquer ação.**
> Ele define as regras absolutas do projeto. Violá-las pode quebrar o isolamento entre clientes.

---

## 🎯 Missão do Projeto

SaaS multi-tenant para e-commerce que integra **Bling ERP** e **Mercado Livre**.
Cada cliente (tenant) opera em isolamento completo de dados dentro da mesma infraestrutura Firebase.

Produto anterior: `Expedição Pro` (monolítico, single-tenant)
Produto atual: `UniversoBox Hub` (SaaS, multi-tenant, escalável)

---

## 🛠️ Stack Técnica

| Camada        | Tecnologia                          | Status          |
|---------------|-------------------------------------|-----------------|
| Backend       | Node.js 18+ / Express               | ✅ Ativo         |
| Frontend      | React 18 + Tailwind CSS + Vite      | ✅ Ativo         |
| Banco         | Firebase Firestore                  | ✅ Ativo         |
| Auth          | Firebase Authentication             | ✅ Ativo         |
| Storage       | Firebase Storage (imagens)          | ✅ Ativo         |
| ERP           | Bling API v3 (OAuth2)               | ✅ Ativo         |
| Marketplace   | Mercado Livre API                   | 📋 Planejado     |

---

## 📁 Estrutura de Pastas

```
universobox-hub/
│
├── backend/                        # Servidor Node.js/Express
│   ├── server.js                   # Entry point — inicializa Express e rotas
│   ├── firebase-admin.js           # Inicialização do Firebase Admin SDK
│   │
│   ├── routes/
│   │   ├── bling_routes.js         # Todas as rotas /bling/* (NFs, clone, OAuth)
│   │   ├── admin_routes.js         # Rotas /admin/* (config, catálogo, uploads)
│   │   ├── compras_routes.js       # Rotas /compras/* (pedidos, trânsito, BI)
│   │   └── auth_routes.js          # Rotas /auth/* (login, refresh, claims)
│   │
│   ├── middleware/
│   │   ├── requireFirebaseAuth.js  # Valida token Firebase + extrai tenantId
│   │   ├── requireRole.js          # Valida customClaims (admin, operator, viewer)
│   │   └── tenantScope.js          # Injeta tenantId em req para queries Firestore
│   │
│   └── utils/
│       ├── firestore.js            # Helpers de query com tenantId obrigatório
│       ├── bling-client.js         # Cliente HTTP para Bling API (com token por tenant)
│       └── sku-validator.js        # Valida e normaliza SKUs antes de gravar
│
├── frontend/                       # React SPA (Vite)
│   ├── src/
│   │   ├── pages/                  # 24 páginas React (Pedidos, Financeiro, Catálogo, etc)
│   │   ├── components/             # 28 componentes reutilizáveis (AppShell, ImageEditor, etc)
│   │   ├── hooks/                  # Custom hooks (usePerfil, useAuth, useFirestore)
│   │   ├── utils/                  # Helpers (API client, normalizers, validators)
│   │   └── App.jsx                 # Root component com routing
│   ├── vite.config.js              # Dev server config (proxy para backend:8080)
│   ├── tailwind.config.js          # Tailwind CSS setup
│   └── public/                     # Assets estáticos
│
├── CLAUDE.md                       # ← Este arquivo
└── .env.example                    # Variáveis de ambiente necessárias
```

---

## 🗄️ Modelo de Dados — Firestore

### Regra absoluta de isolamento:
```
/tenants/{tenantId}/               ← RAIZ de todos os dados de um cliente
    orders/{orderId}
    products/{sku}
    purchases/{purchaseId}
    config/bling                   ← tokens OAuth do Bling deste tenant
    config/mercadolivre            ← tokens do ML deste tenant
```

### Schema: `orders` (pedido interno de separação)
```js
{
  tenantId: "string",          // OBRIGATÓRIO — nunca omitir
  sku: "string",               // Chave de integração com Bling e catálogo
  nfNumero: "string",          // Número da NF de origem no Bling
  status: "pending|picking|done|cancelled",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  operatorId: "string",        // uid do Firebase Auth do operador
  items: [
    {
      sku: "string",
      nome: "string",
      quantidade: number,
      binName: "string"        // endereço no estoque (ex: "A-12-3")
    }
  ]
}
```

### Schema: `products` (catálogo interno)
```js
{
  tenantId: "string",          // OBRIGATÓRIO
  sku: "string",               // PRIMARY KEY de integração — nunca duplicar
  fMarca: "string",
  fNome: "string",
  pesoLiq: number,             // em gramas
  dimensoes: {
    altura: number,
    largura: number,
    profundidade: number       // em cm
  },
  binName: "string",           // endereço no estoque
  silenciado: boolean,         // se true, não aparece na operação diária
  imagens: {
    bin: "string|null",        // URL Firebase Storage — foto da gaveta
    box: "string|null",        // URL Firebase Storage — foto da embalagem
    stock: "string|null"       // URL Firebase Storage — foto real do produto
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Schema: `config/bling` (OAuth por tenant)
```js
{
  accessToken: "string",       // Token atual Bling API v3
  refreshToken: "string",      // Para renovação automática
  expiresAt: Timestamp,        // Quando o accessToken expira
  clientId: "string",
  clientSecret: "string"       // Armazenar criptografado
}
```

---

## 🔐 Fluxo de Autenticação

### Como o tenantId chega no backend:
```
1. Usuário faz login via Firebase Auth (frontend)
2. Firebase retorna idToken JWT com customClaims: { tenantId, role }
3. Frontend envia idToken no header: Authorization: Bearer {idToken}
4. Middleware requireFirebaseAuth decodifica e injeta em req.user
5. Middleware tenantScope injeta req.tenantId para uso nas rotas
```

### Middleware obrigatório em toda rota sensível:
```js
// Exemplo de rota protegida — SEMPRE nesta ordem
router.get('/orders',
  requireFirebaseAuth,    // 1. Valida token
  requireRole('operator'), // 2. Valida role (admin | operator | viewer)
  tenantScope,             // 3. Injeta tenantId
  async (req, res) => {
    // req.tenantId já está disponível e validado
    const orders = await db
      .collection(`tenants/${req.tenantId}/orders`)
      .get();
  }
);
```

### Roles disponíveis:
| Role       | Permissões                                          |
|------------|-----------------------------------------------------|
| `admin`    | Tudo — configurações, usuários, tokens Bling        |
| `operator` | Operação diária — NFs, separação, compras           |
| `viewer`   | Somente leitura — catálogo e relatórios             |

---

## 🔗 Integração Bling API v3

### Base URL:
```
https://api.bling.com.br/Api/v3/
```
**Nota:** Migrado de `www.bling.com.br` em Abril/2026. Versão antiga está deprecated.

### Como usar o cliente (nunca fazer fetch direto nas rotas):
```js
// utils/bling-client.js — sempre usar esta função
const blingClient = require('../utils/bling-client');

// O cliente busca o token do tenant automaticamente no Firestore
const nfs = await blingClient.get(req.tenantId, '/notasfiscais', {
  params: { situacao: 'Autorizado', pagina: 1 }
});
```

### Endpoints principais já integrados:
- `GET /notasfiscais` — lista NFs de saída
- `GET /notasfiscais/{id}` — detalhe de uma NF
- `POST /pedidosvendas` — clonar pedido (origem do "Criar na Expedição")

### Fluxo "Criar na Expedição":
```
NF no Bling → POST /bling/clonar → valida SKU → grava em /tenants/{id}/orders
```

---

## 📋 Regras de Desenvolvimento (Mandatórias)

### 1. Isolamento de dados — regra número 1
```js
// ❌ NUNCA FAZER — query sem tenantId
db.collection('orders').where('status', '==', 'pending')

// ✅ SEMPRE FAZER — collection scoped por tenant
db.collection(`tenants/${tenantId}/orders`).where('status', '==', 'pending')
```

### 2. SKU é sagrado
```js
// Antes de qualquer gravação de produto:
const { valid, normalized } = await skuValidator.validate(sku);
if (!valid) throw new Error(`SKU inválido: ${sku}`);
// Usar sempre o `normalized` para gravar
```

### 3. Padrão de resposta das rotas Express
```js
// Sucesso
res.json({ success: true, data: resultado });

// Erro operacional (ex: SKU não encontrado)
res.status(400).json({ success: false, error: 'SKU não encontrado', code: 'SKU_NOT_FOUND' });

// Erro de autenticação
res.status(401).json({ success: false, error: 'Não autorizado', code: 'UNAUTHORIZED' });

// Erro de servidor — nunca expor stack trace ao cliente
res.status(500).json({ success: false, error: 'Erro interno', code: 'INTERNAL_ERROR' });
```

### 4. Nomenclatura
- Variáveis e funções: `camelCase`
- Componentes React: `PascalCase`
- Arquivos de componentes: `PascalCase.jsx`
- Arquivos de rotas e utils: `kebab-case.js`
- Collections Firestore: `camelCase` plural (`orders`, `products`, `purchases`)
- Campos do Firestore: `camelCase`

### 5. Prefixos de rotas
```
/bling/*   → integração com Bling ERP
/admin/*   → configurações e catálogo (role: admin)
/compras/* → gestão de estoque e pedidos (role: operator)
/auth/*    → autenticação e gestão de usuários
```

---

## 🔄 Status da Migração React

**Migração completa!** (Abril/2026)

Todas as telas HTML legado foram removidas. O projeto agora é 100% React SPA com:

| Página | Rota | Status |
|--------|------|--------|
| Pedidos | `/expedicao/pedidos` | ✅ Ativa |
| Financeiro | `/financeiro/despesas` | ✅ Ativa |
| Catálogo Pro | `/catalogo/produtos` | ✅ Ativa |
| Automação | `/catalogo/automacao` | ✅ Ativa |
| Compras | `/compras` | ✅ Ativa |
| Admin (Config) | `/admin/config` | ✅ Ativa |

### Convenções atuais:
- Todos os componentes usam **Tailwind CSS** (sem CSS custom)
- `BrowserRouter` com `basename` dinâmico (dev: `/`, prod: `/spa/`)
- Auth via `usePerfil()` hook com `onAuthStateChanged` do Firebase
- Vite dev proxy roteia `/api`, `/bling`, `/auth`, `/admin` para backend:8080

---

## ⚙️ Comandos de Desenvolvimento

```bash
# Backend (na pasta backend/)
npm install
npm start                  # Inicia em localhost:8080

# Frontend (na pasta frontend/)
npm install
npm run dev               # Vite dev server em localhost:5173 (proxy para :8080)
npm run build             # Build para production (output: backend/public/spa/)

# Em produção (Railway):
# Backend serve tanto SPA quanto APIs
# - /spa/* → frontend (React SPA)
# - /api/* → endpoints da API
# - /bling/* → integração Bling
# - /admin/* → rotas admin
```

### Variáveis de ambiente necessárias (.env)
```
# Firebase (escolha um dos dois formatos)
FIREBASE_SERVICE_ACCOUNT_JSON={...}  ou  FIREBASE_SERVICE_ACCOUNT_PATH=keys/firebase-service-account.json
ADMIN_RESET_TOKEN=

# Bling OAuth
BLING_CLIENT_ID=
BLING_CLIENT_SECRET=
BLING_REDIRECT_URI=https://seu-dominio.com/bling/callback

# Cloudinary (para upload de imagens)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# API Keys
ANTHROPIC_API_KEY=
TOKEN_SECRET=
```

---

## 📝 Log de Evolução do Projeto

> O Claude deve adicionar uma entrada aqui toda vez que fizer uma mudança arquitetural relevante.

| Data       | Versão | Mudança                                              | Motivo                            |
|------------|--------|------------------------------------------------------|-----------------------------------|
| 2025-01    | v1.0   | Documento inicial criado pelo Gemini                 | Onboarding e visão de produto     |
| 2025-01    | v2.0   | CLAUDE.md expandido com schema, fluxos e comandos    | Preparar para Claude Code         |
| 2026-04    | v2.1   | Migração React completa + Bling API v3 atualizada   | Remover legado, estabilizar auth  |
|            |        | - Deletadas 15 páginas HTML legado                   |                                   |
|            |        | - Bling API: www.bling.com.br → api.bling.com.br     |                                   |
|            |        | - Adicionado retry 429 em blingFetch()               |                                   |
|            |        | - Cloudinary validado e integrado                    |                                   |
|            |        | - Relatório técnico criado (RELATORIO_TECNICO.md)    |                                   |

---

## 🚫 O que o Claude NUNCA deve fazer

1. Criar query no Firestore sem filtro de `tenantId`
2. Gravar um produto sem validar o SKU via `sku-validator.js`
3. Expor `accessToken` ou `refreshToken` do Bling em respostas de API
4. Remover uma tela legada sem ter o equivalente React testado
5. Criar um novo campo no Firestore sem seguir o schema definido acima
6. Fazer fetch direto para a Bling API fora do `bling-client.js`
7. Commitar variáveis de ambiente reais (apenas `.env.example`)

---

## ✅ Checklist antes de qualquer commit

- [ ] A query do Firestore tem `tenantId` no path ou no `.where()`?
- [ ] SKUs foram validados antes de gravar?
- [ ] A rota nova tem `requireFirebaseAuth` e `requireRole`?
- [ ] A resposta segue o padrão `{ success, data/error, code }`?
- [ ] Novos campos do Firestore foram adicionados ao schema neste arquivo?
- [ ] O log de evolução foi atualizado?
