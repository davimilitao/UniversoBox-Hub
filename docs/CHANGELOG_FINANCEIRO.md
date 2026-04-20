# Changelog — Módulo Financeiro

## 2026-04-20 — Estabilização completa do módulo financeiro (PRs #84–#90)

### Problemas resolvidos

#### 🔴 OAuth Bling — 404 após login
**Sintoma:** Após conectar o Bling, o browser ia para `bling.html` que não existe mais.  
**Causa:** Rotas `/bling` e `/bling/callback` ainda apontavam para o arquivo estático da SPA antiga.  
**Fix (PR #84):** Todas as rotas Bling agora redirecionam para `/spa/financeiro/painel`. Sucesso → `?bling=ok`, erro → `?bling=error&msg=...`.

---

#### 🔴 Painel — dados R$ 0,00 em todos os campos
**Sintoma:** Receita, Despesas e Parcelas apareciam como R$ 0,00.  
**Causa:** Incompatibilidade entre o formato de resposta da API (`despesas.total`, `parcelas.total`) e o que o componente esperava (`resultado.totalDespesas`, `resultado.totalParcelas`).  
**Fix (PR #85):** Mapeamento correto dos campos da resposta do endpoint `/api/painel-financeiro`.

---

#### 🔴 Painel — erro 401 "Token ausente" ao abrir a página
**Sintoma:** Toda vez que o Painel carregava pela primeira vez, retornava 401.  
**Causa:** Race condition — o Firebase leva alguns milissegundos para resolver o estado de autenticação após o carregamento da página. Durante esse intervalo, `auth.currentUser` é `null`, o `apiFetch` enviava um token vazio, e o backend rejeitava.  
**Fix (PR #88):** `getAuthToken.js` agora usa `onAuthStateChanged` para aguardar o Firebase resolver antes de buscar o token.

---

#### 🔴 Receita NF-e = R$ 0,00 (Bling API V3)
**Sintoma:** Painel mostrava Bling online mas Receita sempre R$ 0.  
**Causa:** A Bling API V3 retorna o campo `situacao` como **objeto** `{id: 6, valor: "Autorizado..."}`, não como número. O código fazia `Number({id:6,...})` = `NaN`, e `NaN` nunca passava pelo filtro de situações `[2, 5, 7]` → todas as NFs eram descartadas.  
**Fix (PR #88):**  
- Extração correta: `Number(n.situacao?.id ?? n.situacao)` — suporta V2 (número) e V3 (objeto)  
- Troca de allowlist `[2, 5, 7]` por denylist: só exclui canceladas (3, 9) e inutilizadas (4)

---

#### 🔴 Receita NF-e — varredura de todas as NFs históricas
**Sintoma:** `blingAgregaMes` era lento e poderia perder NFs em volumes altos.  
**Causa:** A query `/nfe?pagina=X&limite=100` não tinha filtro de data — baixava **todas** as NFs de todos os tempos e filtrava localmente.  
**Fix (PR #90):** Adicionados parâmetros `dataEmissaoInicial` e `dataEmissaoFinal` na query da API Bling. Só NFs do mês solicitado são retornadas.

---

#### 🔴 Gestão de Margem — tela travada em loading eterno
**Sintoma:** `/spa/financeiro/margem` exibia skeletons infinitamente, request `margem-v2` ficava em `pending`.  
**Causa:** O endpoint `/api/margem-v2` chamava `blingAgregaMes()` **sequencialmente** para cada um dos 12 meses. Cada chamada podia varrer até 2.000 NFs. Total: até 24.000 requisições encadeadas → timeout do Railway (~30s).  
**Fix (PR #90):** Loop sequencial (`for...of`) substituído por `Promise.all` — todos os 12 meses são consultados em **paralelo**. Tempo de resposta: de >30s para ~2-3s.

---

### Nova funcionalidade

#### ✅ Saldo em Caixa com projeção (PR #86)
Adicionado ao Painel Financeiro um bloco de entrada manual de saldo:
- **Mercado Pago / Banco / Outros** — inputs numéricos
- **Caixa Líquido Projetado** = Saldo Total − Saídas Pendentes (despesas + parcelas não pagas)
- Verde se positivo, vermelho se negativo
- Valores persistidos por mês no `localStorage` (não se perdem ao trocar de mês)

#### ✅ Receita com fallback automático (PR #89)
Quando NF-e retorna zero (Bling offline ou sem NFs no período):
- O Painel usa automaticamente `contasReceber.recebido` (contas já recebidas do Bling) como receita
- Lucro e margem são recalculados com a receita real disponível
- Badge indica a fonte dos dados

#### ✅ Endpoint de diagnóstico (PR #88)
`GET /bling/debug/receita/:mesAno` — retorna para cada NF do mês: `situacaoRaw`, `situacaoId`, `valorTotal`, se foi aceita ou rejeitada. Útil para depurar problemas futuros de receita zero.

---

### Estado dos PRs (todos mergeados em `main`)

| PR | O que fez |
|---|---|
| #84 | Fix callback OAuth + fix campos API do Painel |
| #85 | Fix mapeamento de campos despesas/parcelas no frontend |
| #86 | Saldo em Caixa com projeção de caixa líquido |
| #87 | Fix situação NF-e Bling V3 (objeto vs número) |
| #88 | Fix auth race condition 401 + debug endpoint receita |
| #89 | Fallback receita: contasReceber.recebido quando NF-e = 0 |
| #90 | Filtro data Bling API + Promise.all margem-v2 (fix timeout) |

---

### Pendências futuras

- [ ] Migrar Saldo em Caixa de `localStorage` para Firestore `fin_saldo_mes/{tenantId}_{YYYY-MM}`
- [ ] Migrar despesas históricas (< abr/2026) de Google Sheets para Firestore
- [ ] Feature Phase 2: ao registrar compra no Bling, sugerir lançar parcelas no cartão
