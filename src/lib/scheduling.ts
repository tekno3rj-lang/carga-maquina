import type { Job, Machine, SchedulingNode, ProcessoPadrao, ResultadoSequenciamento, Roteiro, RoteiroEtapa } from "@/store/types"
import { PROCESSOS_PADRAO, ID_ALMOX } from "@/lib/constants"
import { parseDataOperacional, toDatetimeLocal, dataEhValidaOperacional } from "@/lib/formats"

export function isAlmox(id: string) { return id === ID_ALMOX }

export function isServicoExterno(nome: string): boolean {
  return /servi[çc]o\s*externo/i.test(nome || "")
}

export function isJobFinalizado(job: Job) {
  return String(job?.status || "").toUpperCase() === "FINALIZADO"
}

export function isJobPlanejado(job: Job) {
  const op = String(job?.opStatus || "").toUpperCase()
  if (op === "PLANEJADA") return true
  if (op === "LIBERADA") return false
  return String(job?.status || "").toUpperCase() === "PLANEJADA"
}

export function isJobLiberado(job: Job) {
  const op = String(job?.opStatus || "").toUpperCase()
  if (op === "LIBERADA") return true
  if (op === "PLANEJADA") return false
  return String(job?.status || "").toUpperCase() !== "PLANEJADA"
}

export function obterPrecedenciaRoteiro(job: Pick<Job, "roteiroEtapa" | "sequencia">): number {
  const etapa = Number(job.roteiroEtapa)
  if (Number.isFinite(etapa) && etapa > 0) return etapa
  const sequencia = Number(job.sequencia)
  return Number.isFinite(sequencia) ? sequencia : 0
}

export function compararPrecedenciaRoteiro(
  a: Pick<Job, "roteiroEtapa" | "sequencia">,
  b: Pick<Job, "roteiroEtapa" | "sequencia">
): number {
  return obterPrecedenciaRoteiro(a) - obterPrecedenciaRoteiro(b)
}

export function trabalhosAtivos(machine: Machine) {
  return (machine?.trabalhos || []).filter(j => !isJobFinalizado(j) && isJobLiberado(j))
}

export function trabalhosOcultos(machine: Machine) {
  return (machine?.trabalhos || []).filter(isJobFinalizado)
}

export function trabalhosPlanejados(machine: Machine) {
  return (machine?.trabalhos || []).filter(isJobPlanejado)
}

export function ultimoTrabalhoAtivo(machine: Machine) {
  const ativos = trabalhosAtivos(machine)
  return ativos[ativos.length - 1] || null
}

export function moverParaPrioridadeMaxima(
  trabalhos: Job[],
  targetJobId: string
): Job[] {
  const arr = [...trabalhos]
  const targetIdx = arr.findIndex(j => j.id === targetJobId)
  if (targetIdx < 0) return arr
  const [target] = arr.splice(targetIdx, 1)
  const isOperacao = (s: string) => /^EM\s+OPERAC/.test(String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase())
  let ultimoOp = -1
  for (let i = 0; i < arr.length; i++) {
    if (isOperacao(arr[i].status)) {
      ultimoOp = i
    }
  }
  arr.splice(ultimoOp + 1, 0, target)
  return arr
}

export function detectarProcessoPadrao(nomeMaquina: string): ProcessoPadrao | null {
  if (!nomeMaquina) return null
  for (const pp of PROCESSOS_PADRAO) {
    if (pp.padrao.test(nomeMaquina)) return pp
  }
  return null
}

export function maquinaUsaFilaPrioridade(nomeMaquina: string): boolean {
  return !detectarProcessoPadrao(nomeMaquina)
    && !/servi[çc]o/i.test(nomeMaquina || "")
    && !/externo/i.test(nomeMaquina || "")
}

export function obterDiasProcessoEfetivo(job: Job, maquina?: Machine | null): number {
  const processoPadrao = maquina ? detectarProcessoPadrao(maquina.nome) : null
  if (processoPadrao) return processoPadrao.dias
  return Number(job.diasProcesso || 0)
}

function normalizarDiasProcessoPadrao(node: SchedulingNode) {
  const diasProcesso = obterDiasProcessoEfetivo(node.trabalho, node.maquina)
  if (node.trabalho.diasProcesso !== diasProcesso) {
    node.trabalho.diasProcesso = diasProcesso
  }
}

export function obterConfigTurnos(turnos: string) {
  if (turnos === "2") {
    return { start: 6, end: 22, breaks: [{ start: 12, end: 13 }, { start: 20, end: 21 }] }
  }
  if (turnos === "3") {
    return { start: 6, end: 30, breaks: [{ start: 12, end: 13 }, { start: 20, end: 21 }, { start: 28, end: 29 }] }
  }
  return { start: 6, end: 14, breaks: [{ start: 12, end: 13 }] }
}

export function adicionarDiasProcesso(dataInicial: Date, dias: number): Date {
  if (!dataEhValidaOperacional(dataInicial) || !Number.isFinite(dias) || dias < 0) return new Date(NaN)
  if (dias <= 0) return new Date(dataInicial)
  const atual = new Date(dataInicial)
  let restante = dias
  while (restante > 0) {
    if (!dataEhValidaOperacional(atual)) return new Date(NaN)
    atual.setDate(atual.getDate() + 1)
    if (atual.getDay() >= 1 && atual.getDay() <= 5) restante -= 1
  }
  return new Date(atual)
}

export function adicionarMinutosUteis(dataInicial: Date, minutosNecessarios: number, turnos: string): Date {
  if (!dataEhValidaOperacional(dataInicial)) return new Date(NaN)
  if (!Number.isFinite(minutosNecessarios) || minutosNecessarios < 0) return new Date(NaN)
  if (minutosNecessarios <= 0) return new Date(dataInicial)

  const cfg = obterConfigTurnos(turnos)
  const cicloStart = cfg.start * 60
  const cicloEnd = cfg.end * 60
  const breaks = cfg.breaks.map(b => ({ start: b.start * 60, end: b.end * 60 }))

  let restante = minutosNecessarios
  let atual = new Date(dataInicial)

  while (restante > 0) {
    if (!dataEhValidaOperacional(atual)) return new Date(NaN)

    const diaSemana = atual.getDay()
    if (diaSemana === 0 || diaSemana === 6) {
      atual.setDate(atual.getDate() + (diaSemana === 6 ? 2 : 1))
      atual.setHours(cfg.start, 0, 0, 0)
      continue
    }

    let minutosNoDia = atual.getHours() * 60 + atual.getMinutes()

    if (cicloEnd > 24 * 60 && minutosNoDia < cicloStart) {
      minutosNoDia += 24 * 60
    }

    if (minutosNoDia < cicloStart) {
      atual.setHours(cfg.start, 0, 0, 0)
      continue
    }

    if (minutosNoDia >= cicloEnd) {
      atual.setDate(atual.getDate() + 1)
      while (atual.getDay() === 0 || atual.getDay() === 6) {
        atual.setDate(atual.getDate() + 1)
      }
      atual.setHours(cfg.start, 0, 0, 0)
      continue
    }

    let nextBoundary = cicloEnd
    let inBreak = false

    for (const b of breaks) {
      if (minutosNoDia < b.start && b.start < nextBoundary) {
        nextBoundary = b.start
        inBreak = false
      } else if (minutosNoDia >= b.start && minutosNoDia < b.end) {
        nextBoundary = b.end
        inBreak = true
        break
      }
    }

    if (inBreak) {
      const diff = nextBoundary - minutosNoDia
      if (diff > 0) {
        atual = new Date(atual.getTime() + diff * 60000)
      } else {
        atual.setMinutes(atual.getMinutes() + 1)
      }
    } else {
      const disponivel = nextBoundary - minutosNoDia
      const consumir = Math.min(restante, disponivel)
      atual = new Date(atual.getTime() + consumir * 60000)
      restante -= consumir
    }
  }

  return dataEhValidaOperacional(atual) ? atual : new Date(NaN)
}

export function calcularSaida(
  entrada: string,
  setup: number,
  usinagem: number,
  qtd: number,
  turnos: string,
  fator: number
): string {
  if (!entrada) return ""
  const inicio = parseDataOperacional(entrada)
  if (!inicio) return ""

  const minutosSetup = Number(setup || 0)
  const minutosUsinagem = Number(usinagem || 0)
  const quantidade = Number(qtd || 0)

  const totalFatorado = minutosSetup * (fator || 4.2) + minutosUsinagem * quantidade
  if (!Number.isFinite(totalFatorado) || totalFatorado < 0) return ""

  if (!turnos || turnos === "0") {
    const fim = new Date(inicio.getTime() + totalFatorado * 60000)
    return toDatetimeLocal(fim)
  }

  const fim = adicionarMinutosUteis(inicio, totalFatorado, turnos)
  return toDatetimeLocal(fim)
}

export function maiorDataLocal(...valores: string[]): string {
  const validas = valores
    .filter(Boolean)
    .map(valor => ({ valor, data: parseDataOperacional(valor) }))
    .filter(item => item.data)

  if (validas.length === 0) return ""
  const maior = validas.reduce((max, item) =>
    item.data!.getTime() > max.data!.getTime() ? item : max, validas[0])
  return toDatetimeLocal(maior.data!)
}

export function totalLote(job: Job, maquina?: Machine | null): number {
  return Number(job.setup || 0) + Number(job.usinagem || 0) * Number(job.qtd || 0)
    + obterDiasProcessoEfetivo(job, maquina) * 8 * 60
}

export function totalLoteFatorado(job: Job, fator: number, maquina?: Machine | null): number {
  return Number(job.setup || 0) * (fator || 4.2) + Number(job.usinagem || 0) * Number(job.qtd || 0)
    + obterDiasProcessoEfetivo(job, maquina) * 8 * 60
}

export function formatDiasUteis(minutos: number, turnos: string): string {
  if (!minutos || minutos <= 0) return ""
  const cfg = obterConfigTurnos(turnos || "1")
  const minutosBreak = cfg.breaks.reduce((acc, b) => acc + (b.end - b.start) * 60, 0)
  const minutosPorDia = (cfg.end - cfg.start) * 60 - minutosBreak
  const dias = Math.ceil(minutos / minutosPorDia * 10) / 10
  return `~${dias.toFixed(1).replace(".", ",")}d úteis`
}

export function obterPrioridadePV(pv: string, prioridadesPV: string[]): number {
  if (!pv) return Infinity
  const idx = prioridadesPV.indexOf(pv)
  return idx >= 0 ? idx : Infinity
}

export function normalizarStatusTrabalho(status: string): string {
  const valor = String(status || "FILA MÁQUINA").trim().toUpperCase()
  if (valor === "EM MANUTENÇÃO") return "FILA MÁQUINA"
  if (valor === "MATERIAL EM OUTRA MÁQUINA") return "MAT. EM OUTRA MÁQUINA"
  if (valor === "AGUARDANDO MATERIAL") return "AGUARDANDO MATÉRIA PRIMA"
  if (valor === "AGUARDANDO PROGRAMAÇÃO") return "FILA - PCP"
  if (valor === "INSPEÇÃO") return "EM INSPEÇÃO"
  return valor
}

export function normalizarSequenciaOperacional(valor: number | string, fallback = 5): number {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return fallback
  const arredondado = Math.round(n / 5) * 5
  return Math.max(5, arredondado)
}

export function classeStatusTrabalho(status: string): string {
  const s = String(status || "").toUpperCase()
  if (s === "EM OPERAÇÃO") return "op"
  if (s === "FILA MÁQUINA") return "fila"
  if (s === "FILA - PCP") return "fila-pcp"
  if (s === "FINALIZADO") return "finalizado"
  if (s === "MAT. EM OUTRA MÁQUINA") return "outra"
  if (s === "FERRAMENTARIA") return "ferramentaria"
  if (s === "SOLDAGEM") return "soldagem"
  if (s === "SERVIÇO EXTERNO") return "servico-externo"
  if (s === "EM INSPEÇÃO") return "inspecao"
  if (s === "AGUARDANDO MATÉRIA PRIMA") return "aguardando-material"
  if (s === "QUALIDADE") return "qualidade"
  if (s === "PLANEJADA") return "planejada"
  return "default"
}

export function classeStatusMaquina(status: string): string {
  const s = String(status || "").toUpperCase()
  if (s.includes("S/OPERADOR")) return "machine-sem-operador"
  if (s.includes("DESATIVADO")) return "machine-desativado"
  if (s.includes("MANUTENÇÃO")) return "machine-manutencao"
  if (s.includes("OPERAÇÃO")) return "machine-op"
  return "default"
}

function adicionarDependenciaSequenciamento(origem: SchedulingNode, destino: SchedulingNode) {
  if (!origem || !destino || origem.id === destino.id) return
  if (destino.deps.has(origem.id)) return
  destino.deps.add(origem.id)
  origem.proximos.add(destino.id)
  destino.grauEntrada += 1
}

function adicionarDependenciaFila(origem: SchedulingNode, destino: SchedulingNode) {
  adicionarDependenciaSequenciamento(origem, destino)
  destino.temDependenciaFila = true
}

function todosTrabalhos(maquinas: Machine[]): { maquina: Machine; trabalho: Job }[] {
  return maquinas.flatMap(maquina =>
    (maquina.trabalhos || []).map(trabalho => ({ maquina, trabalho }))
  )
}

function trabalhosSequenciaveis(machine: Machine): Job[] {
  return trabalhosAtivos(machine)
}

function limparPrevisoesPlanejadas(maquinas: Machine[]) {
  todosTrabalhos(maquinas).forEach(({ trabalho }) => {
    if (!isJobPlanejado(trabalho)) return
    trabalho.entrada = trabalho.entradaManual
      ? normalizarDataEntrada(trabalho.entradaManualValor)
      : ""
    trabalho.saida = trabalho.saidaManual
      ? normalizarDataEntrada(trabalho.saida)
      : ""
    trabalho.entradaMinimaRoteiro = ""
  })
}

export function criarGrafoSequenciamento(maquinas: Machine[], fator: number) {
  const nodes = new Map<string, SchedulingNode>()
  const ordered: SchedulingNode[] = []
  const gruposRoteiro = new Map<string, { node: SchedulingNode | null; trabalho: Job; ordem: number }[]>()
  void fator

  maquinas.forEach(maquina => {
    trabalhosSequenciaveis(maquina).forEach(trabalho => {
      if (isAlmox(trabalho.maquinaId)) return
      const node: SchedulingNode = {
        id: trabalho.id,
        trabalho,
        maquina,
        deps: new Set(),
        proximos: new Set(),
        grauEntrada: 0,
        grauRestante: 0,
        temDependenciaFila: false,
        ordem: ordered.length
      }
      nodes.set(node.id, node)
      ordered.push(node)
    })
  })

  todosTrabalhos(maquinas).forEach(({ trabalho }) => {
    const roteiroId = trabalho.roteiroId || ""
    if (!roteiroId) return
    const node = nodes.get(trabalho.id) || null
    if (!node && !isJobFinalizado(trabalho)) return
    if (!gruposRoteiro.has(roteiroId)) gruposRoteiro.set(roteiroId, [])
    gruposRoteiro.get(roteiroId)!.push({ node, trabalho, ordem: node?.ordem ?? Number.MAX_SAFE_INTEGER })
  })

  gruposRoteiro.forEach(lista => {
    lista.sort((a, b) => {
      const diff = compararPrecedenciaRoteiro(a.trabalho, b.trabalho)
      return diff || a.ordem - b.ordem
    })

    lista.forEach((entry, index) => {
      if (!entry.node) return
      entry.trabalho.entradaMinimaRoteiro = ""
      if (index === 0) return
      const anterior = lista[index - 1]
      if (anterior.node) {
        adicionarDependenciaSequenciamento(anterior.node, entry.node)
      } else {
        entry.trabalho.entradaMinimaRoteiro = normalizarDataEntrada(anterior.trabalho.saida || "")
      }
    })
  })

  maquinas.forEach(maquina => {
    if (!maquinaUsaFilaPrioridade(maquina.nome)) return
    const fila = trabalhosSequenciaveis(maquina)
      .map(trabalho => nodes.get(trabalho.id))
      .filter((node): node is SchedulingNode => Boolean(node))

    fila.forEach((node, index) => {
      if (index === 0) return
      adicionarDependenciaFila(fila[index - 1], node)
    })
  })

  ordered.forEach(node => {
    node.grauRestante = node.grauEntrada
  })

  return { nodes, ordered, gruposRoteiro }
}

function normalizarDataEntrada(valor: string): string {
  const data = parseDataOperacional(valor)
  return data ? toDatetimeLocal(data) : ""
}

function statusEhEmOperacao(status: string): boolean {
  return String(status || "").toUpperCase().startsWith("EM OPERA")
}

function processoPadraoIgnoraFila(node: SchedulingNode): boolean {
  return Boolean(detectarProcessoPadrao(node.maquina.nome))
}

function obterRestricoesEntradaDespacho(
  node: SchedulingNode,
  nodes: Map<string, SchedulingNode>,
  disponibilidadeMaquina: string,
  agora: string
) {
  const trabalho = node.trabalho
  const restricoesEntrada: string[] = []
  const ignoraFila = processoPadraoIgnoraFila(node)

  if (trabalho.entradaManual) {
    restricoesEntrada.push(trabalho.entradaManualValor)
  }

  if (!ignoraFila && disponibilidadeMaquina) {
    restricoesEntrada.push(disponibilidadeMaquina)
  }

  if (!ignoraFila && !disponibilidadeMaquina && !trabalho.entradaManual) {
    if (statusEhEmOperacao(trabalho.status)) {
      restricoesEntrada.push(trabalho.entrada)
    } else {
    const status = String(trabalho.status || "").toUpperCase()
    if (status === "EM OPERAÃ‡ÃƒO") {
      restricoesEntrada.push(trabalho.entrada)
    } else {
      restricoesEntrada.push(agora)
    }
    }
  }

  if (trabalho.entradaMinimaRoteiro) {
    restricoesEntrada.push(trabalho.entradaMinimaRoteiro)
  }

  node.deps.forEach(depId => {
    const origem = nodes.get(depId)
    if (origem?.trabalho?.saida) {
      restricoesEntrada.push(origem.trabalho.saida)
    }
  })

  if (restricoesEntrada.length === 0 && !trabalho.entradaManual) {
    restricoesEntrada.push(agora)
  }

  return restricoesEntrada
}

function calcularNoSequenciamentoDespacho(
  node: SchedulingNode,
  nodes: Map<string, SchedulingNode>,
  fator: number,
  disponibilidadeMaquina: string,
  agora: string
) {
  const trabalho = node.trabalho
  normalizarDiasProcessoPadrao(node)
  trabalho.entrada = maiorDataLocal(...obterRestricoesEntradaDespacho(node, nodes, disponibilidadeMaquina, agora))

  if (trabalho.saidaManual && trabalho.saida) {
    trabalho.saida = normalizarDataEntrada(trabalho.saida)
  } else if (trabalho.diasProcesso > 0) {
    const entradaDate = parseDataOperacional(trabalho.entrada)
    trabalho.saida = entradaDate ? toDatetimeLocal(adicionarDiasProcesso(entradaDate, trabalho.diasProcesso)) : ""
  } else {
    trabalho.saida = calcularSaida(
      trabalho.entrada,
      trabalho.setup,
      trabalho.usinagem,
      trabalho.qtd,
      node.maquina.turnos || "1",
      fator
    )
  }
}

function atualizarEntradasMinimasRoteiro(
  maquinas: Machine[],
  gruposRoteiro?: Map<string, { node: SchedulingNode | null; trabalho: Job; ordem: number }[]>
) {
  if (gruposRoteiro) {
    gruposRoteiro.forEach(lista => {
      lista.forEach((entry, index) => {
        if (!entry.node) return
        entry.trabalho.entradaMinimaRoteiro = index === 0
          ? ""
          : normalizarDataEntrada(lista[index - 1].trabalho.saida || "")
      })
    })
    return
  }

  const grupos = new Map<string, Job[]>()
  todosTrabalhos(maquinas).forEach(({ trabalho }) => {
    if (!trabalho.roteiroId) return
    if (!grupos.has(trabalho.roteiroId)) grupos.set(trabalho.roteiroId, [])
    grupos.get(trabalho.roteiroId)!.push(trabalho)
  })

  grupos.forEach(trabalhos => {
    trabalhos
      .sort(compararPrecedenciaRoteiro)
      .forEach((trabalho, index, lista) => {
        trabalho.entradaMinimaRoteiro = index === 0 ? "" : (lista[index - 1].saida || "")
      })
  })
}

function inserirPronto(prontos: SchedulingNode[], node: SchedulingNode) {
  const index = prontos.findIndex(item => item.ordem > node.ordem)
  if (index < 0) {
    prontos.push(node)
  } else {
    prontos.splice(index, 0, node)
  }
}

function encontrarTrabalhosEmCiclo(
  nodes: Map<string, SchedulingNode>,
  pendentes: Set<string>
): Set<string> {
  let proximoIndice = 0
  const indices = new Map<string, number>()
  const menoresIndices = new Map<string, number>()
  const pilha: string[] = []
  const naPilha = new Set<string>()
  const trabalhosComCiclo = new Set<string>()

  const visitar = (id: string) => {
    indices.set(id, proximoIndice)
    menoresIndices.set(id, proximoIndice)
    proximoIndice += 1
    pilha.push(id)
    naPilha.add(id)

    const node = nodes.get(id)
    node?.proximos.forEach(proximoId => {
      if (!pendentes.has(proximoId)) return
      if (!indices.has(proximoId)) {
        visitar(proximoId)
        menoresIndices.set(id, Math.min(menoresIndices.get(id)!, menoresIndices.get(proximoId)!))
      } else if (naPilha.has(proximoId)) {
        menoresIndices.set(id, Math.min(menoresIndices.get(id)!, indices.get(proximoId)!))
      }
    })

    if (menoresIndices.get(id) !== indices.get(id)) return

    const componente: string[] = []
    let atual = ""
    do {
      atual = pilha.pop() || ""
      if (!atual) break
      naPilha.delete(atual)
      componente.push(atual)
    } while (atual !== id)

    if (componente.length > 1) {
      componente.forEach(trabalhoId => trabalhosComCiclo.add(trabalhoId))
    }
  }

  pendentes.forEach(id => {
    if (!indices.has(id)) visitar(id)
  })

  return trabalhosComCiclo
}

export function recalcularSequenciamento(maquinas: Machine[], fator: number, agoraReferencia: Date = new Date()): ResultadoSequenciamento {
  limparPrevisoesPlanejadas(maquinas)
  const { nodes, ordered, gruposRoteiro } = criarGrafoSequenciamento(maquinas, fator)
  const processados = new Set<string>()
  const disponibilidadePorMaquina = new Map<string, string>()
  const agora = toDatetimeLocal(agoraReferencia)
  const prontos = ordered
    .filter(node => node.grauRestante === 0)
    .sort((a, b) => a.ordem - b.ordem)

  while (prontos.length > 0) {
    const node = prontos.shift()!
    const disponibilidadeMaquina = disponibilidadePorMaquina.get(node.maquina.id) || ""
    calcularNoSequenciamentoDespacho(node, nodes, fator, disponibilidadeMaquina, agora)
    processados.add(node.id)

    if (!processoPadraoIgnoraFila(node)) {
      disponibilidadePorMaquina.set(node.maquina.id, node.trabalho.saida || node.trabalho.entrada)
    }

    node.proximos.forEach(proximoId => {
      const proximo = nodes.get(proximoId)
      if (!proximo || processados.has(proximoId)) return
      proximo.grauRestante = Math.max(0, proximo.grauRestante - 1)
      if (proximo.grauRestante === 0) inserirPronto(prontos, proximo)
    })
  }

  atualizarEntradasMinimasRoteiro(maquinas, gruposRoteiro)

  const pendentes = new Set(ordered.filter(node => !processados.has(node.id)).map(node => node.id))
  const trabalhosComCiclo = encontrarTrabalhosEmCiclo(nodes, pendentes)
  const trabalhosAguardandoRoteiro = new Set(
    [...pendentes].filter(id => {
      const node = nodes.get(id)
      return Boolean(node && !trabalhosComCiclo.has(id) && processoPadraoIgnoraFila(node))
    })
  )
  const trabalhosBloqueadosSequenciamento = new Set(
    [...pendentes].filter(id => !trabalhosComCiclo.has(id) && !trabalhosAguardandoRoteiro.has(id))
  )

  pendentes.forEach(id => {
    const trabalho = nodes.get(id)?.trabalho
    if (!trabalho) return
    trabalho.entrada = ""
    trabalho.saida = ""
    trabalho.entradaMinimaRoteiro = ""
  })

  const resumoPartes: string[] = []
  if (trabalhosComCiclo.size > 0) {
    resumoPartes.push(`${trabalhosComCiclo.size} em ciclo`)
  }
  if (trabalhosBloqueadosSequenciamento.size > 0) {
    resumoPartes.push(`${trabalhosBloqueadosSequenciamento.size} bloqueado${trabalhosBloqueadosSequenciamento.size === 1 ? "" : "s"}`)
  }
  if (trabalhosAguardandoRoteiro.size > 0) {
    resumoPartes.push(`${trabalhosAguardandoRoteiro.size} aguardando roteiro`)
  }
  const resumoCicloSequenciamento = resumoPartes.length > 0
    ? `⚠️ Sequenciamento: ${resumoPartes.join(" · ")}`
    : ""

  return {
    trabalhosComCiclo,
    trabalhosBloqueadosSequenciamento,
    trabalhosAguardandoRoteiro,
    resumoCicloSequenciamento
  }
}

export function extrairRoteirosDasMaquinas(maquinas: Machine[]): Roteiro[] {
  const grupos = new Map<string, { jobs: { job: Job; maquinaId: string }[] }>()
  const maquinasPorId = new Map(maquinas.map(maquina => [maquina.id, maquina]))
  for (const m of maquinas) {
    for (const t of m.trabalhos) {
      const id = t.roteiroId || t.op?.trim()
      if (!id) continue
      if (!grupos.has(id)) grupos.set(id, { jobs: [] })
      grupos.get(id)!.jobs.push({ job: t, maquinaId: m.id })
    }
  }

  const roteiros: Roteiro[] = []
  for (const [id, grupo] of grupos) {
    const sorted = [...grupo.jobs].sort((a, b) => (a.job.roteiroEtapa || 0) - (b.job.roteiroEtapa || 0))
    const first = sorted[0]?.job
    if (!first) continue

    const etapas: RoteiroEtapa[] = sorted.map(({ job, maquinaId }) => ({
      machineId: maquinaId,
      setup: job.setup || 0,
      usinagem: job.usinagem || 0,
      diasProcesso: obterDiasProcessoEfetivo(job, maquinasPorId.get(maquinaId)),
      fornecedorExterno: job.fornecedorExterno || "",
      tipoServicoExterno: job.tipoServicoExterno || "",
      status: job.status || "FILA MÁQUINA"
    }))

    roteiros.push({
      id,
      desc: first.desc || "",
      np: first.np || "",
      op: first.op || "",
      pv: first.pv || "",
      qtd: first.qtd || 0,
      sequencia: first.sequencia || 5,
      opStatus: first.opStatus || "LIBERADA",
      observacao: first.observacao || "",
      fornecedorExterno: first.fornecedorExterno || "",
      tipoServicoExterno: first.tipoServicoExterno || "",
      entradaMinimaRoteiro: first.entradaMinimaRoteiro || "",
      entradaManual: !!first.entradaManual,
      entradaManualValor: first.entradaManualValor || "",
      etapas
    })
  }

  return roteiros
}

export function normalizarJobsRoteiroId(maquinas: Machine[], roteiros: Roteiro[]): Machine[] {
  const roteiroPorChave = new Map<string, string>()
  for (const r of roteiros) {
    roteiroPorChave.set(r.id, r.id)
    if (r.op) roteiroPorChave.set(r.op, r.id)
  }

  return maquinas.map(m => ({
    ...m,
    trabalhos: m.trabalhos.map(t => {
      const chave = t.op?.trim() || t.roteiroId
      const novoId = chave ? roteiroPorChave.get(chave) : undefined
      if (novoId && t.roteiroId !== novoId) {
        return { ...t, roteiroId: novoId }
      }
      return t
    })
  }))
}

export function validarRoteiroUnico(roteiros: Roteiro[], roteiroId: string, etapa: number, machineId: string): boolean {
  const roteiro = roteiros.find(r => r.id === roteiroId)
  if (!roteiro) return true
  const etapaIndex = etapa - 1
  if (etapaIndex < 0 || etapaIndex >= roteiro.etapas.length) return true
  const existing = roteiro.etapas[etapaIndex]
  if (!existing) return true
  return existing.machineId === machineId
}

export function getRoteiro(roteiros: Roteiro[], id: string): Roteiro | undefined {
  return roteiros.find(r => r.id === id)
}

export function getRoteiroPorOP(roteiros: Roteiro[], op: string): Roteiro[] {
  if (!op) return []
  const opLower = op.toLowerCase()
  return roteiros.filter(r => r.op.toLowerCase() === opLower)
}

export function getAllJobsPorRoteiro(maquinas: Machine[], roteiroId: string): Job[] {
  const jobs: Job[] = []
  for (const m of maquinas) {
    for (const t of m.trabalhos) {
      if (t.roteiroId === roteiroId) {
        jobs.push(t)
      }
    }
  }
  return jobs
}

export function limparCamposRoteiroJob(job: Job): Job {
  const { ...rest } = job
  return rest as Job
}
