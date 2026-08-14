import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Machine, Job, ExternalService, SimulacaoEtapa, Roteiro } from "@/store/types"
import { ID_ALMOX, STORAGE_KEY } from "@/lib/constants"
import {
  recalcularSequenciamento,
  totalLote,
  normalizarStatusTrabalho,
  obterPrioridadePV,
  isJobFinalizado,
  isJobLiberado,
  isJobPlanejado,
  trabalhosAtivos,
  moverParaPrioridadeMaxima,
  extrairRoteirosDasMaquinas,
  normalizarJobsRoteiroId,
  compararPrecedenciaRoteiro,
  maquinaUsaFilaPrioridade
} from "@/lib/scheduling"
import { toDatetimeLocal, normalizarDataEntrada, parseDataOperacional } from "@/lib/formats"
import { uid as gerarId } from "@/lib/data-migration"
import { compararMaquinasPorNome } from "@/lib/data-migration"
import type { NivelAcesso } from "@/lib/auth"

const LIMITE_HISTORICO = 30
const INTERVALO_AGRUPAMENTO_HISTORICO_MS = 700

const CAMPOS_SCHEDULING = new Set([
  "setup", "usinagem", "qtd", "sequencia", "status", "entrada", "saida",
  "maquinaId", "opStatus", "roteiroId", "roteiroEtapa", "diasProcesso",
  "entradaManual", "entradaManualValor", "saidaManual"
])

function temCampoScheduling(updates: Partial<Job>): boolean {
  return Object.keys(updates).some(k => CAMPOS_SCHEDULING.has(k))
}

function seqEfetiva(job: Job): number {
  const n = Number(job?.sequencia)
  return Number.isFinite(n) && n > 0 ? n : 5
}

function ehEmOperacao(job: Job): boolean {
  return String(job?.status || "").toUpperCase() === "EM OPERAÇÃO"
}

function obterBlocoRoteiro(maquinas: Machine[], machineId: string, jobId: string): Job[] {
  const todos = maquinas.flatMap(m => m.trabalhos)
  const alvo = todos.find(j => j.id === jobId)
  if (!alvo) return []
  if (!alvo.roteiroId) return [alvo]
  const etapas = todos
    .filter(j => j.roteiroId === alvo.roteiroId && isJobLiberado(j) && !isJobFinalizado(j))
    .sort(compararPrecedenciaRoteiro)
  const inicio = etapas.findIndex(j => j.id === jobId)
  if (inicio < 0) return [alvo]
  const bloco: Job[] = []
  for (let i = inicio; i < etapas.length; i++) {
    if (etapas[i].maquinaId !== machineId) break
    bloco.push(etapas[i])
  }
  return bloco
}

function reordenarBlocoFila(trabalhos: Job[], bloco: Job[], targetJobId: string): Job[] {
  const blocoIds = new Set(bloco.map(j => j.id))
  const ordem = [...bloco].sort(compararPrecedenciaRoteiro)
  const novos = trabalhos.filter(j => !blocoIds.has(j.id))
  const idxAlvo = novos.findIndex(j => j.id === targetJobId)
  if (idxAlvo < 0) novos.push(...ordem)
  else novos.splice(idxAlvo, 0, ...ordem)
  return novos
}

function mesmoRoteiro(a: Job, b: Job): boolean {
  return Boolean(a?.roteiroId && a.roteiroId === b?.roteiroId)
}

function validarOrdemSequencias(fila: Job[]): string | null {
  const ultimoPorRoteiro = new Map<string, Job>()
  for (const job of fila) {
    const id = job.roteiroId
    if (!id) continue
    const anterior = ultimoPorRoteiro.get(id)
    if (anterior && compararPrecedenciaRoteiro(job, anterior) < 0) {
      return `Bloqueado: a seq. op. ${seqEfetiva(job)} não pode ficar na frente da seq. op. ${seqEfetiva(anterior)} da mesma OP. A ordem das etapas do roteiro deve ser mantida na máquina.`
    }
    ultimoPorRoteiro.set(id, job)
  }
  return null
}

type ResultadoEdicaoRoteiro = { ok: true } | { ok: false; erro: string }

function ordenarEtapasDaOpNosMesmosEspacos(maquina: Machine, roteiroId: string): void {
  if (!maquinaUsaFilaPrioridade(maquina.nome)) return
  const indices: number[] = []
  const etapas: Job[] = []
  maquina.trabalhos.forEach((trabalho, indice) => {
    if (trabalho.roteiroId !== roteiroId || isJobFinalizado(trabalho)) return
    indices.push(indice)
    etapas.push(trabalho)
  })
  etapas.sort(compararPrecedenciaRoteiro)
  indices.forEach((indice, ordem) => {
    maquina.trabalhos[indice] = etapas[ordem]
  })
}

function mensagemBloqueioEdicao(job: Job): string {
  const op = job.op?.trim() || job.roteiroId || "sem identificação"
  return `A OP "${op}" não pode ser salva porque a seq. op. ${seqEfetiva(job)} está EM OPERAÇÃO e precisaria mudar de máquina ou posição.`
}

function reconstruirFilasAposEdicao(
  maquinasAntes: Machine[],
  roteiroIdAnterior: string,
  trabalhosAtualizados: Job[]
): Machine[] {
  return maquinasAntes.map(maquinaAntes => {
    const destinos = trabalhosAtualizados.filter(t => t.maquinaId === maquinaAntes.id)
    const finalizados = new Map(destinos.filter(isJobFinalizado).map(t => [t.id, t]))
    const aguardando = destinos.filter(t => !isJobFinalizado(t)).sort(compararPrecedenciaRoteiro)
    const trabalhos: Job[] = []

    for (const anterior of maquinaAntes.trabalhos) {
      if (anterior.roteiroId !== roteiroIdAnterior) {
        trabalhos.push(structuredClone(anterior))
        continue
      }
      if (isJobFinalizado(anterior)) {
        const mantido = finalizados.get(anterior.id)
        if (mantido) {
          trabalhos.push(mantido)
          finalizados.delete(anterior.id)
        }
        continue
      }
      const proximo = aguardando.shift()
      if (proximo) trabalhos.push(proximo)
    }

    trabalhos.push(...aguardando, ...finalizados.values())
    const maquina = { ...structuredClone(maquinaAntes), trabalhos }
    ordenarEtapasDaOpNosMesmosEspacos(maquina, trabalhosAtualizados[0]?.roteiroId || roteiroIdAnterior)
    return maquina
  })
}

function reposicionarEtapaPorData(maquinas: Machine[], maquina: Machine, jobId: string, chegada: string): Machine[] {
  const chegadaMs = parseDataOperacional(chegada)?.getTime()
  if (!chegadaMs) return maquinas

  const ativos = maquina.trabalhos.filter(j => !isJobFinalizado(j) && isJobLiberado(j))
  const bloco = obterBlocoRoteiro(maquinas, maquina.id, jobId)
  const blocoIds = new Set(bloco.map(j => j.id))
  const ordemBloco = [...bloco].sort(compararPrecedenciaRoteiro)
  const lider = bloco[0]
  if (!lider || !blocoIds.has(jobId)) return maquinas
  const filaSem = ativos.filter(j => !blocoIds.has(j.id))
  if (filaSem.length === 0) return maquinas

  let posBase = -1
  ativos.forEach((j, idx) => { if (ehEmOperacao(j)) posBase = idx })
  let indice = 0
  if (posBase >= 0) {
    const base = filaSem.findIndex(j => j.id === ativos[posBase].id)
    indice = base >= 0 ? base + 1 : filaSem.length
  }

  while (indice < filaSem.length) {
    const fimMs = parseDataOperacional(filaSem[indice].saida || filaSem[indice].entrada)?.getTime()
    if (fimMs && fimMs > chegadaMs) break
    indice++
  }

  const seqMin = seqEfetiva(lider)
  const seqMax = seqEfetiva(ordemBloco[ordemBloco.length - 1])
  const mesmoRoteiroDoJob = (candidato: Job) => Boolean(candidato.roteiroId && lider.roteiroId && candidato.roteiroId === lider.roteiroId)
  let posicao = indice
  let achou = false
  for (; posicao <= filaSem.length; posicao++) {
    const anterior = posicao > 0 ? filaSem[posicao - 1] : null
    const proximo = posicao < filaSem.length ? filaSem[posicao] : null
    const ok = (!anterior || !mesmoRoteiroDoJob(anterior) || seqEfetiva(anterior) <= seqMin)
      && (!proximo || !mesmoRoteiroDoJob(proximo) || seqEfetiva(proximo) >= seqMax)
    if (ok) { achou = true; break }
  }
  if (!achou) return maquinas
  indice = posicao

  const alvoId = indice < filaSem.length ? filaSem[indice].id : null
  const novos = maquina.trabalhos.filter(j => !blocoIds.has(j.id))
  if (alvoId) {
    const idxAlvo = novos.findIndex(j => j.id === alvoId)
    novos.splice(idxAlvo < 0 ? novos.length : idxAlvo, 0, ...ordemBloco)
  } else {
    novos.push(...ordemBloco)
  }
  maquina.trabalhos = novos
  return maquinas
}

function propagarPrioridadeRoteiro(maquinas: Machine[], jobId: string, fator: number): Machine[] {
  const todos = maquinas.flatMap(m => m.trabalhos.map(t => ({ maquina: m, trabalho: t })))
  const alvo = todos.find(e => e.trabalho.id === jobId)
  if (!alvo?.trabalho.roteiroId) return maquinas

  const etapas = todos
    .filter(e => e.trabalho.roteiroId === alvo.trabalho.roteiroId && isJobLiberado(e.trabalho) && !isJobFinalizado(e.trabalho))
    .sort((a, b) => compararPrecedenciaRoteiro(a.trabalho, b.trabalho))

  const indiceMovido = etapas.findIndex(e => e.trabalho.id === jobId)
  if (indiceMovido < 0) return maquinas

  let ultimaMaquinaReposicionada: string | null = null
  for (let i = indiceMovido + 1; i < etapas.length; i++) {
    if (etapas[i].maquina.id === ultimaMaquinaReposicionada) continue
    recalcularSequenciamento(maquinas, fator)
    const anterior = etapas[i - 1]
    const chegada = anterior.trabalho.saida || anterior.trabalho.entrada
    if (!chegada) continue
    reposicionarEtapaPorData(maquinas, etapas[i].maquina, etapas[i].trabalho.id, chegada)
    ultimaMaquinaReposicionada = etapas[i].maquina.id
  }
  return maquinas
}

function ordenarFilaPorPV(maquinas: Machine[], maq: Machine, fila: Job[], pvs: string[]): Job[] {
  const idsFila = new Set(fila.map(j => j.id))
  const liderDe = new Map<string, string>()
  const grupos = new Map<string, Job[]>()
  const roteirosNaFila = new Set(fila.map(j => j.roteiroId).filter(Boolean) as string[])

  for (const rid of roteirosNaFila) {
    const ordemGlobal = maquinas
      .flatMap(m => m.trabalhos)
      .filter(j => j.roteiroId === rid && isJobLiberado(j) && !isJobFinalizado(j))
      .sort((a, b) => Number(a.roteiroEtapa || 0) - Number(b.roteiroEtapa || 0))
    let liderAtual: string | null = null
    for (const etapa of ordemGlobal) {
      if (etapa.maquinaId !== maq.id) { liderAtual = null; continue }
      if (!idsFila.has(etapa.id)) { liderAtual = null; continue }
      if (liderAtual === null) {
        liderAtual = etapa.id
        grupos.set(liderAtual, [])
      }
      liderDe.set(etapa.id, liderAtual)
      grupos.get(liderAtual)!.push(etapa)
    }
  }

  const unidades: Job[][] = [...grupos.values()]
  for (const j of fila) {
    if (!liderDe.has(j.id)) unidades.push([j])
  }

  unidades.sort((a, b) => {
    const pa = obterPrioridadePV(a[0].pv, pvs)
    const pb = obterPrioridadePV(b[0].pv, pvs)
    if (pa !== pb) return pa - pb
    return (maq.trabalhos.indexOf(a[0]) || 0) - (maq.trabalhos.indexOf(b[0]) || 0)
  })

  return unidades.flat()
}

interface AppSnapshot {
  maquinas: Machine[]
  roteiros: Roteiro[]
  atualId: string | null
  fator: number
  prioridadesPV: string[]
  servicosExternosConfig: ExternalService[]
}

interface AppState {
  maquinas: Machine[]
  roteiros: Roteiro[]
  atualId: string | null
  fator: number
  usuario: { email: string; nivel: NivelAcesso } | null
  painelResumoVisivel: boolean
  mostrarOcultos: boolean
  mostrarPlanejadas: boolean
  prioridadesPV: string[]
  servicosExternosConfig: ExternalService[]
  _configUpdatedAt: string | null
  mostrandoPlanejadasGeral: boolean
  mostrandoMapeamento: boolean
  mapeamentoFiltroPV: string
  planejadasFiltroPV: string
  trabalhosComCiclo: Set<string>
  trabalhosBloqueadosSequenciamento: Set<string>
  trabalhosAguardandoRoteiro: Set<string>
  resumoCicloSequenciamento: string
  historicoUndo: AppSnapshot[]
  historicoRedo: AppSnapshot[]
  _recalcularAgendado: boolean

  addRoteiro: (roteiro: Roteiro) => void
  updateRoteiro: (id: string, updates: Partial<Roteiro>) => void
  removeRoteiro: (id: string) => void

  selectMachine: (id: string) => void
  addMachine: (nome: string, status: string, turnos: string) => void
  removeMachine: (id: string) => void
  editMachineName: (id: string, nome: string) => void
  editMachineStatus: (id: string, status: string) => void
  editMachineTurnos: (id: string, turnos: string) => void
  getMachineAtual: () => Machine | null
  getMaquinasOrdenadas: () => Machine[]

  addJob: (job: Job) => void
  salvarEdicaoRoteiro: (jobId: string, roteiro: Roteiro) => ResultadoEdicaoRoteiro
  updateJob: (machineId: string, jobId: string, updates: Partial<Job>) => void
  removeJob: (machineId: string, jobId: string) => void
  moveJob: (machineId: string, jobId: string, direction: number) => void
  moveJobToPosition: (machineId: string, jobId: string, targetJobId: string) => string | null
  updateJobStatus: (machineId: string, jobId: string, status: string) => void
  updateOpStatus: (machineId: string, jobId: string, opStatus: string) => void
  finalizarEtapasAnteriores: (jobId: string) => void

  aplicarPriorizacaoPV: () => void
  addPvPrioridade: (pv: string) => void
  removePvPrioridade: (pv: string) => void
  movePvNaLista: (pv: string, targetPv: string) => void

  setFator: (fator: number) => void
  setUsuario: (usuario: { email: string; nivel: NivelAcesso } | null) => void
  clearUsuario: () => void
  togglePainelResumo: () => void
  toggleOcultos: () => void
  setMostrarOcultos: (v: boolean) => void
  togglePlanejadasGeral: () => void
  setMostrandoPlanejadasGeral: (v: boolean) => void
  toggleMapeamento: () => void
  setMostrandoMapeamento: (v: boolean) => void
  setMapeamentoFiltroPV: (pv: string) => void
  setPlanejadasFiltroPV: (pv: string) => void

  addServicoExterno: (servico: ExternalService) => void
  removeServicoExterno: (id: string) => void

  toggleDesconsiderarCarga: (roteiroId: string) => void
  simularPlanejada: (roteiroId: string, dataEntrada: string, prioridade?: boolean) => SimulacaoEtapa[]
  undo: () => void
  redo: () => void

  _recalcular: () => void
  _marcarModificada: (machineId: string) => void
  _setMaquinas: (maquinas: Machine[], preserveRoteiros?: boolean) => void
  _setConfig: (config: Partial<Pick<AppState, 'fator' | 'mostrarOcultos' | 'prioridadesPV' | 'servicosExternosConfig' | '_configUpdatedAt'>>) => void
}

function criarSnapshot(state: AppState): AppSnapshot {
  return {
    maquinas: structuredClone(state.maquinas),
    roteiros: structuredClone(state.roteiros),
    atualId: state.atualId,
    fator: state.fator,
    prioridadesPV: structuredClone(state.prioridadesPV),
    servicosExternosConfig: structuredClone(state.servicosExternosConfig)
  }
}

function restaurarSnapshot(snapshot: AppSnapshot) {
  const maquinas = structuredClone(snapshot.maquinas)
  const result = recalcularSequenciamento(maquinas, snapshot.fator)
  return {
    maquinas,
    roteiros: structuredClone(snapshot.roteiros),
    atualId: snapshot.atualId,
    fator: snapshot.fator,
    prioridadesPV: structuredClone(snapshot.prioridadesPV),
    servicosExternosConfig: structuredClone(snapshot.servicosExternosConfig),
    trabalhosComCiclo: result.trabalhosComCiclo,
    trabalhosBloqueadosSequenciamento: result.trabalhosBloqueadosSequenciamento,
    trabalhosAguardandoRoteiro: result.trabalhosAguardandoRoteiro,
    resumoCicloSequenciamento: result.resumoCicloSequenciamento
  }
}

let ultimoRegistroHistoricoEm = 0
let ultimaChaveHistorico = ""

function registrarHistorico(set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState> | AppState)) => void, get: () => AppState) {
  const state = get()
  const snapshot = criarSnapshot(state)
  const chave = JSON.stringify(snapshot)
  const agora = Date.now()

  if (chave === ultimaChaveHistorico) return
  if (state.historicoUndo.length > 0 && agora - ultimoRegistroHistoricoEm < INTERVALO_AGRUPAMENTO_HISTORICO_MS) return

  set(s => ({
    historicoUndo: [...s.historicoUndo, snapshot].slice(-LIMITE_HISTORICO),
    historicoRedo: []
  }))

  ultimoRegistroHistoricoEm = agora
  ultimaChaveHistorico = chave
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      maquinas: [],
      roteiros: [],
      atualId: null,
      fator: 4.2,
      usuario: null,
      painelResumoVisivel: true,
      mostrarOcultos: false,
      mostrarPlanejadas: false,
      prioridadesPV: [],
      servicosExternosConfig: [],
      _configUpdatedAt: null,
      mostrandoPlanejadasGeral: false,
      mostrandoMapeamento: false,
      mapeamentoFiltroPV: "",
      planejadasFiltroPV: "",
      trabalhosComCiclo: new Set(),
      trabalhosBloqueadosSequenciamento: new Set(),
      trabalhosAguardandoRoteiro: new Set(),
      resumoCicloSequenciamento: "",
      historicoUndo: [],
      historicoRedo: [],
      _recalcularAgendado: false,

      addRoteiro: (roteiro) => {
        registrarHistorico(set, get)
        set(state => ({
          roteiros: [...state.roteiros.filter(r => r.id !== roteiro.id), roteiro]
        }))
      },

      updateRoteiro: (id, updates) => {
        registrarHistorico(set, get)
        set(state => ({
          roteiros: state.roteiros.map(r =>
            r.id === id ? { ...r, ...updates } : r
          )
        }))
      },

      removeRoteiro: (id) => {
        registrarHistorico(set, get)
        set(state => ({
          roteiros: state.roteiros.filter(r => r.id !== id)
        }))
      },

      selectMachine: (id) => {
        set({ atualId: id, mostrandoPlanejadasGeral: false, mostrandoMapeamento: false })
      },

      addMachine: (nome, status, turnos) => {
        registrarHistorico(set, get)
        const nova: Machine = {
          id: gerarId(),
          nome,
          statusMaquina: status,
          turnos,
          trabalhos: []
        }
        set(state => ({
          maquinas: [...state.maquinas, nova].sort(compararMaquinasPorNome),
          atualId: nova.id
        }))
      },

      removeMachine: (id) => {
        registrarHistorico(set, get)
        set(state => {
          const filtradas = state.maquinas.filter(m => m.id !== id)
          const novoAtualId = state.atualId === id
            ? (filtradas.sort(compararMaquinasPorNome)[0]?.id || null)
            : state.atualId
          return { maquinas: filtradas, atualId: novoAtualId }
        })
      },

      editMachineName: (id, nome) => {
        registrarHistorico(set, get)
        set(state => ({
          maquinas: state.maquinas.map(m =>
            m.id === id ? { ...m, nome: nome.trim() || "Máquina sem nome" } : m
          )
        }))
      },

      editMachineStatus: (id, status) => {
        registrarHistorico(set, get)
        set(state => ({
          maquinas: state.maquinas.map(m =>
            m.id === id ? { ...m, statusMaquina: status } : m
          )
        }))
      },

      editMachineTurnos: (id, turnos) => {
        registrarHistorico(set, get)
        set(state => ({
          maquinas: state.maquinas.map(m =>
            m.id === id ? { ...m, turnos: ["1", "2", "3"].includes(turnos) ? turnos : "1" } : m
          )
        }))
        get()._recalcular()
      },

      getMachineAtual: () => {
        const { maquinas, atualId } = get()
        return maquinas.find(m => m.id === atualId) || null
      },

      getMaquinasOrdenadas: () => {
        return [...get().maquinas].sort(compararMaquinasPorNome)
      },

      addJob: (job) => {
        registrarHistorico(set, get)
        set(state => {
          const maq = state.maquinas.find(m => m.id === job.maquinaId)
          if (!maq) return state
          return {
            maquinas: state.maquinas.map(m =>
              m.id === job.maquinaId
                ? { ...m, trabalhos: [...m.trabalhos, job] }
                : m
            )
          }
        })
        get()._recalcular()
      },

      salvarEdicaoRoteiro: (jobId, roteiroAtualizado) => {
        const state = get()
        const maquinasAntes = state.maquinas
        const jobAlvo = maquinasAntes.flatMap(m => m.trabalhos).find(t => t.id === jobId)
        if (!jobAlvo) return { ok: false, erro: "O serviço que estava sendo editado não foi encontrado." }

        const roteiroIdAnterior = jobAlvo.roteiroId
        const novoRoteiroId = roteiroAtualizado.id
        if (novoRoteiroId !== roteiroIdAnterior && maquinasAntes.some(m =>
          m.trabalhos.some(t => t.roteiroId === novoRoteiroId)
        )) {
          return { ok: false, erro: `Já existe um serviço com a OP "${roteiroAtualizado.op}". Não é permitido duplicar uma Ordem de Produção.` }
        }
        const trabalhosAnteriores = maquinasAntes.flatMap(m => m.trabalhos)
          .filter(t => t.roteiroId === roteiroIdAnterior)
        const antigosPorEtapa = new Map<number, Job>()
        for (const trabalho of trabalhosAnteriores) {
          const etapa = trabalho.roteiroEtapa || 0
          const atual = antigosPorEtapa.get(etapa)
          if (!atual || trabalho.id === jobId) antigosPorEtapa.set(etapa, trabalho)
        }

        for (const trabalho of trabalhosAnteriores) {
          if (!ehEmOperacao(trabalho)) continue
          const etapaNova = roteiroAtualizado.etapas[(trabalho.roteiroEtapa || 1) - 1]
          if (!etapaNova || etapaNova.machineId !== trabalho.maquinaId) {
            return { ok: false, erro: mensagemBloqueioEdicao(trabalho) }
          }
        }

        const trabalhosAtualizados: Job[] = []

        roteiroAtualizado.etapas.forEach((etapa, indice) => {
          const numeroEtapa = indice + 1
          const maquina = maquinasAntes.find(m => m.id === etapa.machineId)
          if (!maquina || etapa.machineId === ID_ALMOX) return
          const anterior = antigosPorEtapa.get(numeroEtapa)
          const manter = anterior?.maquinaId === etapa.machineId
          const status = roteiroAtualizado.opStatus === "PLANEJADA"
            ? "PLANEJADA"
            : (etapa.status || (numeroEtapa === 1 ? "FILA MÁQUINA" : "MAT. EM OUTRA MÁQUINA"))
          const dadosComuns = {
            desc: roteiroAtualizado.desc,
            pv: roteiroAtualizado.pv,
            op: roteiroAtualizado.op,
            np: roteiroAtualizado.np,
            sequencia: roteiroAtualizado.sequencia + indice * 5,
            roteiroId: novoRoteiroId,
            roteiroEtapa: numeroEtapa,
            qtd: roteiroAtualizado.qtd,
            setup: etapa.setup || 0,
            usinagem: etapa.usinagem || 0,
            diasProcesso: etapa.diasProcesso || 0,
            status,
            opStatus: roteiroAtualizado.opStatus,
            observacao: roteiroAtualizado.observacao,
            fornecedorExterno: etapa.fornecedorExterno ?? roteiroAtualizado.fornecedorExterno,
            tipoServicoExterno: etapa.tipoServicoExterno ?? roteiroAtualizado.tipoServicoExterno,
            maquinaId: etapa.machineId
          }
          const trabalho: Job = manter
            ? { ...anterior, ...dadosComuns }
            : {
                id: gerarId(),
                ...dadosComuns,
                entradaMinimaRoteiro: "",
                entradaManual: false,
                entradaManualValor: "",
                entrada: "",
                saida: "",
                saidaManual: false
              }
          if (manter && anterior.id === jobId && roteiroAtualizado.entradaManual && roteiroAtualizado.entradaManualValor) {
            trabalho.entrada = roteiroAtualizado.entradaManualValor
            trabalho.entradaManual = true
            trabalho.entradaManualValor = roteiroAtualizado.entradaManualValor
          }
          trabalhosAtualizados.push(trabalho)
        })

        const maquinas = reconstruirFilasAposEdicao(maquinasAntes, roteiroIdAnterior, trabalhosAtualizados)

        for (const trabalho of trabalhosAnteriores) {
          if (!ehEmOperacao(trabalho)) continue
          const maquinaAntes = maquinasAntes.find(m => m.id === trabalho.maquinaId)
          const maquinaDepois = maquinas.find(m => m.trabalhos.some(t => t.id === trabalho.id))
          const posicaoAntes = maquinaAntes?.trabalhos.findIndex(t => t.id === trabalho.id) ?? -1
          const posicaoDepois = maquinaDepois?.trabalhos.findIndex(t => t.id === trabalho.id) ?? -1
          if (maquinaDepois?.id !== maquinaAntes?.id || posicaoDepois !== posicaoAntes) {
            return { ok: false, erro: mensagemBloqueioEdicao(trabalho) }
          }
        }

        const resultado = recalcularSequenciamento(maquinas, state.fator)
        const roteiroFinal = { ...structuredClone(roteiroAtualizado), updatedAt: new Date().toISOString() }
        const roteiros = [
          ...state.roteiros.filter(r => r.id !== roteiroIdAnterior && r.id !== novoRoteiroId),
          roteiroFinal
        ]
        const snapshot = criarSnapshot(state)
        ultimoRegistroHistoricoEm = Date.now()
        ultimaChaveHistorico = JSON.stringify(snapshot)
        set({
          maquinas,
          roteiros,
          trabalhosComCiclo: resultado.trabalhosComCiclo,
          trabalhosBloqueadosSequenciamento: resultado.trabalhosBloqueadosSequenciamento,
          trabalhosAguardandoRoteiro: resultado.trabalhosAguardandoRoteiro,
          resumoCicloSequenciamento: resultado.resumoCicloSequenciamento,
          historicoUndo: [...state.historicoUndo, snapshot].slice(-LIMITE_HISTORICO),
          historicoRedo: [],
          _recalcularAgendado: false
        })
        return { ok: true }
      },

      updateJob: (machineId, jobId, updates) => {
        registrarHistorico(set, get)
        set(state => ({
          maquinas: state.maquinas.map(m =>
            m.id === machineId
              ? {
                  ...m,
                  trabalhos: m.trabalhos.map(t =>
                    t.id === jobId ? { ...t, ...updates } : t
                  )
                }
              : m
          )
        }))
        if (temCampoScheduling(updates)) get()._recalcular()
      },

      removeJob: (machineId, jobId) => {
        registrarHistorico(set, get)
        set(state => ({
          maquinas: state.maquinas.map(m =>
            m.id === machineId
              ? { ...m, trabalhos: m.trabalhos.filter(t => t.id !== jobId) }
              : m
          )
        }))
        get()._recalcular()
      },

      moveJob: (machineId, jobId, direction) => {
        registrarHistorico(set, get)
        set(state => {
          const maq = state.maquinas.find(m => m.id === machineId)
          if (!maq) return state
          const lista = trabalhosAtivos(maq)
          const pos = lista.findIndex(j => j.id === jobId)
          const novaPos = pos + direction
          if (pos < 0 || novaPos < 0 || novaPos >= lista.length) return state

          const atualIndex = maq.trabalhos.findIndex(j => j.id === jobId)
          const alvoIndex = maq.trabalhos.findIndex(j => j.id === lista[novaPos].id)
          if (atualIndex < 0 || alvoIndex < 0) return state

          const novosTrabalhos = [...maq.trabalhos]
          const [item] = novosTrabalhos.splice(atualIndex, 1)
          const novoAlvoIndex = novosTrabalhos.findIndex(j => j.id === lista[novaPos].id)
          const posicaoInserir = direction > 0 ? novoAlvoIndex + 1 : novoAlvoIndex
          novosTrabalhos.splice(posicaoInserir, 0, item)

          return {
            maquinas: state.maquinas.map(m =>
              m.id === machineId ? { ...m, trabalhos: novosTrabalhos } : m
            )
          }
        })
        get()._recalcular()
      },

      moveJobToPosition: (machineId, jobId, targetJobId) => {
        const state = get()
        if (!machineId || !jobId || !targetJobId || jobId === targetJobId) return null
        const maq = state.maquinas.find(m => m.id === machineId)
        if (!maq) return null
        if (!maq.trabalhos.some(j => j.id === jobId) || !maq.trabalhos.some(j => j.id === targetJobId)) return null

        const bloco = obterBlocoRoteiro(state.maquinas, machineId, jobId)
        if (bloco.length === 0 || bloco.some(j => j.id === targetJobId)) return null

        const novosTrabalhos = reordenarBlocoFila(maq.trabalhos, bloco, targetJobId)
        if (novosTrabalhos === maq.trabalhos) return null
        const novaFila = novosTrabalhos.filter(j => !isJobFinalizado(j) && isJobLiberado(j))
        const bloqueio = validarOrdemSequencias(novaFila)
        if (bloqueio) return bloqueio

        registrarHistorico(set, get)
        const clone = structuredClone(state.maquinas)
        const cloneMaq = clone.find(m => m.id === machineId)
        if (!cloneMaq) return null
        cloneMaq.trabalhos = reordenarBlocoFila(cloneMaq.trabalhos, bloco, targetJobId)
        propagarPrioridadeRoteiro(clone, jobId, state.fator)
        set({ maquinas: clone })
        get()._recalcular()
        return null
      },

      updateJobStatus: (machineId, jobId, status) => {
        registrarHistorico(set, get)
        const novoStatus = normalizarStatusTrabalho(status)
        set(state => ({
          maquinas: state.maquinas.map(m =>
            m.id === machineId
              ? {
                  ...m,
                  trabalhos: m.trabalhos.map(t => {
                    if (t.id !== jobId) return t
                    const updated = { ...t, status: novoStatus }
                    if (novoStatus === "EM OPERAÇÃO" && t.status !== "EM OPERAÇÃO") {
                      const agora = toDatetimeLocal(new Date())
                      updated.entrada = agora
                      updated.entradaManual = true
                      updated.entradaManualValor = agora
                      if (!updated.entradaRealizada) updated.entradaRealizada = agora
                    }
                    if (novoStatus === "FINALIZADO" && t.status !== "FINALIZADO") {
                      const agora = toDatetimeLocal(new Date())
                      updated.finalizadoEm = agora
                      if (!updated.entradaRealizada) updated.entradaRealizada = updated.entrada || agora
                    }
                    return updated
                  })
                }
              : m
          )
        }))
        if (novoStatus === "FILA MÁQUINA" || novoStatus === "FINALIZADO") {
          get().finalizarEtapasAnteriores(jobId)
        }
        get()._recalcular()
        set(state => ({ roteiros: extrairRoteirosDasMaquinas(state.maquinas) }))
      },

      updateOpStatus: (machineId, jobId, novoOpStatus) => {
        registrarHistorico(set, get)
        set(state => {
          let jobAlvo: Job | null = null
          for (const m of state.maquinas) {
            const t = m.trabalhos.find(j => j.id === jobId)
            if (t) { jobAlvo = t; break }
          }
          if (!jobAlvo) return state
          const chave = jobAlvo.roteiroId || jobAlvo.op
          if (!chave) return state

          return {
            maquinas: state.maquinas.map(m => ({
              ...m,
              trabalhos: m.trabalhos.map(t => {
                if (chave !== (t.roteiroId || t.op)) return t
                const updated: Partial<Job> & { status?: string } = { ...t, opStatus: novoOpStatus }
                if (novoOpStatus === "LIBERADA") {
                  const idx = (t.roteiroEtapa || 1) - 1
                  updated.status = idx === 0 ? "FILA MÁQUINA" : "MAT. EM OUTRA MÁQUINA"
                } else if (novoOpStatus === "PLANEJADA") {
                  updated.status = "PLANEJADA"
                }
                return { ...t, ...updated } as Job
              })
            }))
          }
        })
        get()._recalcular()
        set(state => ({ roteiros: extrairRoteirosDasMaquinas(state.maquinas) }))
      },

      finalizarEtapasAnteriores: (jobId) => {
        set(state => {
          let jobAlvo: Job | null = null
          let maqAlvo: Machine | null = null
          for (const maq of state.maquinas) {
            const t = maq.trabalhos.find(j => j.id === jobId)
            if (t) { jobAlvo = t; maqAlvo = maq; break }
          }
          if (!jobAlvo || !maqAlvo) return state

          const chave = jobAlvo.roteiroId || jobAlvo.op
          if (!chave) return state
          const seqAlvo = jobAlvo.sequencia
          const pvAlvo = jobAlvo.pv
          const idsAfetadas = new Set<string>()

          const novasMaquinas = state.maquinas.map(maq => {
            const novosTrabalhos = maq.trabalhos.map(t => {
              if (t.id === jobId) return t
              if (maq.id === maqAlvo!.id) return t
              const mesmoGrupo = jobAlvo!.roteiroId
                ? t.roteiroId === chave
                : t.op === chave && t.pv === pvAlvo
              if (!mesmoGrupo) return t
              if (t.sequencia >= seqAlvo) return t
              if (isJobFinalizado(t)) return t
              idsAfetadas.add(maq.id)
              const agora = toDatetimeLocal(new Date())
              return {
                ...t,
                status: "FINALIZADO",
                finalizadoEm: agora,
                entradaRealizada: t.entradaRealizada || t.entrada || agora
              }
            })
            return { ...maq, trabalhos: novosTrabalhos }
          })

          return { maquinas: novasMaquinas }
        })
      },

      aplicarPriorizacaoPV: () => {
        registrarHistorico(set, get)
        set(state => {
          const pvs = state.prioridadesPV
          if (pvs.length === 0) return state

          const novasMaquinas = state.maquinas.map(maq => {
            const operacao: Job[] = []
            const fila: Job[] = []
            const outros: Job[] = []

            maq.trabalhos.forEach(j => {
              const s = String(j.status || "").toUpperCase()
              if (s === "EM OPERAÇÃO") {
                operacao.push(j)
              } else if (s === "FILA MÁQUINA") {
                fila.push(j)
              } else {
                outros.push(j)
              }
            })

            const filaOrdenada = ordenarFilaPorPV(state.maquinas, maq, fila, pvs)

            return { ...maq, trabalhos: [...operacao, ...filaOrdenada, ...outros] }
          })

          return { maquinas: novasMaquinas }
        })
        get()._recalcular()
      },

      addPvPrioridade: (pv) => {
        registrarHistorico(set, get)
        set(state => {
          if (state.prioridadesPV.includes(pv)) return state
          return { prioridadesPV: [...state.prioridadesPV, pv] }
        })
      },

      removePvPrioridade: (pv) => {
        registrarHistorico(set, get)
        set(state => ({
          prioridadesPV: state.prioridadesPV.filter(p => p !== pv)
        }))
      },

      movePvNaLista: (pv, targetPv) => {
        registrarHistorico(set, get)
        set(state => {
          const lista = [...state.prioridadesPV]
          const from = lista.indexOf(pv)
          const to = lista.indexOf(targetPv)
          if (from < 0 || to < 0) return state
          lista.splice(from, 1)
          const newTo = lista.indexOf(targetPv)
          lista.splice(newTo >= 0 ? newTo : to, 0, pv)
          return { prioridadesPV: lista }
        })
      },

      setFator: (fator) => {
        registrarHistorico(set, get)
        set({ fator })
        get()._recalcular()
      },

      toggleOcultos: () => {
        set(state => ({ mostrarOcultos: !state.mostrarOcultos }))
      },

      setUsuario: (usuario) => {
        set({ usuario })
      },

      clearUsuario: () => {
        set({ usuario: null })
      },

      togglePainelResumo: () => {
        set(state => ({ painelResumoVisivel: !state.painelResumoVisivel }))
      },

      setMostrarOcultos: (v) => {
        set({ mostrarOcultos: v })
      },

      togglePlanejadasGeral: () => {
        set(state => ({ mostrandoPlanejadasGeral: !state.mostrandoPlanejadasGeral, mostrandoMapeamento: false }))
      },

      setMostrandoPlanejadasGeral: (v) => {
        set({ mostrandoPlanejadasGeral: v, mostrandoMapeamento: v ? false : undefined })
      },

      toggleMapeamento: () => {
        set(state => ({ mostrandoMapeamento: !state.mostrandoMapeamento, mostrandoPlanejadasGeral: false }))
      },

      setMostrandoMapeamento: (v) => {
        set({ mostrandoMapeamento: v, mostrandoPlanejadasGeral: v ? false : undefined })
      },

      setMapeamentoFiltroPV: (pv) => {
        set({ mapeamentoFiltroPV: pv })
      },

      setPlanejadasFiltroPV: (pv) => {
        set({ planejadasFiltroPV: pv })
      },

      addServicoExterno: (servico) => {
        registrarHistorico(set, get)
        set(state => ({
          servicosExternosConfig: [...state.servicosExternosConfig, servico]
        }))
      },

      removeServicoExterno: (id) => {
        registrarHistorico(set, get)
        set(state => ({
          servicosExternosConfig: state.servicosExternosConfig.filter(s => s.id !== id)
        }))
      },

      undo: () => {
        set(state => {
          const anterior = state.historicoUndo[state.historicoUndo.length - 1]
          if (!anterior) return state
          const atual = criarSnapshot(state)
          const restaurado = restaurarSnapshot(anterior)
          ultimoRegistroHistoricoEm = 0
          ultimaChaveHistorico = ""
          return {
            ...restaurado,
            historicoUndo: state.historicoUndo.slice(0, -1),
            historicoRedo: [atual, ...state.historicoRedo].slice(0, LIMITE_HISTORICO)
          }
        })
      },

      redo: () => {
        set(state => {
          const proximo = state.historicoRedo[0]
          if (!proximo) return state
          const atual = criarSnapshot(state)
          const restaurado = restaurarSnapshot(proximo)
          ultimoRegistroHistoricoEm = 0
          ultimaChaveHistorico = ""
          return {
            ...restaurado,
            historicoUndo: [...state.historicoUndo, atual].slice(-LIMITE_HISTORICO),
            historicoRedo: state.historicoRedo.slice(1)
          }
        })
      },

      toggleDesconsiderarCarga: (roteiroId) => {
        if (!roteiroId) return
        set(state => {
          const jobsAlvo: { maqId: string; jobId: string; atual: boolean }[] = []
          for (const m of state.maquinas) {
            for (const t of m.trabalhos) {
              if (t.roteiroId === roteiroId) {
                jobsAlvo.push({ maqId: m.id, jobId: t.id, atual: !!t.desconsiderarCarga })
              }
            }
          }
          if (jobsAlvo.length === 0) return state
          const novoValor = !jobsAlvo[0].atual
          return {
            maquinas: state.maquinas.map(m => ({
              ...m,
              trabalhos: m.trabalhos.map(t =>
                t.roteiroId === roteiroId ? { ...t, desconsiderarCarga: novoValor } : t
              )
            }))
          }
        })
        get()._recalcular()
      },

      simularPlanejada: (roteiroId, dataEntrada, prioridade) => {
        const state = get()
        const clone: Machine[] = JSON.parse(JSON.stringify(state.maquinas))
        const etapas: { maquina: Machine; job: Job }[] = []

        clone.forEach(m => {
          m.trabalhos = m.trabalhos.filter(j => {
            if (j.roteiroId === roteiroId && isJobPlanejado(j)) {
              const etapaIdx = (j.roteiroEtapa || 1) - 1
              j.status = etapaIdx === 0 ? "FILA MÁQUINA" : "MAT. EM OUTRA MÁQUINA"
              j.opStatus = "LIBERADA"
              etapas.push({ maquina: m, job: j })
              return true
            }
            return !isJobPlanejado(j)
          })
          if (prioridade) {
            etapas.filter(e => e.maquina.id === m.id).forEach(e => {
              m.trabalhos = moverParaPrioridadeMaxima(m.trabalhos, e.job.id)
            })
          }
        })

        if (etapas.length === 0) return []

        etapas.sort((a, b) => (a.job.roteiroEtapa || 0) - (b.job.roteiroEtapa || 0))

        const entradaNorm = normalizarDataEntrada(dataEntrada)
        if (!entradaNorm) return []

        etapas[0].job.entrada = entradaNorm
        etapas[0].job.entradaManualValor = entradaNorm
        etapas[0].job.entradaManual = true

        etapas.forEach((e, i) => {
          if (i === 0) return
          e.job.entrada = ""
          e.job.saida = ""
          e.job.entradaMinimaRoteiro = ""
        })

        const resultado = recalcularSequenciamento(clone, state.fator)
        const simulacaoBloqueada = etapas.some(({ job }) =>
          resultado.trabalhosComCiclo.has(job.id)
          || resultado.trabalhosBloqueadosSequenciamento.has(job.id)
          || !job.entrada
          || !job.saida
        )
        if (simulacaoBloqueada) return []

        return etapas.map(({ maquina, job }) => ({
          maquinaNome: maquina.nome,
          maquinaId: maquina.id,
          entrada: job.entrada,
          saida: job.saida,
          setup: job.setup,
          usinagem: job.usinagem,
          qtd: job.qtd,
          totalLote: totalLote(job, maquina)
        }))
      },

      _recalcular: () => {
        if (get()._recalcularAgendado) return
        set({ _recalcularAgendado: true })
        queueMicrotask(() => {
          set(state => {
            if (!state._recalcularAgendado) return state
            const clone: Machine[] = structuredClone(state.maquinas)
            const result = recalcularSequenciamento(clone, state.fator)
            return {
              maquinas: clone,
              trabalhosComCiclo: result.trabalhosComCiclo,
              trabalhosBloqueadosSequenciamento: result.trabalhosBloqueadosSequenciamento,
              trabalhosAguardandoRoteiro: result.trabalhosAguardandoRoteiro,
              resumoCicloSequenciamento: result.resumoCicloSequenciamento,
              _recalcularAgendado: false
            }
          })
        })
      },

      _marcarModificada: () => {
        // Used by Supabase sync
      },

      _setMaquinas: (maquinas, preserveRoteiros) => {
        const roteiros = preserveRoteiros ? get().roteiros : extrairRoteirosDasMaquinas(maquinas)
        const maquinasNorm = normalizarJobsRoteiroId(maquinas, roteiros)
        ultimoRegistroHistoricoEm = 0
        ultimaChaveHistorico = ""
        set({ maquinas: maquinasNorm, roteiros, historicoUndo: [], historicoRedo: [] })
      },

      _setConfig: (config) => {
        const filtered = Object.fromEntries(Object.entries(config).filter(entry => entry[1] !== undefined))
        if (Object.keys(filtered).length > 0) {
          ultimoRegistroHistoricoEm = 0
          ultimaChaveHistorico = ""
          set({ ...filtered, historicoUndo: [], historicoRedo: [] })
        }
      }
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        maquinas: state.maquinas,
        roteiros: state.roteiros,
        atualId: state.atualId,
        fator: state.fator,
        painelResumoVisivel: state.painelResumoVisivel,
        mostrarOcultos: state.mostrarOcultos,
        mostrarPlanejadas: state.mostrarPlanejadas,
        prioridadesPV: state.prioridadesPV,
        servicosExternosConfig: state.servicosExternosConfig,
        mostrandoMapeamento: state.mostrandoMapeamento,
        mapeamentoFiltroPV: state.mapeamentoFiltroPV,
        planejadasFiltroPV: state.planejadasFiltroPV
      }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<AppState>) }
        if (merged.maquinas) {
          merged.maquinas = merged.maquinas.map(m => ({
            ...m,
            trabalhos: m.trabalhos.map(t => ({
              ...t,
              opStatus: t.opStatus || (normalizarStatusTrabalho(t.status) === "PLANEJADA" ? "PLANEJADA" : "LIBERADA")
            }))
          })) as Machine[]
        }
        const roteirosValidos = new Set(merged.roteiros.map(r => r.id))
        const temRoteirosOrfaos = merged.maquinas.some(m =>
          m.trabalhos.some(t => t.roteiroId && !roteirosValidos.has(t.roteiroId))
        )
        if (!merged.roteiros || merged.roteiros.length === 0 || temRoteirosOrfaos) {
          merged.roteiros = extrairRoteirosDasMaquinas(merged.maquinas)
          merged.maquinas = normalizarJobsRoteiroId(merged.maquinas, merged.roteiros)
        }
        return merged
      },
      skipHydration: true
    }
  )
)
