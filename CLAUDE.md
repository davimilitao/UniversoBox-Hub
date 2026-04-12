# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Run both servers for development (separate terminals):**
```bash
# Backend (port 8080, with auto-reload)
cd backend && npm run dev

# Frontend (port 5173, proxies to backend)
cd frontend && npm run dev
```

**Build for production:**
```bash
npm run build   # Builds frontend → backend/public/spa, then installs backend deps
npm start       # Starts backend serving SPA at /spa
```

## Architecture

**Monorepo:** `/backend` (Node.js + Express) + `/frontend` (React + Vite SPA)

The frontend dev server at `:5173` proxies `/bling`, `/orders`, `/api`, `/auth` to the backend at `:8080`. Production builds to `backend/public/spa`, served by Express.

**Migration complete (April/2026):** All vanilla HTML/JS pages have been migrated to React SPA. The project is now 100% React at `/spa/*`.

### Modules

| Module | React Pages | Backend |
|--------|-------------|---------|
| Expedição | `pages/expedicao/` (BlingPedidos, PedidosDoDia, GestaoInsumos, Compras) | `server.js`, `public/bling_routes.js` |
| Catálogo | `pages/catalogo/` (CatalogoPro, AdminProdutos, ImageStudio, ImportarCSV, AutomacaoCadastro) | `routes/catalogo.js` |
| Financeiro | `pages/financeiro/` (PainelFinanceiro, GestaoDespesas, GestaoMargem, Contas) | `/api/fin-despesas` via Firestore (migrado de Google Sheets) |
| Admin/Sistema | `pages/sistema/ConfiguracoesSistema.jsx` | `routes/tenants.js`, `routes/tenantProvisioning.js` |

### Critical Operation Flow

```
Bling NF (nota fiscal) → POST /bling/clonar → orders/{id} in Firestore
                                                    ↓
                                        PedidosDoDia.jsx (picking queue)
                                                    ↓
                                        Print DANFE → scan barcode → print shipping label
```

`PedidosDoDia.jsx` is the core daily operation — handle with extreme care when modifying.

### Multi-Tenancy

- `tenantId` is **always** extracted from Firebase custom claims (never from request body or query)
- Every backend protected route uses `requireFirebaseAuth` middleware (`backend/middleware/requireFirebaseAuth.js`)
- `req.auth = { uid, tenantId, role, email }` is available after middleware
- Roles: `admin`, `operator`, `financeiro`, `catalogo`, `vendas`

**Auth flow:** `signInWithEmailAndPassword` → `POST /auth/provision { tenantId }` → backend sets custom claims → `getIdToken(true)` refreshes token with `tenantId` + `role`

### Firestore Structure

```
tenants/{tenantId}/members/{uid}     ← authorized users (role)
tenants/{tenantId}/audit_logs/{id}   ← backend-written audit trail

bling_tokens/main                    ← Bling OAuth2 tokens (single account currently)
ml_tokens/                           ← Mercado Livre OAuth2 tokens
products/{sku}                       ← base catalog (synced from Bling)
product_overrides/{sku}              ← local enrichment (photos, bin location, notes, packaging)
orders/{id}                          ← internal separation/picking orders
fin_compras/{id}                     ← purchase orders
fin_parcelas/{id}                    ← payment installments
fin_despesas/{id}                    ← expenses (migrated from Google Sheets Apr/2026)
embalagens/                          ← packaging inventory
```

### API Integrations

**Bling API v3 (OAuth2):**
- Token stored in `bling_tokens/main` (Firestore), auto-refreshed with 5-min buffer
- Config: `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`, `BLING_REDIRECT_URI`
- Token management: `blingEnsureToken()` in `backend/public/bling_routes.js`
- Auth endpoints: `GET /bling/auth`, `GET /bling/callback`, `GET /bling/status`
- Base URL: `https://api.bling.com.br/Api/v3` (migrated from `www.bling.com.br` Apr/2026)
- Image payload: `{ midia: { imagens: { externas: [{ link: url }] } } }`

**Mercado Livre (OAuth2):**
- Token stored in `ml_tokens/` (Firestore)
- Marketplace detection from order origin/customer name patterns

**Google Sheets (Financeiro — legacy):**
- Endpoints `/api/despesas` mantidos para retrocompatibilidade
- Novos dados vão para Firestore `fin_despesas`

### Frontend Patterns

**State management:** Custom hooks + Firestore real-time listeners (no Redux/Zustand)
```javascript
// Pattern used throughout: custom hook with onSnapshot
export function useCompras() {
  const [data, setData] = useState([]);
  useEffect(() => {
    const unsubscribe = onSnapshot(query(...), snap => setData(...));
    return unsubscribe;
  }, []);
  return { data, ... };
}
```

**Auth token in API calls:** Use `getAuthToken()` from `src/utils/getAuthToken.js`

**Styling:** Tailwind CSS only — no CSS files per component, no styled-components. Dark mode via `class` strategy. Custom brand colors and animations defined in `frontend/tailwind.config.js`.

**Themes:** AppShell implements `dark`/`uber`/`marvel` themes via CSS custom properties on `<body>`.

## Key Files

| File | Purpose |
|------|---------|
| `backend/server.js` | Main Express app (large — core API + static serving) |
| `backend/public/bling_routes.js` | Bling OAuth2 + NF/order logic |
| `backend/routes/catalogo.js` | Product CRUD + Bling sync |
| `backend/middleware/requireFirebaseAuth.js` | Auth + tenant extraction |
| `frontend/src/App.jsx` | All route definitions |
| `frontend/src/firebase.js` | Firebase client init |
| `frontend/src/utils/getAuthToken.js` | Auth headers helper |
| `CONTEXTO.md` | Master technical context in Portuguese (read this for business logic) |
| `backend/.cursorrules` | Additional development conventions |

## Environment Setup

**Backend** (`backend/.env`): `TOKEN_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH`, `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`, `BLING_REDIRECT_URI`, `ANTHROPIC_API_KEY`

**Frontend** (`frontend/.env`): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`

## Conventions

- File headers with `@file`, `@module`, `@description`, `@version`, `@date`, `@changelog` are used in existing files — maintain the pattern when modifying them
- No TypeScript — pure JavaScript/JSX
- No test suite configured — manual testing via UI
- React hooks only (no class components)
- Feature-based folder structure target: `/features/orders/`, `/features/auth/`, etc. (migration in progress from flat `pages/` structure)
- All UI copy in Portuguese (pt-BR)

## Dev Squad (Slash Commands)

| Command | Role |
|---------|------|
| `/tech-lead` | Orchestrates full feature delivery — start here for any new task |
| `/dev-backend` | Senior Node/Express/Firestore developer |
| `/dev-frontend` | Senior React/Tailwind developer |
| `/reviewer` | Code review — security, bugs, patterns |
| `/qa` | QA checklist per module before every PR |
| `/expedicao` | Expedição module specialist |
| `/financeiro` | Financeiro module specialist |
| `/catalogo` | Catálogo module specialist |
| `/admin-hub` | Admin/Sistema module specialist |

## Security Rules (Never Violate)

1. `tenantId` ALWAYS from `req.auth.tenantId` — never from `req.body` or `req.query`
2. Every protected route MUST use `requireFirebaseAuth` middleware
3. Never expose Bling tokens in API responses
4. Validate all user inputs before saving to Firestore
5. Never commit real `.env` files — only `.env.example`
