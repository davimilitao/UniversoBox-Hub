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
| Frontend      | Vanilla JS + HTML (legado)          | 🔄 Migrando      |
| Frontend novo | React 18 + Tailwind CSS             | 🔄 Em construção |
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
├── frontend/                       # Telas legado (Vanilla JS)
│   ├── bling.html                  # Gestão de NFs de saída
│   ├── admin.html                  # Enriquecimento de catálogo (fotos, bin)
│   ├── cadastro-produto.html       # Registro manual de produtos
│   ├── catalogo.html               # Catálogo técnico (suporte/vendas)
│   └── compras.html                # Controle de estoque e pedidos
│
├── src/                            # React (novo — migração progressiva)
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   └── services/
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
https://www.bling.com.br/Api/v3/
```

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

## 🔄 Roadmap de Migração React

Ordem de migração definida (trabalhar sempre no próximo item da fila):

| Prioridade | Tela                    | Status       | Componentes React necessários              |
|------------|-------------------------|--------------|--------------------------------------------|
| 1          | `bling.html`            | 🔄 Em andamento | `NFTable`, `NFStatusBadge`, `CloneModal`  |
| 2          | `admin.html`            | 📋 Pendente  | `ProductEditor`, `ImageUploader`, `BinInput` |
| 3          | `cadastro-produto.html` | 📋 Pendente  | `ProductForm`, `SKUValidator`              |
| 4          | `catalogo.html`         | 📋 Pendente  | `CatalogGrid`, `ProductCard`, `SilenceToggle` |
| 5          | `compras.html`          | 📋 Pendente  | `TransitList`, `PurchaseForm`, `BIChart`  |

### Princípio de migração:
1. Criar o componente React em `src/pages/`
2. Manter o `.html` legado funcionando em paralelo
3. Só remover o legado após teste completo do React
4. Usar Tailwind CSS — nunca CSS custom nos componentes novos

---

## ⚙️ Comandos de Desenvolvimento

```bash
# Instalar dependências
npm install

# Rodar backend local (porta 3001)
cd backend && npm run dev

# Rodar frontend React (porta 3000)
npm run dev

# Rodar testes
npm test

# Build de produção
npm run build

# Variáveis de ambiente necessárias (ver .env.example)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
BLING_CLIENT_ID=
BLING_CLIENT_SECRET=
PORT=3001
```

---

## 📝 Log de Evolução do Projeto

> O Claude deve adicionar uma entrada aqui toda vez que fizer uma mudança arquitetural relevante.

| Data       | Versão | Mudança                                              | Motivo                            |
|------------|--------|------------------------------------------------------|-----------------------------------|
| 2025-01    | v1.0   | Documento inicial criado pelo Gemini                 | Onboarding e visão de produto     |
| 2025-01    | v2.0   | CLAUDE.md expandido com schema, fluxos e comandos    | Preparar para Claude Code         |

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
