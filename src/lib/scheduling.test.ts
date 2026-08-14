import { afterEach, describe, expect, it } from "vitest"
import { recalcularSequenciamento } from "@/lib/scheduling"
import { useAppStore } from "@/store/useAppStore"
import type { Job, Machine, Roteiro } from "@/store/types"

type DadosJob = Pick<Job, "id" | "maquinaId"> & Partial<Job>

function criarJob({ id, maquinaId, ...dados }: DadosJob): Job {
  return {
    id,
    maquinaId,
    desc: id,
    pv: "",
    op: dados.roteiroId || id,
    np: id,
    sequencia: 5,
    roteiroId: "",
    roteiroEtapa: 0,
    entradaMinimaRoteiro: "",
    entradaManual: false,
    entradaManualValor: "",
    qtd: 1,
    setup: 10,
    usinagem: 5,
    diasProcesso: 0,
    entrada: "",
    saida: "",
    saidaManual: false,
    status: "FILA MÁQUINA",
    opStatus: "LIBERADA",
    observacao: "",
    fornecedorExterno: "",
    tipoServicoExterno: "",
    ...dados
  }
}

function criarMaquina(id: string, trabalhos: Job[]): Machine {
  return {
    id,
    nome: `Máquina ${id}`,
    statusMaquina: "EM OPERAÇÃO",
    turnos: "1",
    trabalhos
  }
}

function criarRoteiro(id: string, etapas: string[], dados: Partial<Roteiro> = {}): Roteiro {
  return {
    id,
    desc: id,
    np: id,
    op: id,
    pv: "",
    qtd: 1,
    sequencia: 5,
    opStatus: "LIBERADA",
    observacao: "",
    fornecedorExterno: "",
    tipoServicoExterno: "",
    entradaMinimaRoteiro: "",
    entradaManual: false,
    entradaManualValor: "",
    etapas: etapas.map((machineId, indice) => ({
      machineId,
      setup: 10,
      usinagem: 5,
      diasProcesso: 0,
      fornecedorExterno: "",
      tipoServicoExterno: "",
      status: indice === 0 ? "FILA MÁQUINA" : "MAT. EM OUTRA MÁQUINA"
    })),
    ...dados
  }
}

function criarRoteirosCruzados(opStatus: "LIBERADA" | "PLANEJADA") {
  const status = opStatus === "PLANEJADA" ? "PLANEJADA" : "FILA MÁQUINA"
  const comum = { opStatus, status, entrada: "2098-01-05T08:00", saida: "2098-01-05T10:00", entradaMinimaRoteiro: "2098-01-04T08:00" }
  const a1 = criarJob({ id: "a1", maquinaId: "m1", roteiroId: "a", roteiroEtapa: 1, sequencia: 5, ...comum })
  const a2 = criarJob({ id: "a2", maquinaId: "m2", roteiroId: "a", roteiroEtapa: 2, sequencia: 10, ...comum })
  const b1 = criarJob({ id: "b1", maquinaId: "m2", roteiroId: "b", roteiroEtapa: 1, sequencia: 5, ...comum })
  const b2 = criarJob({ id: "b2", maquinaId: "m1", roteiroId: "b", roteiroEtapa: 2, sequencia: 10, ...comum })
  return {
    trabalhos: { a1, a2, b1, b2 },
    maquinas: [criarMaquina("m1", [b2, a1]), criarMaquina("m2", [a2, b1])]
  }
}

afterEach(() => {
  useAppStore.setState({
    maquinas: [],
    roteiros: [],
    trabalhosComCiclo: new Set(),
    trabalhosBloqueadosSequenciamento: new Set(),
    trabalhosAguardandoRoteiro: new Set(),
    resumoCicloSequenciamento: "",
    historicoUndo: [],
    historicoRedo: []
  })
})

describe("recalcularSequenciamento", () => {
  it("ignora ciclos e bloqueios formados somente por OPs planejadas", () => {
    const { maquinas, trabalhos } = criarRoteirosCruzados("PLANEJADA")

    const resultado = recalcularSequenciamento(maquinas, 1)

    expect(resultado.trabalhosComCiclo.size).toBe(0)
    expect(resultado.trabalhosBloqueadosSequenciamento.size).toBe(0)
    expect(resultado.resumoCicloSequenciamento).toBe("")
    Object.values(trabalhos).forEach(trabalho => {
      expect(trabalho.entrada).toBe("")
      expect(trabalho.saida).toBe("")
      expect(trabalho.entradaMinimaRoteiro).toBe("")
    })
  })

  it("mantém a detecção de ciclo e bloqueio na carga liberada", () => {
    const { maquinas, trabalhos } = criarRoteirosCruzados("LIBERADA")
    const bloqueado = criarJob({ id: "c1", maquinaId: "m1" })
    maquinas[0].trabalhos.push(bloqueado)

    const resultado = recalcularSequenciamento(maquinas, 1)

    expect(resultado.trabalhosComCiclo.size).toBe(4)
    Object.values(trabalhos).forEach(trabalho => {
      expect(resultado.trabalhosComCiclo.has(trabalho.id)).toBe(true)
    })
    expect(resultado.trabalhosBloqueadosSequenciamento).toEqual(new Set(["c1"]))
    expect(resultado.resumoCicloSequenciamento).toContain("4 em ciclo")
    expect(resultado.resumoCicloSequenciamento).toContain("1 bloqueado")
  })

  it("não altera as datas liberadas quando planejadas são adicionadas", () => {
    const r1 = criarJob({
      id: "r1",
      maquinaId: "m1",
      roteiroId: "r",
      roteiroEtapa: 1,
      entradaManual: true,
      entradaManualValor: "2099-01-05T08:00"
    })
    const r2 = criarJob({ id: "r2", maquinaId: "m2", roteiroId: "r", roteiroEtapa: 2, sequencia: 10 })
    const base = [criarMaquina("m1", [r1]), criarMaquina("m2", [r2])]
    const semPlanejadas = structuredClone(base)
    const comPlanejadas = structuredClone(base)
    const cruzadas = criarRoteirosCruzados("PLANEJADA")
    comPlanejadas[0].trabalhos.unshift(...cruzadas.maquinas[0].trabalhos)
    comPlanejadas[1].trabalhos.unshift(...cruzadas.maquinas[1].trabalhos)

    recalcularSequenciamento(semPlanejadas, 1)
    recalcularSequenciamento(comPlanejadas, 1)

    for (const id of ["r1", "r2"]) {
      const sem = semPlanejadas.flatMap(m => m.trabalhos).find(j => j.id === id)
      const com = comPlanejadas.flatMap(m => m.trabalhos).find(j => j.id === id)
      expect(com?.entrada).toBe(sem?.entrada)
      expect(com?.saida).toBe(sem?.saida)
    }
  })

  it("preserva datas manuais e remove previsões automáticas das planejadas", () => {
    const automatico = criarJob({
      id: "automatico",
      maquinaId: "m1",
      opStatus: "PLANEJADA",
      status: "PLANEJADA",
      entrada: "2098-01-05T08:00",
      saida: "2098-01-05T10:00",
      entradaMinimaRoteiro: "2098-01-04T08:00"
    })
    const manual = criarJob({
      id: "manual",
      maquinaId: "m1",
      opStatus: "PLANEJADA",
      status: "PLANEJADA",
      entrada: "2098-01-05T08:00",
      entradaManual: true,
      entradaManualValor: "2099-02-02T09:00",
      saida: "2099-02-03T09:00",
      saidaManual: true,
      entradaMinimaRoteiro: "2098-01-04T08:00"
    })

    recalcularSequenciamento([criarMaquina("m1", [automatico, manual])], 1)

    expect(automatico.entrada).toBe("")
    expect(automatico.saida).toBe("")
    expect(automatico.entradaMinimaRoteiro).toBe("")
    expect(manual.entrada).toBe("2099-02-02T09:00")
    expect(manual.saida).toBe("2099-02-03T09:00")
    expect(manual.entradaMinimaRoteiro).toBe("")
  })

  it("usa a saída finalizada como restrição da próxima etapa liberada", () => {
    const finalizado = criarJob({
      id: "f1",
      maquinaId: "m1",
      roteiroId: "f",
      roteiroEtapa: 1,
      status: "FINALIZADO",
      entrada: "2099-03-02T08:00",
      saida: "2099-03-02T10:00"
    })
    const proximo = criarJob({ id: "f2", maquinaId: "m2", roteiroId: "f", roteiroEtapa: 2, sequencia: 10 })

    recalcularSequenciamento([criarMaquina("m1", [finalizado]), criarMaquina("m2", [proximo])], 1)

    expect(proximo.entradaMinimaRoteiro).toBe("2099-03-02T10:00")
    expect(proximo.entrada).toBe("2099-03-02T10:00")
    expect(proximo.saida).not.toBe("")
  })
})

describe("salvarEdicaoRoteiro", () => {
  it("corrige a precedência nos mesmos espaços e preserva outros trabalhos", () => {
    const etapa30 = criarJob({ id: "op-30", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 2, sequencia: 30 })
    const etapa25 = criarJob({ id: "op-25", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 1, sequencia: 25 })
    const outra1 = criarJob({ id: "outra-1", maquinaId: "m1" })
    const outra2 = criarJob({ id: "outra-2", maquinaId: "m1" })
    useAppStore.setState({
      maquinas: [criarMaquina("m1", [etapa30, outra1, etapa25, outra2])],
      roteiros: [criarRoteiro("op", ["m1", "m1"], { sequencia: 25 })],
      historicoUndo: []
    })

    const resultado = useAppStore.getState().salvarEdicaoRoteiro("op-25", criarRoteiro("op", ["m1", "m1"], { sequencia: 25 }))
    const ids = useAppStore.getState().maquinas[0].trabalhos.map(t => t.id)

    expect(resultado).toEqual({ ok: true })
    expect(ids).toEqual(["op-25", "outra-1", "op-30", "outra-2"])
    expect(ids.filter(id => id.startsWith("outra"))).toEqual(["outra-1", "outra-2"])
    expect(useAppStore.getState().historicoUndo).toHaveLength(1)
  })

  it("ordena três passagens e mantém finalizadas fora da reorganização", () => {
    const etapa3 = criarJob({ id: "e3", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 3, sequencia: 15 })
    const finalizada = criarJob({ id: "e2", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 2, sequencia: 10, status: "FINALIZADO" })
    const outra = criarJob({ id: "outra", maquinaId: "m1" })
    const etapa1 = criarJob({ id: "e1", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 1, sequencia: 5 })
    const roteiro = criarRoteiro("op", ["m1", "m1", "m1"])
    roteiro.etapas[1].status = "FINALIZADO"
    useAppStore.setState({
      maquinas: [criarMaquina("m1", [etapa3, finalizada, outra, etapa1])],
      roteiros: [roteiro]
    })

    expect(useAppStore.getState().salvarEdicaoRoteiro("e1", roteiro)).toEqual({ ok: true })
    expect(useAppStore.getState().maquinas[0].trabalhos.map(t => t.id)).toEqual(["e1", "e2", "outra", "e3"])
  })

  it("aplica a precedência também às etapas planejadas", () => {
    const etapa2 = criarJob({ id: "p2", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 2, sequencia: 10, opStatus: "PLANEJADA", status: "PLANEJADA" })
    const outra = criarJob({ id: "outra", maquinaId: "m1" })
    const etapa1 = criarJob({ id: "p1", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 1, sequencia: 5, opStatus: "PLANEJADA", status: "PLANEJADA" })
    const roteiro = criarRoteiro("op", ["m1", "m1"], { opStatus: "PLANEJADA" })
    roteiro.etapas.forEach(etapa => { etapa.status = "PLANEJADA" })
    useAppStore.setState({
      maquinas: [criarMaquina("m1", [etapa2, outra, etapa1])],
      roteiros: [roteiro]
    })

    expect(useAppStore.getState().salvarEdicaoRoteiro("p1", roteiro)).toEqual({ ok: true })
    expect(useAppStore.getState().maquinas[0].trabalhos.map(t => t.id)).toEqual(["p1", "outra", "p2"])
  })

  it("preserva o ID na mesma máquina e cria outro ao transferir a etapa", () => {
    const etapa1 = criarJob({ id: "e1", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 1, sequencia: 5, entradaRealizada: "2099-01-01T08:00" })
    const etapa2 = criarJob({ id: "e2", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 2, sequencia: 10 })
    useAppStore.setState({
      maquinas: [criarMaquina("m1", [etapa1, etapa2]), criarMaquina("m2", [])],
      roteiros: [criarRoteiro("op", ["m1", "m1"])]
    })

    expect(useAppStore.getState().salvarEdicaoRoteiro("e1", criarRoteiro("op", ["m1", "m2"]))).toEqual({ ok: true })
    const mantida = useAppStore.getState().maquinas[0].trabalhos.find(t => t.roteiroId === "op")
    const transferida = useAppStore.getState().maquinas[1].trabalhos.find(t => t.roteiroId === "op")

    expect(mantida?.id).toBe("e1")
    expect(mantida?.entradaRealizada).toBe("2099-01-01T08:00")
    expect(transferida?.id).not.toBe("e2")
  })

  it("bloqueia atomicamente o deslocamento de etapa em operação", () => {
    const etapa2 = criarJob({ id: "e2", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 2, sequencia: 10 })
    const outra = criarJob({ id: "outra", maquinaId: "m1" })
    const operacao = criarJob({ id: "e1", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 1, sequencia: 5, status: "EM OPERAÇÃO" })
    const roteiro = criarRoteiro("op", ["m1", "m1"])
    roteiro.etapas[0].status = "EM OPERAÇÃO"
    useAppStore.setState({
      maquinas: [criarMaquina("m1", [etapa2, outra, operacao])],
      roteiros: [roteiro],
      historicoUndo: []
    })
    const antes = structuredClone(useAppStore.getState().maquinas)

    const resultado = useAppStore.getState().salvarEdicaoRoteiro("e1", roteiro)

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.erro).toContain("OP")
      expect(resultado.erro).toContain("seq. op. 5")
    }
    expect(useAppStore.getState().maquinas).toEqual(antes)
    expect(useAppStore.getState().historicoUndo).toHaveLength(0)
  })

  it("mantém o bloqueio manual do drag-and-drop e permite desfazer a edição", () => {
    const etapa1 = criarJob({ id: "e1", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 1, sequencia: 5 })
    const outra = criarJob({ id: "outra", maquinaId: "m1" })
    const etapa2 = criarJob({ id: "e2", maquinaId: "m1", roteiroId: "op", roteiroEtapa: 2, sequencia: 10 })
    const roteiro = criarRoteiro("op", ["m1", "m1"])
    useAppStore.setState({
      maquinas: [criarMaquina("m1", [etapa1, outra, etapa2])],
      roteiros: [roteiro],
      historicoUndo: []
    })

    expect(useAppStore.getState().moveJobToPosition("m1", "e2", "e1")).toContain("Bloqueado")
    const editado = criarRoteiro("op", ["m1", "m1"], { desc: "Descrição alterada" })
    expect(useAppStore.getState().salvarEdicaoRoteiro("e1", editado)).toEqual({ ok: true })
    expect(useAppStore.getState().maquinas[0].trabalhos[0].desc).toBe("Descrição alterada")
    useAppStore.getState().undo()
    expect(useAppStore.getState().maquinas[0].trabalhos[0].desc).toBe("e1")
  })
})

describe("simularPlanejada", () => {
  it("simula somente a OP selecionada e não altera o estado original", () => {
    const alvo1 = criarJob({ id: "p1", maquinaId: "m1", roteiroId: "alvo", roteiroEtapa: 1, opStatus: "PLANEJADA", status: "PLANEJADA" })
    const alvo2 = criarJob({ id: "p2", maquinaId: "m2", roteiroId: "alvo", roteiroEtapa: 2, sequencia: 10, opStatus: "PLANEJADA", status: "PLANEJADA" })
    const outra = criarJob({ id: "outra", maquinaId: "m1", roteiroId: "outra", roteiroEtapa: 1, opStatus: "PLANEJADA", status: "PLANEJADA" })
    useAppStore.setState({
      maquinas: [criarMaquina("m1", [outra, alvo1]), criarMaquina("m2", [alvo2])],
      fator: 1
    })

    const resultado = useAppStore.getState().simularPlanejada("alvo", "2099-04-06T08:00")

    expect(resultado).toHaveLength(2)
    expect(resultado.every(etapa => etapa.entrada && etapa.saida)).toBe(true)
    expect(useAppStore.getState().maquinas.flatMap(m => m.trabalhos).find(j => j.id === "p1")?.status).toBe("PLANEJADA")
    expect(useAppStore.getState().maquinas.flatMap(m => m.trabalhos).find(j => j.id === "outra")?.status).toBe("PLANEJADA")
    expect(useAppStore.getState().simularPlanejada("alvo", "data inválida")).toEqual([])
  })
})

describe("processos padrão", () => {
  it("executa trabalhos independentes em paralelo", () => {
    const primeiro = criarJob({
      id: "insp-1",
      maquinaId: "insp",
      entradaManual: true,
      entradaManualValor: "2099-07-06T08:00"
    })
    const segundo = criarJob({
      id: "insp-2",
      maquinaId: "insp",
      entradaManual: true,
      entradaManualValor: "2099-07-06T08:00"
    })
    const maquina = criarMaquina("insp", [primeiro, segundo])
    maquina.nome = "INSP. (QUALIDADE)"

    const resultado = recalcularSequenciamento([maquina], 1, new Date(2098, 0, 5, 8, 0))

    expect(primeiro.entrada).toBe("2099-07-06T08:00")
    expect(segundo.entrada).toBe("2099-07-06T08:00")
    expect(primeiro.saida).toBe(segundo.saida)
    expect(resultado.trabalhosAguardandoRoteiro.size).toBe(0)
  })

  it("classifica descendentes de conflitos como aguardando roteiro", () => {
    const { maquinas } = criarRoteirosCruzados("LIBERADA")
    const descendente = criarJob({
      id: "a3-insp",
      maquinaId: "insp",
      roteiroId: "a",
      roteiroEtapa: 3,
      sequencia: 15
    })
    const processo = criarMaquina("insp", [descendente])
    processo.nome = "INSP. (QUALIDADE)"
    maquinas.push(processo)

    const resultado = recalcularSequenciamento(maquinas, 1, new Date(2098, 0, 5, 8, 0))

    expect(resultado.trabalhosAguardandoRoteiro).toEqual(new Set(["a3-insp"]))
    expect(resultado.trabalhosBloqueadosSequenciamento.has("a3-insp")).toBe(false)
    expect(resultado.trabalhosComCiclo.has("a3-insp")).toBe(false)
    expect(descendente.entrada).toBe("")
    expect(descendente.saida).toBe("")
  })
})
