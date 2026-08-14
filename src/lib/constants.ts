export const STORAGE_KEY = "carga_maquina_pcp_v11_supabase"
export const THEME_STORAGE_KEY = "carga_maquina_pcp_tema"
export const APP_STATE_ID = "carga-maquina-principal"
export const ID_ALMOX = "__ALMOX__"
export const MIN_SCHEDULE_YEAR = 2020
export const MAX_SCHEDULE_YEAR = 2100

export const MACHINE_STATUSES = [
  "EM OPERAÇÃO",
  "EM MANUTENÇÃO",
  "EQUIPAMENTO DESATIVADO",
  "EQUIPAMENTO S/OPERADOR"
] as const

export const OP_STATUSES = [
  "LIBERADA",
  "PLANEJADA"
] as const

export const JOB_STATUSES = [
  "EM OPERAÇÃO",
  "FILA MÁQUINA",
  "FILA - PCP",
  "PLANEJADA",
  "FINALIZADO",
  "MAT. EM OUTRA MÁQUINA",
  "FERRAMENTARIA",
  "SOLDAGEM",
  "SERVIÇO EXTERNO",
  "EM INSPEÇÃO",
  "AGUARDANDO MATÉRIA PRIMA",
  "QUALIDADE"
] as const

export const PROCESSOS_PADRAO = [
  { nome: "INSP. (QUALIDADE)", dias: 2, padrao: /insp/i },
  { nome: "L.P.",              dias: 1, padrao: /\bl\.?\s*p\.?\b|lp|liquido/i },
  { nome: "BANC-REB",          dias: 1, padrao: /banc.*reb|rebarb/i },
  { nome: "RADIO",             dias: 3, padrao: /\bradio\b/i },
  { nome: "ULTR.",             dias: 1, padrao: /\bultr\.(?!\s*\/)/i },
  { nome: "SERRA",             dias: 1, padrao: /\bshf\b/i },
  { nome: "JATO",              dias: 1, padrao: /\bjato\b|jateamento/i },
  { nome: "PINTURA",           dias: 2, padrao: /\bpintura\b/i }
]
