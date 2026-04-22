# UniversoBox Hub — Design System

> **Princípio:** Pouco muda visualmente, muito se organiza. Os tokens já existem em `index.css`; os componentes aqui apenas os consomem de forma consistente.

---

## 1. Tokens (CSS Custom Properties)

Definidos em `frontend/src/index.css` via `[data-theme]`. **Nunca use hex direto — sempre use o token.**

### Backgrounds

| Token | Uso |
|---|---|
| `var(--bg-app)` | Fundo raiz da página |
| `var(--bg-sidebar)` | Fundo da sidebar |
| `var(--bg-surface)` | Superfícies elevadas (painéis, drawers) |
| `var(--bg-card)` | Cards e células de tabela |

### Accent (cor primária do tema)

| Token | Uso |
|---|---|
| `var(--accent)` | Botão primário, indicador ativo, links |
| `var(--accent-dim)` | Background de badge/chip primário |
| `var(--accent-text)` | Texto sobre fundo escuro com cor de destaque |
| `var(--accent-glow)` | Box-shadow / brilho de foco |

### Texto

| Token | Uso |
|---|---|
| `var(--text-primary)` | Headings, rótulos importantes |
| `var(--text-secondary)` | Subtítulos, valores secundários |
| `var(--text-muted)` | Placeholders, metadados, labels desabilitados |

### Borda

| Token | Uso |
|---|---|
| `var(--border)` | Todas as bordas de cards, inputs, separadores |

---

## 2. Paleta Semântica (Fixas — independente de tema)

Usadas para status de negócio. São absolutas (não mudam por tema) porque carregam significado.

| Propósito | Classe Tailwind | Hex | Uso |
|---|---|---|---|
| Sucesso / Pago | `text-emerald-400 bg-emerald-900/30` | `#34d399` | Pago, entregue, OK |
| Atenção / Pendente | `text-amber-400 bg-amber-900/20` | `#fbbf24` | Pendente, aguardando |
| Perigo / Vencido | `text-red-400 bg-red-900/20` | `#f87171` | Vencido, erro, cancelado |
| Informação | `text-blue-400 bg-blue-900/20` | `#60a5fa` | Neutro informativo |

> **Exceção deliberada:** estas cores são hardcoded porque são semânticas de negócio, não de tema. Um "Pago" deve ser verde em qualquer tema.

---

## 3. Tipografia

| Família | Uso | Tailwind |
|---|---|---|
| DM Sans | Interface geral | `font-sans` (padrão) |
| Space Mono | Valores numéricos, códigos | `font-mono` |

### Escala de tamanho

| Contexto | Classe |
|---|---|
| Label / meta | `text-xs` |
| Corpo / padrão | `text-sm` |
| Subtítulo | `text-base font-semibold` |
| Título de seção | `text-lg font-bold` |
| Heading de página | `text-2xl font-bold` |

---

## 4. Espaçamento

Seguimos a escala do Tailwind sem desvios.

| Gap entre itens de lista | `gap-2` (8px) |
|---|---|
| Gap entre seções | `gap-6` (24px) |
| Padding de card | `p-5` (20px) |
| Padding de página | `p-6` (24px) |
| Padding de botão | `px-4 py-2` |

---

## 5. Bordas e Raios

| Contexto | Classe |
|---|---|
| Card, painel | `rounded-xl` |
| Botão, input | `rounded-lg` |
| Badge, chip | `rounded-full` |
| Avatar | `rounded-full` |

---

## 6. Sombras / Elevação

| Nível | Uso |
|---|---|
| Sem sombra | Cards inline |
| `shadow-lg` | Modais, dropdowns |
| `shadow-xl` | Toasts, popovers |

---

## 7. Componentes — API

Todos em `frontend/src/components/ui/`. Importar via barrel:

```js
import { Button, Badge, Card, StatCard, PageHeader, DataTable, Toast, Skeleton } from '@/components/ui';
```

---

### Button

```jsx
<Button>Salvar</Button>
<Button variant="ghost">Cancelar</Button>
<Button variant="danger">Excluir</Button>
<Button loading>Salvando...</Button>
<Button size="sm">Compacto</Button>
<Button as="a" href="/rota">Link</Button>
```

**Variants:** `primary` (padrão) · `ghost` · `danger` · `outline`  
**Sizes:** `sm` · `md` (padrão) · `lg`

---

### Badge

```jsx
<Badge variant="pago">Pago</Badge>
<Badge variant="pendente">Pendente</Badge>
<Badge variant="vencido">Vencido</Badge>
<Badge variant="info">Sincronizado</Badge>
<Badge variant="accent">Ativo</Badge>  {/* usa --accent do tema */}
```

**Variants semânticos:** `pago` · `pendente` · `vencido` · `info`  
**Variants de tema:** `accent` · `muted`

---

### Card

```jsx
<Card>Conteúdo simples</Card>
<Card padding="sm">Compacto</Card>
<Card glass>Glass morphism</Card>
<Card className="col-span-2">Com classe extra</Card>
```

---

### StatCard

```jsx
<StatCard
  titulo="Vencido"
  valor={1500.00}         // formata em BRL automaticamente
  count={3}               // "3 lançamentos"
  variante="danger"       // danger · warning · success · default · accent
  icon={AlertCircle}      // ícone Lucide opcional
  trend="+12%"            // variação opcional
/>
```

**Variantes:** `success` · `warning` · `danger` · `default` · `accent`

---

### PageHeader

```jsx
<PageHeader
  titulo="Gestão de Despesas"
  subtitulo="Lançamentos e contas a pagar"
  icon={Receipt}
  actions={<Button>+ Novo</Button>}
/>
```

---

### DataTable

```jsx
<DataTable
  columns={[
    { key: 'descricao', label: 'Descrição' },
    { key: 'valor',     label: 'Valor', render: (v) => BRL.format(v) },
    { key: 'status',    label: 'Status', render: (v) => <Badge variant={v}>{v}</Badge> },
  ]}
  data={despesas}
  emptyText="Nenhuma despesa encontrada"
  loading={carregando}
/>
```

---

### Toast

```jsx
<Toast msg="Salvo com sucesso" tipo="ok" />
<Toast msg="Erro ao salvar" tipo="erro" />
```

---

### Skeleton

```jsx
<Skeleton />          {/* altura padrão h-32 */}
<Skeleton h="h-8" />  {/* altura customizada */}
<Skeleton count={4} className="h-12" />  {/* múltiplos */}
```

---

## 8. Responsivo

Estratégia: **desktop-first** (operação diária em monitor).

| Breakpoint | Largura | Uso |
|---|---|---|
| `sm` | 640px | Sidebar colapsa para ícones; tabelas viram cards |
| `md` | 768px | Grid de 2 colunas |
| `lg` | 1024px | Grid completo (3–4 colunas) |

Grids padrão:
- KPI cards: `grid-cols-2 lg:grid-cols-4`
- Seções: `grid-cols-1 lg:grid-cols-2`

---

## 9. Regras de Ouro

1. **Sempre use token** — `var(--bg-card)` nunca `bg-slate-800`
2. **Status semântico é fixo** — verde = pago em qualquer tema
3. **Sem inline `style={{ color: '#hex' }}`** — sempre componente ou token
4. **Charts passam cores via prop** — não usar `fill` hardcoded
5. **Novo componente = documentado aqui primeiro**
