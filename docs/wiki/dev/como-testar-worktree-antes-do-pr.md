# Como Testar o Worktree do Claude Antes de Fazer PR
**Categoria:** dev
**Data:** 12/04/2026
**Tags:** worktree, vs code, teste local, pr, branch, claude

## Contexto
O Claude Code trabalha em pastas isoladas chamadas **worktrees** — são branches automáticas criadas dentro de `.claude/worktrees/`. Antes de abrir o PR, você precisa abrir exatamente essa pasta no VS Code e rodar os servidores a partir dela para testar o código com as mudanças reais.

## Pré-requisitos
- VS Code instalado
- Node.js instalado
- Projeto clonado em `C:\Users\milit\OneDrive\Projetos\UniversoBox-Hub\`

## Passo a Passo

### 1. Abrir a pasta correta no VS Code

O Claude sempre informa o nome do worktree na conversa (ex: `hardcore-chandrasekhar`).

**No VS Code:**
```
File → Open Folder → navegue até:
C:\Users\milit\OneDrive\Projetos\UniversoBox-Hub\.claude\worktrees\hardcore-chandrasekhar
```

Ou via terminal:
```powershell
code "C:\Users\milit\OneDrive\Projetos\UniversoBox-Hub\.claude\worktrees\hardcore-chandrasekhar"
```

### 2. Confirmar que está na branch certa

No rodapé do VS Code (canto inferior esquerdo), deve aparecer:
```
⎇ claude/hardcore-chandrasekhar
```

### 3. Matar processos antigos nas portas (se necessário)

Se aparecer erro `EADDRINUSE` (porta em uso):
```powershell
npx kill-port 8080 5173
```

### 4. Abrir 2 terminais e rodar os servidores

**Terminal 1 — Backend** (`` Ctrl+` `` para abrir terminal no VS Code):
```powershell
cd backend
npm run dev
```
Aguarde: `Server running on port 8080`

**Terminal 2 — Frontend** (clique no `+` no painel de terminais):
```powershell
cd frontend
npm run dev
```
Aguarde: `Local: http://localhost:5173`

### 5. Testar no navegador

Abra: `http://localhost:5173/spa/financeiro/despesas`

Verifique os fixes:
- [ ] Scroll da página funciona (antes travava)
- [ ] Dropdown de mês mostra texto legível (antes era invisível)
- [ ] Tela abre já no mês atual (antes abria no mês mais antigo)

### 6. Criar o PR após validar

```powershell
# No terminal integrado do VS Code (ainda dentro do worktree):
gh pr create --base main --head claude/hardcore-chandrasekhar --title "fix(financeiro): scroll, select meses e mês padrão"
```

Ou pelo VS Code: **Source Control → ⋯ → Create Pull Request**

## Observações

- O worktree é descartável — após o merge do PR, pode ser ignorado
- Nunca rode `npm run dev` a partir da raiz do projeto principal quando quiser testar mudanças do Claude — você estará testando o código **sem** as mudanças
- Se o worktree sumir, as mudanças ainda estão na branch remota após o push
- O nome do worktree muda a cada sessão do Claude — sempre confira o nome atual na conversa
