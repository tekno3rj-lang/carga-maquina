<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Projeto: Carga Máquina — APS/MES

## Visão Geral

Sistema de **Planejamento e Controle de Produção (PCP)** para manufatura industrial. Atualmente é um **clone de APS (Advanced Planning & Scheduling)** para carga de máquina, priorização de fila e sequenciamento de roteiros de produção. A visão de longo prazo é evoluir para um **MES (Manufacturing Execution System)** completo.

**Stack:**
- Next.js 16 (App Router) — static export
- React 19
- TypeScript (strict)
- Zustand 5 (estado global com persistência localStorage)
- Supabase (banco + real-time sync)
- Tailwind CSS v4
- Deploy: Netlify (pasta `out/`)

## Estrutura do Projeto

```
src/
├── app/                    # Páginas Next.js App Router
│   ├── layout.tsx          # Layout root com AppProvider
│   ├── page.tsx            # Página principal (SPA)
│   └── globals.css         # Estilos globais + design system
├── components/             # Componentes React
│   ├── AppProvider.tsx      # Bootstrap: hidrata persistência → carrega Supabase → subscribe real-time
│   ├── Header.tsx           # Header com logo, busca global, menu de configurações
│   ├── MachineSidebar.tsx   # Sidebar com lista de máquinas (sidebar + tabs mobile)
│   ├── CurrentPanel.tsx     # Painel de status da máquina selecionada (stats + fator)
│   ├── JobsTable.tsx        # Tabela de trabalhos com drag-and-drop reordenável
│   ├── PlannedJobsTable.tsx # Visão geral de OPs planejadas, agrupadas por roteiro
│   ├── SearchDropdown.tsx   # Busca global com autocomplete e navegação
│   ├── Overlays.tsx         # Toast de cópia + indicador de status do banco (DbStatus)
│   └── modals/
│       ├── MachineModal.tsx         # CRUD de máquinas
│       ├── ServiceModal.tsx         # Criar/editar serviço com roteiro multi-etapa
│       ├── PVPriorityModal.tsx      # Gerenciar prioridades de PV (Pedido de Venda)
│       ├── ExternalServicesModal.tsx # Configurar serviços externos (fornecedores)
│       └── SimulationModal.tsx      # Simular datas de uma OP planejada
├── lib/                    # Lógica de negócio
│   ├── constants.ts        # Constantes: status, chaves storage, processos padrão
│   ├── scheduling.ts       # ALGORITMO DE SEQUENCIAMENTO (grafo, dependências, cálculo de datas)
│   ├── formats.ts          # Formatação de data/hora, minutos, utilidades
│   ├── supabase.ts         # Cliente Supabase (singleton condicional)
│   ├── sync.ts             # Sincronização bidirecional com Supabase (push + real-time)
│   └── data-migration.ts   # Normalização, importação/exportação JSON, migração de dados
├── store/                  # Estado global (Zustand)
│   ├── types.ts            # Interfaces TypeScript: Machine, Job, Roteiro, ExternalService, etc.
│   └── useAppStore.ts      # Store central com todas as actions e persistência
└── hooks/                  # (vazio — sem hooks customizados ainda)
```

## Modelo de Dados

### Machine (Máquina)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | string | UUID |
| nome | string | Nome da máquina |
| statusMaquina | string | EM OPERAÇÃO, EM MANUTENÇÃO, EQUIPAMENTO DESATIVADO, EQUIPAMENTO S/OPERADOR |
| turnos | string | "1" ou "2" (turnos) |
| trabalhos | Job[] | Lista de trabalhos/jobs na máquina |

### Job (Trabalho/Serviço)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | string | UUID |
| desc | string | Descrição do item |
| np | string | Código NP (peça) |
| op | string | Ordem de Produção |
| pv | string | Pedido de Venda |
| qtd | number | Quantidade |
| setup | number | Minutos de setup |
| usinagem | number | Minutos por peça |
| diasProcesso | number | Dias corridos (processos tipo inspeção) |
| sequencia | number | Sequência operacional (múltiplos de 5) |
| roteiroId | string | Chave de agrupamento do roteiro |
| roteiroEtapa | number | Índice da etapa no roteiro (1-based) |
| entrada | string | Data/hora de entrada (datetime-local) |
| saida | string | Data/hora de saída (calculada) |
| status | string | EM OPERAÇÃO, FILA MÁQUINA, FILA - PCP, PLANEJADA, FINALIZADO, etc. |
| opStatus | string | LIBERADA ou PLANEJADA |
| maquinaId | string | ID da máquina atual |

### Roteiro
Agrupa jobs de uma mesma OP espalhados por várias máquinas. Centraliza dados comuns (desc, np, pv, qtd) e a lista de etapas com machineId, setup, usinagem específicos.

### Serviço Externo
Configuração de fornecedor + tipo de serviço + dias corridos padrão.

## Funcionalidades Principais

### Sequenciamento (APS Core)
Algoritmo em `scheduling.ts` (`criarGrafoSequenciamento` → `recalcularSequenciamento`):
- Constrói grafo de dependências (ordem dentro da máquina + dependências de roteiro entre máquinas)
- Ordenação topológica para processar nós sem dependências pendentes
- Cálculo de entrada/saída considerando turnos, horário comercial, almoço, dias úteis
- Fator de segurança multiplica o tempo de setup
- Detecta ciclos/conflitos e tenta processar mesmo assim

### Gerenciamento de Máquinas
CRUD completo com nome, status (definido por enum), e configuração de 1 ou 2 turnos.

### Gerenciamento de Serviços com Roteiro
- Criação de serviços com roteiro multi-etapa (diferentes máquinas)
- Autocompletar roteiro ao digitar NP
- Suporte a processos padrão (INSP, LP, BANC-REB) e serviços externos com dias corridos
- Reordenação por drag-and-drop (quando não é processo padrão)

### Priorização por PV (Pedido de Venda)
Lista ordenada de PVs prioritários. "Aplicar priorização" reordena a fila de cada máquina colocando jobs de PVs prioritários no topo.

### Simulação
Testa a inserção de uma OP planejada na carga atual e calcula as datas previstas de entrada/saída em cada etapa do roteiro.

### Sincronização Supabase
- Carga inicial do banco ao abrir
- Push automático (2s debounce) ao detectar mudanças no estado
- Escuta real-time via `postgres_changes` (Replication)
- Resolução básica de conflitos por timestamp

## ALGORITMO DE SEQUENCIAMENTO (detalhes)

Este é o coração do APS. Localizado em `src/lib/scheduling.ts`:

1. **Construção do grafo** (`criarGrafoSequenciamento`):
   - Cada job ativo + planejado vira um nó (SchedulingNode)
   - Dependências de fila: jobs na mesma máquina têm arestas ordem→próximo
   - Dependências de roteiro: jobs do mesmo roteiroId são ordenados por roteiroEtapa
   - Jobs sem dependências têm grauEntrada = 0

2. **Ordenação topológica** (`recalcularSequenciamento`):
   - Processa nós com grauRestante = 0 em ordem de inserção
   - Para cada nó: calcula entrada (máxima entre restrições) e saída (turnos ou dias)
   - Decrementa grauRestante dos nós dependentes
   - Nós não processados (ciclos) são processados ao final e sinalizados como conflito

3. **Cálculo de saída** (`calcularSaida`, `adicionarMinutosUteis`):
   - Turnos: expediente 08:00–17:48 (1 turno) ou 08:00–18:00 (2 turnos)
   - Almoço: 12:00–13:00
   - Dias úteis: segunda a sexta
   - Setup fatorado por `fator` configurável

4. **Processos padrão**: usam dias corridos (`adicionarDiasProcesso`) em vez de minutos

## Arquivos de Configuração

| Arquivo | Finalidade |
|---------|------------|
| `package.json` | Dependências e scripts |
| `next.config.ts` | Static export + allow dev origins |
| `tsconfig.json` | TypeScript strict, path alias `@/` |
| `postcss.config.mjs` | Tailwind CSS v4 |
| `eslint.config.mjs` | ESLint com regras Next.js |
| `netlify.toml` | Build + deploy config |
| `.env.local` | Supabase URL + anon key |
| `supabase-schema.sql` | Schema do banco (maquinas + app_config) |

## Convenções de Código

- **Nomes em português** (variáveis, comentários, texto na UI) — o sistema é para usuários brasileiros
- **Componentes client-side** com `"use client"`
- **Store Zustand** com persistência em `localStorage` (chave: `carga_maquina_pcp_v11_supabase`)
- **Eventos customizados** (`open-modal`, `edit-job`, `simular-planejada`) para comunicação entre componentes modais
- **CSS**: Tailwind + variáveis CSS no `globals.css` (temas claro/escuro via classe `.dark` no `<html>`)
- **Path alias**: `@/` mapeia para `src/`

## Roteiro de Evolução (APS → MES)

### Curto prazo (APS avançado)
- [ ] Histórico de jobs finalizados com timeline
- [ ] Relatórios de OEE (Overall Equipment Effectiveness)
- [ ] Apontamento de produção (início/fim de cada job)
- [ ] Dashboard com indicadores de performance

### Médio prazo (MES Core)
- [ ] Controle de qualidade (inspeções, não-conformidades)
- [ ] Rastreabilidade por lote/NP
- [ ] Ordens de serviço de manutenção
- [ ] Controle de estoque (matéria-prima integrada ao sequenciamento)
- [ ] Integração com ERP (importar OPs, exportar apontamentos)

### Longo prazo (MES Completo)
- [ ] Interface com IoT/sensores de máquina
- [ ] Painéis em tempo real (Andon)
- [ ] Análise preditiva de manutenção
- [ ] Gestão de ferramentas e dispositivos
- [ ] Módulo de RH/escala de operadores

## Comandos

```bash
npm run dev       # Desenvolvimento
npm run build     # Build estático (pasta out/)
npm run lint      # ESLint
```

## Observações para Agentes de IA

- **NÃO confie no conhecimento padrão de Next.js** — leia `node_modules/next/dist/docs/` antes de codificar
- **NÃO adicione comentários** ao código
- **Mantenha os nomes em português** para variáveis, funções de UI e texto visível
- **Siga o padrão existente** de componentes, tipos e store ao adicionar funcionalidades
- **Preferência por editar arquivos existentes** em vez de criar novos, a menos que seja estritamente necessário
- **O sistema é SPA** (single page com modais), sem rotas múltiplas
- **Toda comunicação entre componentes** usa eventos customizados no `window`
- **O sync com Supabase é automático** — mudanças na store são propagadas
