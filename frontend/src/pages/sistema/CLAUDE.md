# CLAUDE.md — Módulo Admin/Sistema

## Papel deste agente
Especialista em permissões, perfis de usuário, temas e configurações globais do sistema — tudo que controla quem vê o quê e como o sistema se comporta.

## Página do módulo

| Página | Função |
|--------|--------|
| `ConfiguracoesSistema.jsx` | Gestão de perfis, usuários, permissões por módulo e informações do ambiente |

## Abas da ConfiguracoesSistema

| Aba | Função |
|-----|--------|
| **Perfis** | CRUD de perfis: nome, cor de avatar, tema, toggles de módulos |
| **Usuários** | Lista de usuários Firebase + atribuição de perfil |
| **Sistema** | Informações de ambiente: tenant, status Bling/ML, links admin |

## Regras de negócio críticas

### tenantId — regra inegociável do sistema inteiro
- Sempre extraído do Firebase Custom Claim (token JWT)
- **Nunca** aceitar `tenantId` do body, query string ou localStorage
- Middleware `requireFirebaseAuth` obrigatório em todas as rotas protegidas
- Quebrar esta regra expõe dados de outros tenants

### Custom Claims Firebase
```javascript
// Estrutura do custom claim após login
{ uid, tenantId, role: 'roleId', email }
```
- Atribuído via `setCustomUserClaims(uid, { tenantId, role })`
- Frontend precisa de `getIdToken(true)` para renovar o token após atribuição
- Backend middleware lê `req.auth.role` — nunca confiar no frontend para isso

### 14 módulos de permissão (MODULOS_UI — não alterar os IDs)
```
Expedição:  pedidos | manual | bling | ml-dashboard | insumos
Catálogo:   catalogo | admin | embalagens | cadastrar | enriquecer-xml | importar
Financeiro: financas | compras
Sistema:    index | config
```
Estes IDs são usados no Firestore (`roles/{id}.modulos`) e nas verificações de rota do frontend.
Renomear um ID sem migrar o Firestore quebra o acesso de todos os usuários daquele perfil.

### Temas por perfil (não por usuário)
Todos os usuários do mesmo perfil veem o mesmo tema.
Temas disponíveis: `dark | uber | ifood | 99 | marvel | rick`
Aplicado via CSS custom properties no `<body>` pelo AppShell.

### Avatar por perfil
10 cores predefinidas — apenas referência visual, sem impacto funcional.

## APIs e endpoints usados

### Backend interno
- `GET /api/roles` — lista perfis
- `POST /api/roles` — cria perfil
- `PUT /api/roles/{id}` — atualiza perfil
- `DELETE /api/roles/{id}` — remove perfil
- `GET /api/users` — lista usuários Firebase Auth
- `POST /api/users/{uid}/role` — atribui perfil a usuário (chama `setCustomUserClaims`)
- `GET /api/perfis` — alias para listagem de perfis (usado por `usePerfil`)

### Firebase Auth (via Admin SDK no backend)
- `admin.auth().setCustomUserClaims()` — atribui claims
- `admin.auth().listUsers()` — lista usuários

## Coleções Firestore

| Coleção | Operação | Descrição |
|---------|----------|-----------|
| `tenants/{tenantId}` | Leitura | Doc público do tenant (name, status, plan) |
| `tenants/{tenantId}/members/{uid}` | Leitura + Escrita | Membros autorizados e seus perfis |
| `tenants/{tenantId}/audit_logs/{id}` | Escrita (só backend) | Auditoria de ações |
| `roles/{roleId}` | Leitura + Escrita | Perfis de acesso com módulos e tema |

## Impacto em outros módulos

- **Todos os módulos** dependem do sistema de perfis para mostrar/ocultar navegação
- Se `roles/{roleId}.modulos` for alterado → usuários podem perder acesso a módulos em uso
- Se a estrutura de Custom Claims mudar → `requireFirebaseAuth` quebra em todo o backend
- Se `usePerfil()` falhar → AppShell não carrega menus para nenhum módulo

## Hook crítico: usePerfil()
```javascript
// Localização: frontend/src/hooks/usePerfil.js
// Usado por: AppShell.jsx (menu lateral) e LoginPage.jsx
// Retorna: { modulos, tema, role, tenantId }
```
Qualquer mudança na estrutura de `roles` deve ser refletida aqui.

## Checklist antes de qualquer mudança

- [ ] A mudança afeta os IDs dos módulos em `MODULOS_UI`? → verificar Firestore e todos os perfis existentes
- [ ] A mudança afeta Custom Claims? → testar login completo + navegação após renovação de token
- [ ] A mudança afeta `requireFirebaseAuth`? → testar TODAS as rotas protegidas do backend
- [ ] A mudança afeta `usePerfil()`? → verificar AppShell (menu lateral) e LoginPage
- [ ] A mudança afeta `tenants/{tenantId}/members`? → testar provisionamento de login

## Próximos passos planejados

1. **Controle de acesso por colaborador:** adicionar Sueli e futuros colaboradores com perfis específicos (operador de expedição, estoquista, financeiro)
2. **Configuração de estilos globais:** painel para ajuste de cores e temas sem precisar editar código
3. **Painel de integrações:** status visual de Bling OAuth, ML OAuth, Google Sheets e Typesense — com botão de reconexão
