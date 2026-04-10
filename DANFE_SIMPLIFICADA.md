# 📋 DANFE Simplificada — Impressoras Térmicas 10x15cm

## 📝 Resumo da Mudança

A partir de **Abril/2026**, o sistema imprime **DANFE Simplificada** (etiqueta 10x15cm) em vez de DANFE completa (A4).

### Antes
- DANFE em formato A4 (210x297mm)
- Usuário precisava redimensionar manualmente na impressora
- Impressão quebrada em térmicas 10x15cm

### Depois
- DANFE Simplificada (etiqueta 10x15cm)
- PDF já sai formatado para a impressora
- Sem ajustes manuais necessários
- Otimizado para QZ Tray + impressoras térmicas

---

## 🖨️ Como Funciona

### 1. Fluxo Frontend (PedidosDoDia.jsx)

Quando o usuário clica em **Imprimir DANFE**:

```javascript
printDanfe(blingNfId)
  ↓
fetch(/bling/danfe/:id?tipo=simplificado)  // ← tipo=simplificado (novo!)
  ↓
Resposta JSON: { pdf: "base64", tipo: "simplificado", ... }
  ↓
QZ Tray com configuração otimizada:
  - scaleContent: false       (mantém 10x15cm original)
  - colorType: 'blackwhite'   (apenas B&W, mais rápido)
  - margins: 0                (sem espaçamento)
  ↓
Impressora térmica: PDF pronto sem redimensionamento
```

### 2. Fluxo Backend (server.js)

Endpoint `/bling/danfe/:id`:
- Aceita `?tipo=simplificado` ou `?tipo=completa` (padrão)
- Passa o parâmetro para API do Bling: `/nfe/{id}/danfe?tipo=simplificado`
- Retorna tipo na resposta para rastreamento

### 3. API Bling

```
GET https://api.bling.com.br/Api/v3/nfe/{id}/danfe?tipo=simplificado
```

Retorna DANFE Simplificada (etiqueta) em vez de Completa (A4)

---

## 🧪 Como Testar

### Opção 1: Via Admin — Debug Endpoint

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8080/bling/debug/danfe/123456?tipo=simplificado"
```

Resposta mostra:
- Status da requisição ao Bling
- Content-Type (application/pdf)
- Links disponíveis (linkDanfeFull, linkDanfeSimplificado, etc.)

### Opção 2: Via Frontend — Imprimir Diretamente

1. Acesse **Pedidos do Dia** (`/pedidos`)
2. Selecione um pedido com DANFE disponível
3. Clique em **Imprimir DANFE** (ícone 🖨️)
4. Sistema tenta QZ Tray (impressora física)
5. Se indisponível, abre PDF no browser

### Opção 3: Forçar Tipo Completo (revert)

Se precisar voltar para DANFE Completa A4, na requisição frontend:

```javascript
// Em PedidosDoDia.jsx, linha ~114
const res = await fetch(`/bling/danfe/${id}?tipo=completa`, {
  // ... resto do código
```

---

## 📊 Configuração QZ Tray para Térmicas

```javascript
const config = qz.configs.create(printer, {
  scaleContent: false,        // ← Crítico: não faz resize
  colorType: 'blackwhite',    // ← Otimizado para térmica
  rotation: 0,                // ← Sem rotação
  margins: {                  // ← Sem espaçamento
    top: 0, right: 0, bottom: 0, left: 0
  }
});
```

**Por que `scaleContent: false`?**
- A DANFE Simplificada já vem em 10x15cm do Bling
- Se `scaleContent: true`, o QZ tenta "caber" em outra dimensão
- Resultado: redimensionamento e impressão quebrada

---

## 🔍 Troubleshooting

### Problema: Impressão ainda sai em A4

**Causa provável:** API Bling não retornou `tipo=simplificado` corretamente

**Solução:**
1. Acesse debug endpoint: `/bling/debug/danfe/{nfId}?tipo=simplificado`
2. Verifique resposta: `tipo_testado: "simplificado"`
3. Se retornar tipo "completa", token Bling pode estar expirado

### Problema: QZ Tray não conecta

**Fallback automático:** Browser abre PDF diretamente
- Usuário imprime via Ctrl+P (Print Dialog)
- Deve configurar impressora como **padrão** e **tamanho 10x15cm**

### Problema: PDF abre mas sai de cabeça para baixo

**Verificar:** QZ Tray `rotation: 0`
- Se impressora auto-rotaciona: adicionar `rotation: 90` ou `rotation: 270`

---

## 📚 Campos da Resposta

```json
{
  "ok": true,
  "pdf": "JVBERi0xLjQK...",  // Base64 do PDF
  "tipo": "simplificado",     // ← Novo campo
  "nfId": "123456",
  "via": "binary"             // Como o PDF foi obtido
}
```

| Campo | Descrição |
|-------|-----------|
| `tipo` | "simplificado" = etiqueta 10x15cm; "completa" = A4 |
| `via` | "binary" = PDF direto; "json_url" = URL extraída |
| `nfId` | ID da NF no Bling |

---

## ✅ Checklist Antes de Deploy

- [ ] Testar `GET /bling/debug/danfe/{nfId}?tipo=simplificado`
- [ ] Testar impressão real em térmica 10x15cm
- [ ] Verificar fallback (browser) com impressora desligada
- [ ] Confirmar QZ Tray `scaleContent: false` está em produção
- [ ] Documentar dimensões esperadas do papel: 10cm × 15cm (100mm × 150mm)

---

## 📞 Suporte

Se a DANFE continuar vindo em A4:
1. Verifique se o Bling suporta `tipo=simplificado` na sua versão
2. Algumas contas Bling podem não ter DANFE Simplificada habilitada
3. Entre em contato com suporte Bling se endpoint retornar erro 400

