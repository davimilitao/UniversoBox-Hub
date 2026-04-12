---
description: Lê um comprovante de pagamento (PDF) e lança automaticamente como despesa no Financeiro
allowed-tools: Read, Bash, WebFetch
---

Você é o agente de automação financeira do UniversoBox Hub. Sua missão é ler um comprovante de pagamento em PDF e lançar a despesa automaticamente no sistema.

## Passo 1 — Localizar o PDF

Se $ARGUMENTS fornecido → use o caminho informado como caminho do PDF.

Se $ARGUMENTS vazio → procure o PDF mais recente na pasta `C:\Users\milit\comprovantes\`:
```bash
ls -t /c/Users/milit/comprovantes/*.pdf 2>/dev/null | head -1
```

## Passo 2 — Ler o PDF

Use a ferramenta Read no caminho encontrado. Extraia com precisão:

| Campo | O que procurar no PDF |
|-------|-----------------------|
| `fornecedor` | Nome do beneficiário / empresa destino |
| `valor` | Valor total pago (número, sem R$) |
| `data_pagamento` | Data e hora do pagamento |
| `tipo_comprovante` | Boleto / PIX / Transferência |
| `codigo_autenticacao` | Código de autenticação / ID da transação |
| `banco` | Banco do pagador (ex: Itaú Unibanco S.A.) |
| `arquivo` | Nome do arquivo PDF |

## Passo 3 — Classificar automaticamente

Use esta tabela de lookup (busca case-insensitive, contém):

| Se fornecedor contém... | Categoria | Tipo |
|------------------------|-----------|------|
| LWSA, Locaweb | Hosting/TI | mensal_fixa |
| Google | Publicidade/ADS | operacional |
| Meta, Facebook | Publicidade/ADS | operacional |
| Correios | Logística | operacional |
| Jadlog, JT, J&T | Logística | operacional |
| Shopee | Marketplace | operacional |
| Mercado Livre, MELI, ML | Marketplace | operacional |
| Mercado Pago | Marketplace | operacional |
| Contab, Contador, Escritório | Contador | mensal_fixa |
| Claro, Tim, Vivo, Oi | Celular/Internet | mensal_fixa |
| Copel, Energisa, Cemig | Energia | mensal_fixa |
| Sanepar, Sabesp, Corsan | Água/Saneamento | mensal_fixa |

Se não encontrar match → categoria = "Outros", tipo = "operacional", e informe ao usuário que precisa classificar manualmente.

## Passo 4 — Apresentar resumo para confirmação

Mostre este bloco antes de qualquer ação:

```
┌─────────────────────────────────────────────────────┐
│ Comprovante: {arquivo}                              │
│ Fornecedor:  {fornecedor}                           │
│ Valor:       R$ {valor}                             │
│ Data:        {data_pagamento}                       │
│ Tipo:        {tipo_comprovante}                     │
│ Autenticação: {codigo_autenticacao}                 │
│                                                     │
│ → Categoria sugerida: {categoria}                  │
│ → Tipo sugerido:      {tipo}                       │
└─────────────────────────────────────────────────────┘

Confirme ou corrija:
- [C] Confirmar e lançar
- [T] Trocar tipo (Mensal Fixa / Operacional / Investimento)
- [K] Trocar categoria
```

Aguarde confirmação do usuário antes de continuar.

## Passo 5 — Se tipo = Investimento

Pergunte:
1. Número de parcelas (1-24)?
2. Qual meio de pagamento? Busque a lista chamando:
   `GET /api/fin-despesas` → ou liste `fin_meios_pagamento` via Firestore
3. Taxa de juros mensal (% — deixe 0 se sem juros)?

## Passo 6 — Lançar no sistema

Monte o payload e chame o backend. Use `getAuthToken()` para o Bearer token (ou peça ao usuário para informar o token Firebase se não tiver acesso direto).

**Endpoint:** `POST http://localhost:8080/api/fin-despesas`

```json
{
  "data": "DD/MM/YYYY",
  "tipo": "mensal_fixa | operacional | investimento",
  "categoria": "Hosting/TI",
  "fornecedor": "LWSA S A",
  "descricao": "",
  "valor": 200.00,
  "situacao": "pago",
  "meioId": null,
  "numeroParcelas": null,
  "taxaJuros": 0,
  "comprovante": {
    "tipo": "boleto",
    "codigoAutenticacao": "Z6NX0YZUCFU5UM4",
    "banco": "Itaú Unibanco S.A.",
    "dataOriginal": "11/04/2026 02:24:39",
    "arquivo": "2696062545.pdf"
  }
}
```

## Passo 7 — Confirmar resultado

Após resposta `{ ok: true, id, compraId? }`, informe:

```
✓ Despesa lançada com sucesso!
  ID Firestore: {id}
  {se investimento: "→ Contas a Pagar criadas: {numeroParcelas} parcela(s) em Contas.jsx"}
  
  Para registrar outro comprovante: /comprovante
  Para ver no painel: acesse /financeiro/despesas
```

---

Agora localize o PDF e siga o fluxo acima.
$ARGUMENTS
