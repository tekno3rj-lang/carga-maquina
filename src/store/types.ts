export interface ExternalService {
  id: string
  fornecedor: string
  servico: string
  dias: number
}

export interface RouteItem {
  machineId: string
  setup: number
  usinagem: number
  diasProcesso?: number
  fornecedorExterno?: string
  tipoServicoExterno?: string
  status?: string
}

export interface RoteiroEtapa {
  machineId: string
  setup: number
  usinagem: number
  diasProcesso: number
  fornecedorExterno: string
  tipoServicoExterno: string
  status: string
}

export interface Roteiro {
  id: string
  desc: string
  np: string
  op: string
  pv: string
  qtd: number
  sequencia: number
  opStatus: string
  observacao: string
  fornecedorExterno: string
  tipoServicoExterno: string
  entradaMinimaRoteiro: string
  entradaManual: boolean
  entradaManualValor: string
  updatedAt?: string
  etapas: RoteiroEtapa[]
}

export interface Job {
  id: string
  desc: string
  pv: string
  op: string
  maquinaId: string
  np: string
  sequencia: number
  roteiroId: string
  roteiroEtapa: number
  entradaMinimaRoteiro: string
  entradaManual: boolean
  entradaManualValor: string
  qtd: number
  setup: number
  usinagem: number
  diasProcesso: number
  entrada: string
  saida: string
  saidaManual: boolean
  entradaRealizada?: string
  finalizadoEm?: string
  status: string
  opStatus: string
  observacao: string
  fornecedorExterno: string
  tipoServicoExterno: string
  desconsiderarCarga?: boolean
}

export interface Machine {
  id: string
  nome: string
  statusMaquina: string
  turnos: string
  trabalhos: Job[]
  _updatedAt?: string | null
}

export interface AppDB {
  maquinas: Machine[]
  roteiros: Roteiro[]
  atualId: string | null
  fator: number
  mostrarOcultos: boolean
  mostrarPlanejadas: boolean
  prioridadesPV: string[]
  servicosExternosConfig: ExternalService[]
  _configUpdatedAt?: string | null
}

export interface ProcessoPadrao {
  nome: string
  dias: number
  padrao: RegExp
}

export interface SchedulingNode {
  id: string
  trabalho: Job
  maquina: Machine
  deps: Set<string>
  proximos: Set<string>
  grauEntrada: number
  grauRestante: number
  temDependenciaFila: boolean
  ordem: number
}

export interface ResultadoSequenciamento {
  trabalhosComCiclo: Set<string>
  trabalhosBloqueadosSequenciamento: Set<string>
  trabalhosAguardandoRoteiro: Set<string>
  resumoCicloSequenciamento: string
}

export interface SimulacaoEtapa {
  maquinaNome: string
  maquinaId: string
  entrada: string
  saida: string
  setup: number
  usinagem: number
  qtd: number
  totalLote: number
}
