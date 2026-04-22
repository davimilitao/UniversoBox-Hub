/**
 * @file DesignSystem.jsx
 * @module admin
 * @description Showcase interativo do Design System — visualiza todos os componentes
 *              do ui/ em tempo real com troca de tema. Rota: /admin/design-system
 * @version 1.0.0
 * @date 2026-04-22
 */

import { useState } from 'react';
import {
  Palette, Receipt, AlertCircle, TrendingUp, CheckCircle,
  Package, Zap, Download, Trash2, Plus, Search,
} from 'lucide-react';

import { Button }     from '../../components/ui/Button';
import { Badge }      from '../../components/ui/Badge';
import { Card }       from '../../components/ui/Card';
import { StatCard }   from '../../components/ui/StatCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable }  from '../../components/ui/DataTable';
import { Toast }      from '../../components/ui/Toast';
import { Skeleton }   from '../../components/ui/Skeleton';

// ─── Dados de demo ────────────────────────────────────────────────────────────

const DEMO_DESPESAS = [
  { id: 1, descricao: 'Frete Jadlog',        valor: 1250.00, status: 'pago',     categoria: 'Logística' },
  { id: 2, descricao: 'Adobe Creative Cloud', valor: 349.90, status: 'pendente', categoria: 'Software'  },
  { id: 3, descricao: 'Aluguel Galpão',       valor: 4800.00, status: 'vencido', categoria: 'Imóvel'    },
  { id: 4, descricao: 'Energia Elétrica',     valor: 780.45, status: 'pago',     categoria: 'Utilidades'},
];

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// ─── Seção wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

// ─── Token swatch ─────────────────────────────────────────────────────────────

function TokenRow({ token, label }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-8 h-8 rounded-lg border shrink-0"
        style={{ background: `var(${token})`, borderColor: 'var(--border)' }}
      />
      <div>
        <p className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{token}</p>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
    </div>
  );
}

// ─── Temas disponíveis ────────────────────────────────────────────────────────

const TEMAS = ['dark', 'uber', 'ifood', '99', 'marvel', 'rick'];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DesignSystem() {
  const [toast, setToast]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [temaAtivo, setTemaAtivo] = useState(
    () => document.documentElement.getAttribute('data-theme') ?? 'dark'
  );

  function mudarTema(tema) {
    document.documentElement.classList.add('theme-transitioning');
    document.documentElement.setAttribute('data-theme', tema);
    setTemaAtivo(tema);
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 400);
  }

  function dispararToast(tipo) {
    setToast({ msg: tipo === 'ok' ? 'Operação realizada com sucesso!' : 'Ocorreu um erro inesperado.', tipo });
    setTimeout(() => setToast(null), 3000);
  }

  function toggleLoading() {
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-10 pb-20">

      {/* Header */}
      <PageHeader
        titulo="Design System"
        subtitulo="Biblioteca de componentes do UniversoBox Hub — todos temáticos por padrão"
        icon={Palette}
        actions={
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {TEMAS.map(t => (
              <button
                key={t}
                onClick={() => mudarTema(t)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize ${temaAtivo === t ? 'text-white' : ''}`}
                style={temaAtivo === t
                  ? { background: 'var(--accent)', color: 'var(--accent-text)' }
                  : { color: 'var(--text-muted)' }
                }
              >
                {t}
              </button>
            ))}
          </div>
        }
      />

      {/* Tokens */}
      <Section title="Tokens — Cores do tema ativo">
        <Card>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <TokenRow token="--bg-app"      label="Fundo raiz" />
            <TokenRow token="--bg-surface"  label="Superfícies" />
            <TokenRow token="--bg-card"     label="Cards" />
            <TokenRow token="--accent"      label="Destaque primário" />
            <TokenRow token="--accent-dim"  label="Accent suave" />
            <TokenRow token="--accent-text" label="Texto accent" />
            <TokenRow token="--text-primary" label="Texto principal" />
            <TokenRow token="--text-muted"  label="Texto muted" />
          </div>
        </Card>
      </Section>

      {/* Paleta semântica */}
      <Section title="Paleta Semântica — fixa independente de tema">
        <Card>
          <div className="flex flex-wrap gap-3">
            <Badge variant="pago">pago</Badge>
            <Badge variant="success">success</Badge>
            <Badge variant="pendente">pendente</Badge>
            <Badge variant="warning">warning</Badge>
            <Badge variant="vencido">vencido</Badge>
            <Badge variant="danger">danger</Badge>
            <Badge variant="info">info</Badge>
            <Badge variant="accent">accent (tema)</Badge>
            <Badge variant="muted">muted</Badge>
          </div>
        </Card>
      </Section>

      {/* Botões */}
      <Section title="Button">
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Button>Primary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="danger">Danger</Button>
              <Button loading>Loading</Button>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <Button size="sm"><Plus size={12} />Novo (sm)</Button>
              <Button size="md"><Download size={14} />Exportar (md)</Button>
              <Button size="lg"><Search size={16} />Buscar (lg)</Button>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => dispararToast('ok')}>Toast Sucesso</Button>
              <Button variant="danger" onClick={() => dispararToast('erro')}>Toast Erro</Button>
              <Button variant="ghost" onClick={toggleLoading}>
                {loading ? 'Simulando...' : 'Simular Loading'}
              </Button>
            </div>
          </div>
        </Card>
      </Section>

      {/* Cards */}
      <Section title="Card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Card padrão — usa <code className="font-mono text-xs">var(--bg-card)</code></p>
          </Card>
          <Card glass>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Card glass — backdrop blur</p>
          </Card>
          <Card padding="lg">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Card com padding lg</p>
          </Card>
        </div>
      </Section>

      {/* StatCard */}
      <Section title="StatCard — KPI Cards">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard titulo="Vencido"    valor={4800.00}  count={1}  variante="danger"   icon={AlertCircle} />
          <StatCard titulo="Pendente"   valor={349.90}   count={1}  variante="warning"  icon={TrendingUp} trend="+5%" />
          <StatCard titulo="Pago"       valor={2030.45}  count={2}  variante="success"  icon={CheckCircle} />
          <StatCard titulo="Total Mês"  valor={7180.35}  count={4}  variante="highlight" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard titulo="Pedidos"    valor="142"      variante="default"  icon={Package} />
          <StatCard titulo="Expedidos"  valor="138"      variante="success"  icon={Zap} trend="+3" />
          <StatCard titulo="Accent"     valor="100%"     variante="accent" />
          <StatCard titulo="Apenas valor" valor={9999.00} />
        </div>
      </Section>

      {/* Skeleton */}
      <Section title="Skeleton — Loading states">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton h="h-24" />
          <Skeleton h="h-24" />
          <Skeleton h="h-24" />
        </div>
        <Skeleton count={3} h="h-10" />
      </Section>

      {/* DataTable */}
      <Section title="DataTable">
        <DataTable
          loading={loading}
          columns={[
            { key: 'descricao', label: 'Descrição' },
            { key: 'categoria', label: 'Categoria' },
            { key: 'valor',     label: 'Valor',  render: v => <span className="font-mono">{BRL.format(v)}</span> },
            { key: 'status',    label: 'Status', render: v => <Badge variant={v}>{v}</Badge> },
          ]}
          data={DEMO_DESPESAS}
          emptyText="Nenhuma despesa encontrada"
        />
      </Section>

      {/* PageHeader variações */}
      <Section title="PageHeader — variações">
        <Card>
          <div className="flex flex-col gap-6">
            <PageHeader
              titulo="Com ícone e ações"
              subtitulo="Subtítulo descritivo da seção"
              icon={Receipt}
              actions={<><Button size="sm" variant="ghost">Cancelar</Button><Button size="sm"><Plus size={12}/>Novo</Button></>}
            />
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              <PageHeader titulo="Sem ícone, só título e ação" actions={<Button size="sm" variant="outline"><Download size={12}/>Exportar</Button>} />
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              <PageHeader titulo="Só título" subtitulo="Sem ações, sem ícone" />
            </div>
          </div>
        </Card>
      </Section>

      {/* Toast (montado fora do fluxo) */}
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}

      {/* Guia de uso */}
      <Section title="Como usar — import">
        <Card>
          <pre className="text-xs overflow-x-auto font-mono" style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
{`// Barrel — importa tudo de uma vez
import { Button, Badge, Card, StatCard, PageHeader, DataTable, Toast, Skeleton }
  from '../../components/ui';

// Uso mínimo
<StatCard titulo="Vencido" valor={4800} variante="danger" count={3} />
<Badge variant="pago">Pago</Badge>
<Button loading={salvando} onClick={salvar}>Salvar</Button>
<DataTable columns={cols} data={rows} loading={carregando} />`}
          </pre>
        </Card>
      </Section>

    </div>
  );
}
