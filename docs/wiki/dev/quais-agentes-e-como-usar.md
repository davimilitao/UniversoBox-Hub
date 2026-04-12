# Quais Agentes Existem e Como Usar
**Categoria:** dev
**Data:** 12/04/2026
**Tags:** agentes, claude, slash commands, squad, assistentes

## Contexto
O UniversoBox Hub usa o Claude Code com um "Dev Squad" de agentes especializados. Cada agente conhece profundamente seu módulo e segue as convenções do projeto. Usar o agente certo economiza tempo e evita erros.

## Como chamar um agente

Na conversa com o Claude, digite o nome do agente com `/` antes:

```
/financeiro me ajuda com X
/tech-lead preciso implementar Y
/qa valida o que acabei de construir
```

O agente é carregado automaticamente com todo o contexto do módulo.

## Tabela completa de agentes

| Comando | Quando usar |
|---------|-------------|
| `/tech-lead` | **Comece aqui** para qualquer feature nova — ele orquestra os outros agentes |
| `/dev-backend` | Implementar endpoints, regras de negócio, integrações no servidor Node/Express |
| `/dev-frontend` | Implementar telas, componentes e fluxos React + Tailwind |
| `/reviewer` | Revisar código antes do PR — segurança, bugs, padrões |
| `/qa` | Gerar checklist de testes completo antes de qualquer PR |
| `/financeiro` | Tudo do módulo Financeiro (despesas, parcelas, contas a pagar, cartões) |
| `/expedicao` | Tudo do módulo Expedição (pedidos do dia, picking, impressão de etiquetas) |
| `/catalogo` | Tudo do módulo Catálogo (produtos, imagens, importação CSV, Bling sync) |
| `/admin-hub` | Configurações do sistema, perfis, temas, permissões de usuário |
| `/wiki-save` | Salvar o conhecimento desta conversa como página na wiki |
| `/comprovante` | Ler um PDF de comprovante e lançar a despesa no Financeiro automaticamente |

## Fluxo recomendado para uma feature nova

```
1. /tech-lead  → define escopo, divide em tarefas
2. /dev-backend → implementa endpoints
3. /dev-frontend → implementa tela
4. /reviewer    → revisa o código
5. /qa          → gera checklist de testes
6. git commit + git push → deploy
```

## Observações

- Os agentes de módulo (`/financeiro`, `/expedicao`, etc.) conhecem as coleções Firestore, hooks e endpoints específicos — prefira-os ao `/dev-frontend` para mudanças em seus módulos
- `/tech-lead` é o ponto de entrada ideal quando você não sabe por onde começar
- `/wiki-save` pode ser usado a qualquer momento para preservar o conhecimento da conversa atual
- Os agentes não têm memória entre sessões — o contexto vive no CLAUDE.md e nos arquivos de skill em `.claude/commands/`
