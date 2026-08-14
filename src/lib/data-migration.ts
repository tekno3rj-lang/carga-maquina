import type { AppDB, Machine, ExternalService, Roteiro } from "@/store/types"
import { normalizarStatusTrabalho, normalizarSequenciaOperacional, extrairRoteirosDasMaquinas } from "@/lib/scheduling"
import { uid, parseDataOperacional, toDatetimeLocal } from "@/lib/formats"

// Also re-export for modules that import uid from data-migration
export { uid }

export function compararMaquinasPorNome(a: Machine, b: Machine): number {
  return String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR", {
    sensitivity: "base",
    numeric: true
  })
}

export function extrairDadosMaquina(maquina: Machine): Machine {
  const { _updatedAt, ...dados } = maquina as Machine & { _updatedAt?: string }
  return dados
}

export function normalizarDataEntrada(valor: string): string {
  const data = parseDataOperacional(valor)
  return data ? toDatetimeLocal(data) : ""
}

type ObjetoImportado = Record<string, unknown>

export function normalizarDB(data: unknown): AppDB {
  const dados = data as ObjetoImportado | null | undefined
  const fatorValor = dados?.fator
  const maquinasImportadas = Array.isArray(dados?.maquinas) ? (dados.maquinas as ObjetoImportado[]) : []
  const base: AppDB = {
    maquinas: maquinasImportadas.map((m: ObjetoImportado) => ({
      id: (m.id as string) || uid(),
      nome: (m.nome as string) || "Máquina sem nome",
      statusMaquina: (m.statusMaquina as string) || "EM OPERAÇÃO",
      turnos: ["1", "2", "3"].includes(m.turnos as string) ? (m.turnos as string) : "1",
      trabalhos: Array.isArray(m.trabalhos) ? (m.trabalhos as ObjetoImportado[]).map((t, index: number) => ({
        id: (t.id as string) || uid(),
        desc: (t.desc as string) || "",
        pv: (t.pv as string) || "",
        op: (t.op as string) || "",
        maquinaId: (t.maquinaId as string) || "",
        np: (t.np as string) || "",
        sequencia: normalizarSequenciaOperacional((t.sequencia ?? t.seq) as number | string, (index + 1) * 5),
        roteiroId: (t.roteiroId as string) || "",
        roteiroEtapa: Number(t.roteiroEtapa || 0),
        entradaMinimaRoteiro: normalizarDataEntrada((t.entradaMinimaRoteiro as string) || ""),
        entradaManual: Boolean(t.entradaManual),
        entradaManualValor: normalizarDataEntrada((t.entradaManualValor as string) || ""),
        qtd: Number(t.qtd || 0),
        setup: Number(t.setup || 0),
        usinagem: Number(t.usinagem || 0),
        diasProcesso: Number(t.diasProcesso || 0),
        entrada: normalizarDataEntrada((t.entrada as string) || ""),
        saida: normalizarDataEntrada((t.saida as string) || ""),
        saidaManual: Boolean(t.saidaManual),
        entradaRealizada: t.entradaRealizada ? normalizarDataEntrada(t.entradaRealizada as string) : undefined,
        finalizadoEm: t.finalizadoEm ? normalizarDataEntrada(t.finalizadoEm as string) : undefined,
        status: normalizarStatusTrabalho(t.status as string),
        opStatus: (t.opStatus as string) || (normalizarStatusTrabalho(t.status as string) === "PLANEJADA" ? "PLANEJADA" : "LIBERADA"),
        observacao: (t.observacao as string) || (t.obs as string) || "",
        fornecedorExterno: (t.fornecedorExterno as string) || "",
        tipoServicoExterno: (t.tipoServicoExterno as string) || ""
      })) : []
    })),
    roteiros: Array.isArray(dados?.roteiros) ? (dados.roteiros as Roteiro[]) : [],
    atualId: (dados?.atualId as string) ?? null,
    fator: (typeof fatorValor === "number" && fatorValor > 0) ? fatorValor : 4.2,
    mostrarOcultos: Boolean(dados?.mostrarOcultos),
    mostrarPlanejadas: Boolean(dados?.mostrarPlanejadas),
    prioridadesPV: Array.isArray(dados?.prioridadesPV) ? (dados.prioridadesPV as string[]) : [],
    servicosExternosConfig: Array.isArray(dados?.servicosExternosConfig) ? (dados.servicosExternosConfig as ExternalService[]) : [],
    _configUpdatedAt: null
  }

  base.maquinas.sort(compararMaquinasPorNome)

  if (!base.roteiros || base.roteiros.length === 0) {
    base.roteiros = extrairRoteirosDasMaquinas(base.maquinas)
  }

  if (!base.maquinas.some((m: Machine) => m.id === base.atualId)) {
    base.atualId = base.maquinas[0]?.id || null
  }

  return base
}

export function importarJSON(jsonStr: string): AppDB | null {
  try {
    return normalizarDB(JSON.parse(jsonStr.replace(/^\uFEFF/, "")))
  } catch {
    return null
  }
}

export function exportarJSON(state: AppDB): string {
  const exportData = {
    maquinas: state.maquinas.map(extrairDadosMaquina),
    roteiros: state.roteiros,
    atualId: state.atualId,
    fator: state.fator,
    mostrarOcultos: state.mostrarOcultos,
    mostrarPlanejadas: state.mostrarPlanejadas,
    prioridadesPV: state.prioridadesPV,
    servicosExternosConfig: state.servicosExternosConfig
  }
  return JSON.stringify(exportData, null, 2)
}
