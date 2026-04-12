# Como Commitar e Fazer Push
**Categoria:** dev
**Data:** 12/04/2026
**Tags:** git, commit, push, deploy, railway, monorepo

## Contexto
O projeto UniversoBox Hub é um monorepo com `/backend` e `/frontend`. O git é sempre operado a partir da **raiz** do projeto. O Railway detecta o `git push` automaticamente e faz o rebuild de produção.

## Pré-requisitos
- Git instalado e configurado
- Acesso ao repositório remoto (GitHub)
- Projeto clonado localmente

## Passo a Passo

### 1. Testar localmente (2 terminais simultâneos)

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
```
Aguarde: `Server running on port 8080`

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```
Aguarde: `Local: http://localhost:5173`

Abra o navegador em **`http://localhost:5173/spa`** e verifique as mudanças.

### 2. Commitar (da raiz do projeto)

Abra um **3º terminal na raiz**:

```bash
# Ver o que mudou
git status

# Adicionar os arquivos alterados (prefira por nome, não git add .)
git add frontend/src/components/MeuComponente.jsx
git add backend/routes/minha-rota.js

# Conferir o que vai entrar no commit
git diff --staged

# Criar o commit
git commit -m "fix(modulo): descrição clara do que foi corrigido"
```

### 3. Push para o Railway

```bash
git push
```

O Railway detecta o push e inicia o rebuild. Acompanhe em [railway.app](https://railway.app) → seu projeto → aba **Deployments**.

## Observações

- Os terminais 1 e 2 (servidores locais) podem ser fechados antes do push — não são necessários para commitar
- Prefira `git add [arquivo]` ao invés de `git add .` para evitar commitar arquivos sensíveis acidentalmente
- Mensagens de commit seguem o padrão: `tipo(modulo): descrição` — ex: `feat(financeiro): adiciona filtro por categoria`
- Tipos comuns: `feat` (nova feature), `fix` (bug), `refactor` (refatoração), `docs` (documentação)
