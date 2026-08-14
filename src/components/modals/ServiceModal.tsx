"use client"

import { useState, useEffect, useRef } from "react"
import { useAppStore } from "@/store/useAppStore"
import { JOB_STATUSES, OP_STATUSES, ID_ALMOX } from "@/lib/constants"
import { detectarProcessoPadrao, calcularSaida, ultimoTrabalhoAtivo, adicionarDiasProcesso, isAlmox, isServicoExterno, validarRoteiroUnico, getRoteiro, classeStatusTrabalho, isJobPlanejado } from "@/lib/scheduling"
import { parseDataOperacional, toDatetimeLocal, normalizarDataEntrada, formatDateTime, escapeHTML, uid } from "@/lib/formats"
import type { RouteItem, Job, Roteiro, RoteiroEtapa } from "@/store/types"

export function ServiceModal() {
  const maquinas = useAppStore(s => s.maquinas)
  const atualId = useAppStore(s => s.atualId)
  const roteiros = useAppStore(s => s.roteiros)
  const addJob = useAppStore(s => s.addJob)
  const updateJob = useAppStore(s => s.updateJob)
  const removeJob = useAppStore(s => s.removeJob)
  const addRoteiro = useAppStore(s => s.addRoteiro)
  const updateRoteiro = useAppStore(s => s.updateRoteiro)
  const removeRoteiro = useAppStore(s => s.removeRoteiro)
  const salvarEdicaoRoteiro = useAppStore(s => s.salvarEdicaoRoteiro)
  const servicosExternosConfig = useAppStore(s => s.servicosExternosConfig)
  const maq = maquinas.find(m => m.id === atualId) || null

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [desc, setDesc] = useState("")
  const [np, setNp] = useState("")
  const [op, setOp] = useState("")
  const [pv, setPv] = useState("")
  const [qtd, setQtd] = useState("")
  const [opStatus, setOpStatus] = useState("LIBERADA")
  const [sequencia, setSequencia] = useState("5")
  const [observacao, setObservacao] = useState("")
  const [entrada, setEntrada] = useState("")
  const [roteiro, setRoteiro] = useState<RouteItem[]>([])
  const [entradaManual, setEntradaManual] = useState(false)
  const [fornecedorExterno, setFornecedorExterno] = useState("")
  const [tipoServicoExterno, setTipoServicoExterno] = useState("")
  const [erroSalvar, setErroSalvar] = useState("")
  const dragIdxRef = useRef<number | null>(null)

  function resetForm() {
    setErroSalvar("")
    setDesc("")
    setNp("")
    setOp("")
    setPv("")
    setQtd("")
    setOpStatus("LIBERADA")
    setSequencia("5")
    setObservacao("")
    const suggestedEntry = maq ? ultimoTrabalhoAtivo(maq)?.saida : undefined
    setEntrada(suggestedEntry ? normalizarDataEntrada(suggestedEntry) : "")
    setEntradaManual(false)
    setFornecedorExterno("")
    setTipoServicoExterno("")
    if (maq) {
      const pp = detectarProcessoPadrao(maq.nome)
      const statusInicial = "FILA MÁQUINA"
      if (isServicoExterno(maq.nome)) {
        setRoteiro([{ machineId: maq.id, setup: 0, usinagem: 0, diasProcesso: 0, status: statusInicial, tipoServicoExterno: "", fornecedorExterno: "" }])
      } else {
        setRoteiro([{ machineId: maq.id, setup: 0, usinagem: 0, status: statusInicial, ...(pp ? { diasProcesso: pp.dias } : {}) }])
      }
    } else {
      setRoteiro([])
    }
  }

  function recuperarRoteiroJob(job: Job): RouteItem[] {
    const store = useAppStore.getState()
    const roteiro = getRoteiro(store.roteiros, job.roteiroId)
    if (roteiro && roteiro.etapas.length > 0) {
      return roteiro.etapas.map(etapa => ({
        machineId: etapa.machineId,
        setup: etapa.setup,
        usinagem: etapa.usinagem,
        diasProcesso: etapa.diasProcesso || undefined,
        fornecedorExterno: etapa.fornecedorExterno || undefined,
        tipoServicoExterno: etapa.tipoServicoExterno || undefined,
        status: etapa.status
      }))
    }
    const jobs = store.maquinas.flatMap(m =>
      (m.trabalhos || []).filter(t => t.roteiroId === job.roteiroId)
    )
    if (jobs.length > 0) {
      return jobs
        .sort((a, b) => (a.roteiroEtapa || 0) - (b.roteiroEtapa || 0))
        .map(t => ({
          machineId: t.maquinaId,
          setup: t.setup || 0,
          usinagem: t.usinagem || 0,
          diasProcesso: t.diasProcesso || undefined,
          fornecedorExterno: t.fornecedorExterno || undefined,
          tipoServicoExterno: t.tipoServicoExterno || undefined,
          status: t.status || "FILA MÁQUINA"
        }))
    }
    if (job.maquinaId) return [{ machineId: job.maquinaId, setup: job.setup, usinagem: job.usinagem, status: job.status }]
    for (const m of store.maquinas) {
      if (m.trabalhos.some(t => t.id === job.id)) return [{ machineId: m.id, setup: job.setup, usinagem: job.usinagem, status: job.status }]
    }
    return []
  }

  const opDuplicada = !editId && op.trim()
    && (maquinas.some(m => m.trabalhos.some(t => t.op.trim() === op.trim()))
      || roteiros.some(r => r.op.trim() === op.trim()))

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === "jobModal") {
        setEditId(null)
        resetForm()
        setOpen(true)
      }
    }
    const editHandler = (e: Event) => {
      const jobId = (e as CustomEvent).detail
      if (!maq || !jobId) return
      const job = maq.trabalhos.find(t => t.id === jobId)
      if (!job) return
      setEditId(jobId)
      setErroSalvar("")
      setDesc(job.desc)
      setNp(job.np)
      setOp(job.op)
      setPv(job.pv)
      setQtd(String(job.qtd))
      setOpStatus(job.opStatus || (isJobPlanejado(job) ? "PLANEJADA" : "LIBERADA"))
      const roteiroDaVez = getRoteiro(useAppStore.getState().roteiros, job.roteiroId)
      setSequencia(String(Math.max(5, roteiroDaVez?.sequencia ?? (job.sequencia || 5))))
      setObservacao(job.observacao)
      setEntrada(normalizarDataEntrada(job.entradaManualValor || job.entrada))
      setEntradaManual(!!job.entradaManual)
      setFornecedorExterno(job.fornecedorExterno || "")
      setTipoServicoExterno(job.tipoServicoExterno || "")

      setRoteiro(recuperarRoteiroJob(job))
      setOpen(true)
    }
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("open-modal", handler)
    window.addEventListener("edit-job", editHandler)
    window.addEventListener("keydown", escHandler)
    return () => {
      window.removeEventListener("open-modal", handler)
      window.removeEventListener("edit-job", editHandler)
      window.removeEventListener("keydown", escHandler)
    }
  }, [maq, maquinas])

  function diasProcessoEtapa(item?: Partial<Pick<RouteItem, "machineId" | "diasProcesso">> | null): number {
    if (!item) return 0
    const maquinaEtapa = maquinas.find(m => m.id === item.machineId)
    const processoPadrao = maquinaEtapa ? detectarProcessoPadrao(maquinaEtapa.nome) : null
    if (processoPadrao) return processoPadrao.dias
    return Number(item.diasProcesso || 0)
  }

  function buscarRoteiroPorNP(npVal: string) {
    if (!npVal) return null
    const npLower = npVal.toLowerCase()
    const candidatos = useAppStore.getState().roteiros.filter(r => r.np.toLowerCase() === npLower && r.etapas.length > 0)
    if (candidatos.length === 0) return null
    const escolhido = candidatos.reduce((best, cur) => {
      const bestCount = candidatos.filter(c => c.id === best.id).length
      const curCount = candidatos.filter(c => c.id === cur.id).length
      if (curCount !== bestCount) return curCount > bestCount ? cur : best
      return (cur.updatedAt || "") > (best.updatedAt || "") ? cur : best
    })
    const etapas: RouteItem[] = escolhido.etapas.map(etapa => ({
      machineId: etapa.machineId,
      setup: etapa.setup,
      usinagem: etapa.usinagem,
      diasProcesso: etapa.diasProcesso || undefined,
      fornecedorExterno: etapa.fornecedorExterno || undefined,
      tipoServicoExterno: etapa.tipoServicoExterno || undefined,
      status: etapa.status
    }))
    return { roteiroId: escolhido.id, etapas, desc: escolhido.desc }
  }

  const adicionarEtapa = () => {
    const etapaStatus = opStatus === "PLANEJADA" ? "PLANEJADA" : (roteiro.length === 0 ? "FILA MÁQUINA" : "MAT. EM OUTRA MÁQUINA")
    if (roteiro.length === 0 && maq) {
      if (isServicoExterno(maq.nome)) {
        setRoteiro([{ machineId: maq.id, setup: 0, usinagem: 0, diasProcesso: 0, status: etapaStatus, tipoServicoExterno: "", fornecedorExterno: "" }])
      } else {
        setRoteiro([{ machineId: maq.id, setup: 0, usinagem: 0, status: etapaStatus }])
      }
      return
    }
    const defaultMaq = maquinas[0]
    if (defaultMaq && isServicoExterno(defaultMaq.nome)) {
      setRoteiro([...roteiro, { machineId: defaultMaq.id, setup: 0, usinagem: 0, diasProcesso: 0, status: etapaStatus, tipoServicoExterno: "", fornecedorExterno: "" }])
    } else {
      setRoteiro([...roteiro, { machineId: defaultMaq?.id || "", setup: 0, usinagem: 0, status: etapaStatus }])
    }
  }

  const removerEtapa = (idx: number) => {
    if (roteiro.length <= 1) return
    setRoteiro(roteiro.filter((_, i) => i !== idx))
  }

  const atualizarEtapa = (idx: number, campo: keyof RouteItem, valor: string | number) => {
    const novo = [...roteiro]
    novo[idx] = { ...novo[idx], [campo]: valor }
    setRoteiro(novo)
  }

  const alterarServicoExternoRoteiro = (idx: number, campo: 'tipoServico' | 'fornecedor', valor: string) => {
    const novo = [...roteiro]
    if (campo === 'tipoServico') {
      novo[idx] = { ...novo[idx], tipoServicoExterno: valor, fornecedorExterno: "" }
    } else {
      novo[idx] = { ...novo[idx], fornecedorExterno: valor }
    }
    const item = novo[idx]
    if (item.tipoServicoExterno && item.fornecedorExterno) {
      const cfg = servicosExternosConfig.find(
        s => s.servico === item.tipoServicoExterno && s.fornecedor === item.fornecedorExterno
      )
      if (cfg) {
        novo[idx] = { ...novo[idx], diasProcesso: cfg.dias }
      }
    }
    setRoteiro(novo)
  }

  const calcSaidaPreview = () => {
    const primeiro = roteiro[0]
    if (!primeiro) return ""
    const entradaVal = entrada
    if (primeiro.diasProcesso && entradaVal) {
      const d = parseDataOperacional(entradaVal)
      return d ? toDatetimeLocal(adicionarDiasProcesso(d, primeiro.diasProcesso)) : ""
    }
    const maqTurnos = maq?.turnos || "1"
    const fator = useAppStore.getState().fator
    return calcularSaida(entradaVal, primeiro.setup, primeiro.usinagem, Number(qtd || 0), maqTurnos, fator)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!maq) return

    if (!qtd || Number(qtd) <= 0) {
      alert("A quantidade deve ser informada e maior que zero.")
      return
    }

    if (roteiro.length === 0) {
      alert("Adicione pelo menos uma máquina ao roteiro.")
      return
    }

    const fator = useAppStore.getState().fator
    const roteiroIds = roteiro.map(r => r.machineId).filter(id => Boolean(id))
    if (roteiroIds.length === 0) {
      alert("Selecione pelo menos uma máquina para o roteiro.")
      return
    }

    if (!editId && op.trim()) {
      const opExiste = maquinas.some(m => m.trabalhos.some(t => t.op.trim() === op.trim()))
        || roteiros.some(r => r.op.trim() === op.trim())
      if (opExiste) {
        alert(`Já existe um serviço com a OP "${op.trim()}" cadastrado. Não é permitido duplicar uma Ordem de Produção.`)
        return
      }
    }

    if (editId) {
      const existing = maquinas.flatMap(m => m.trabalhos).find(t => t.id === editId)
      if (!existing) {
        setErroSalvar("O serviço que estava sendo editado não foi encontrado.")
        return
      }
      const novoOp = op.trim()
      const opMudou = Boolean(novoOp && existing.op?.trim() !== novoOp && existing.roteiroId !== novoOp)
      const roteiroAtualizado: Roteiro = {
        id: opMudou ? novoOp : existing.roteiroId,
        desc: desc.trim(),
        np: np.trim(),
        op: novoOp,
        pv: pv.trim(),
        qtd: Number(qtd || 0),
        sequencia: Number(sequencia || 5),
        opStatus,
        observacao: observacao.trim(),
        fornecedorExterno,
        tipoServicoExterno,
        entradaMinimaRoteiro: "",
        entradaManual: entradaManual && !!entrada,
        entradaManualValor: entradaManual ? entrada : "",
        etapas: roteiro.map(r => ({
          machineId: r.machineId,
          setup: r.setup || 0,
          usinagem: r.usinagem || 0,
          diasProcesso: diasProcessoEtapa(r),
          fornecedorExterno: r.fornecedorExterno ?? fornecedorExterno,
          tipoServicoExterno: r.tipoServicoExterno ?? tipoServicoExterno,
          status: r.status || "FILA MÁQUINA"
        }))
      }
      const resultado = salvarEdicaoRoteiro(editId, roteiroAtualizado)
      if (!resultado.ok) {
        setErroSalvar(resultado.erro)
        return
      }
      setErroSalvar("")
      setOpen(false)
      return
    }

    if (editId) {
      const existing = maq.trabalhos.find(t => t.id === editId)
      if (!existing) return

      const roteiroId = existing.roteiroId
      const newMachineIds = roteiro.map(r => r.machineId)
      const existingRoteiro = getRoteiro(useAppStore.getState().roteiros, roteiroId)
      const oldMachineIds = existingRoteiro ? existingRoteiro.etapas.map(e => e.machineId) : [existing.maquinaId]
      const etapasMudaram = JSON.stringify(oldMachineIds) !== JSON.stringify(newMachineIds) || oldMachineIds.length !== newMachineIds.length

      const novoOp = op.trim()
      const opMudou = novoOp && existing.op?.trim() !== novoOp && existing.roteiroId !== novoOp
      const novoRoteiroId = opMudou ? novoOp : roteiroId

      const stepIdx = Math.max(0, (existing.roteiroEtapa || 1) - 1)
      const currentStep = roteiro[stepIdx] || roteiro[0] || {}

      const etapaAtual = Math.max(0, (existing.roteiroEtapa || 1) - 1)
      const statusEtapaAtual = roteiro[etapaAtual]?.status || "FILA MÁQUINA"

      const novasEtapas: RoteiroEtapa[] = roteiro.map(r => ({
        machineId: r.machineId,
        setup: r.setup || 0,
        usinagem: r.usinagem || 0,
        diasProcesso: diasProcessoEtapa(r),
        fornecedorExterno: r.fornecedorExterno ?? fornecedorExterno,
        tipoServicoExterno: r.tipoServicoExterno ?? tipoServicoExterno,
        status: r.status || "FILA MÁQUINA"
      }))

      if (opMudou) {
        const oldRoteiroId = roteiroId
        removeRoteiro(oldRoteiroId)
        const roteiroExistente = getRoteiro(useAppStore.getState().roteiros, novoRoteiroId)
        if (roteiroExistente) {
          updateRoteiro(novoRoteiroId, {
            desc: desc.trim(),
            np: np.trim(),
            op: novoOp,
            pv: pv.trim(),
            qtd: Number(qtd || 0),
            sequencia: Number(sequencia || 5),
            opStatus,
            observacao: observacao.trim(),
            fornecedorExterno,
            tipoServicoExterno,
            etapas: novasEtapas,
            updatedAt: new Date().toISOString()
          })
        } else {
          addRoteiro({
            id: novoRoteiroId,
            desc: desc.trim(),
            np: np.trim(),
            op: novoOp,
            pv: pv.trim(),
            qtd: Number(qtd || 0),
            sequencia: Number(sequencia || 5),
            opStatus,
            observacao: observacao.trim(),
            fornecedorExterno,
            tipoServicoExterno,
            entradaMinimaRoteiro: "",
            entradaManual: false,
            entradaManualValor: "",
            etapas: novasEtapas,
            updatedAt: new Date().toISOString()
          })
        }
        for (const m of maquinas) {
          for (const t of m.trabalhos) {
            if (t.roteiroId === oldRoteiroId) {
              updateJob(m.id, t.id, { roteiroId: novoRoteiroId, op: novoOp })
            }
          }
        }
      } else {
        updateRoteiro(roteiroId, {
          desc: desc.trim(),
          np: np.trim(),
          op: novoOp,
          pv: pv.trim(),
          qtd: Number(qtd || 0),
          sequencia: Number(sequencia || 5),
          opStatus,
          observacao: observacao.trim(),
          fornecedorExterno,
          tipoServicoExterno,
          etapas: novasEtapas,
          updatedAt: new Date().toISOString()
        })
      }

      updateJob(maq.id, editId, {
        desc: desc.trim(),
        pv: pv.trim(),
        np: np.trim(),
        op: novoOp,
        roteiroId: novoRoteiroId,
        sequencia: Number(sequencia || 5) + ((existing.roteiroEtapa || 1) - 1) * 5,
        qtd: Number(qtd || 0),
        opStatus,
        status: statusEtapaAtual,
        observacao: observacao.trim(),
        fornecedorExterno,
        tipoServicoExterno,
        setup: currentStep.setup || 0,
        usinagem: currentStep.usinagem || 0,
        diasProcesso: diasProcessoEtapa(currentStep),
        ...(entradaManual && entrada ? { entrada, entradaManual: true, entradaManualValor: entrada } : {})
      })

      // Sync data to all jobs for this roteiroId (desc, np, op, pv, qtd, sequencia, etc.)
      for (const m of maquinas) {
        for (const t of m.trabalhos) {
          if (t.roteiroId === novoRoteiroId && t.id !== editId) {
            const etapa = t.roteiroEtapa || 1
            const routeItem = roteiro[etapa - 1]
            updateJob(m.id, t.id, {
              desc: desc.trim(),
              pv: pv.trim(),
              np: np.trim(),
              op: novoOp,
              qtd: Number(qtd || 0),
              sequencia: Number(sequencia || 5) + (etapa - 1) * 5,
              opStatus,
              observacao: observacao.trim(),
              fornecedorExterno,
              tipoServicoExterno,
              setup: routeItem?.setup || 0,
              usinagem: routeItem?.usinagem || 0,
              diasProcesso: diasProcessoEtapa(routeItem),
              status: opStatus === "PLANEJADA" ? "PLANEJADA" : (routeItem?.status || (etapa === 1 ? "FILA MÁQUINA" : "MAT. EM OUTRA MÁQUINA")),
              roteiroId: novoRoteiroId
            })
          }
        }
      }

      if (etapasMudaram) {
        // Collect all jobs for this roteiroId, deduplicating by etapa
        const oldJobs = new Map<number, { machineId: string; jobId: string; etapa: number }>()
        for (const m of maquinas) {
          for (const t of m.trabalhos) {
            if (t.roteiroId === novoRoteiroId) {
              const e = t.roteiroEtapa || 0
              if (oldJobs.has(e)) {
                // Duplicate — remove extra
                removeJob(m.id, t.id)
              } else {
                oldJobs.set(e, { machineId: m.id, jobId: t.id, etapa: e })
              }
            }
          }
        }

        // For each new etapa: update existing, or create new
        for (let i = 0; i < newMachineIds.length; i++) {
          const machineId = newMachineIds[i]
          const etapa = i + 1
          const routeItem = roteiro[i]
          const etapaStatus = opStatus === "PLANEJADA" ? "PLANEJADA" : (routeItem?.status || (etapa === 1 ? "FILA MÁQUINA" : "MAT. EM OUTRA MÁQUINA"))

          const existing = oldJobs.get(etapa)
          if (existing) {
            if (existing.machineId === machineId) {
              updateJob(existing.machineId, existing.jobId, {
                setup: routeItem?.setup || 0,
                usinagem: routeItem?.usinagem || 0,
                diasProcesso: diasProcessoEtapa(routeItem),
                sequencia: Number(sequencia || 5) + (etapa - 1) * 5,
                status: etapaStatus,
                opStatus,
                observacao: observacao.trim(),
                fornecedorExterno: routeItem?.fornecedorExterno ?? fornecedorExterno,
                tipoServicoExterno: routeItem?.tipoServicoExterno ?? tipoServicoExterno
              })
            } else {
              removeJob(existing.machineId, existing.jobId)
              const maqDestino = maquinas.find(m => m.id === machineId)
              if (maqDestino) {
                addJob({
                  id: uid(), roteiroId: novoRoteiroId, roteiroEtapa: etapa,
                  entradaMinimaRoteiro: "", entradaManual: false, entradaManualValor: "",
                  desc: desc.trim(), pv: pv.trim(), op: novoOp, np: np.trim(),
                  sequencia: Number(sequencia || 5) + (etapa - 1) * 5,
                  qtd: Number(qtd || 0), setup: routeItem?.setup || 0,
                  usinagem: routeItem?.usinagem || 0, diasProcesso: diasProcessoEtapa(routeItem),
                  entrada: "", saida: "", saidaManual: false,
                  opStatus, status: etapaStatus, observacao: observacao.trim(),
                  maquinaId: machineId,
                  fornecedorExterno: routeItem?.fornecedorExterno ?? fornecedorExterno,
                  tipoServicoExterno: routeItem?.tipoServicoExterno ?? tipoServicoExterno
                })
              }
            }
            oldJobs.delete(etapa)
          } else {
            const maqDestino = maquinas.find(m => m.id === machineId)
            if (maqDestino) {
              addJob({
                id: uid(), roteiroId: novoRoteiroId, roteiroEtapa: etapa,
                entradaMinimaRoteiro: "", entradaManual: false, entradaManualValor: "",
                desc: desc.trim(), pv: pv.trim(), op: novoOp, np: np.trim(),
                sequencia: Number(sequencia || 5) + (etapa - 1) * 5,
                qtd: Number(qtd || 0), setup: routeItem?.setup || 0,
                usinagem: routeItem?.usinagem || 0, diasProcesso: diasProcessoEtapa(routeItem),
                entrada: "", saida: "", saidaManual: false,
                opStatus, status: etapaStatus, observacao: observacao.trim(),
                maquinaId: machineId,
                fornecedorExterno: routeItem?.fornecedorExterno ?? fornecedorExterno,
                tipoServicoExterno: routeItem?.tipoServicoExterno ?? tipoServicoExterno
              })
            }
          }
        }

        // Remove orphaned jobs (old etapas not in new route)
        for (const [, { machineId, jobId }] of oldJobs) {
          removeJob(machineId, jobId)
        }
      }

      setOpen(false)
      return
    }

    // Create new job with route — use OP as roteiroId for unification
    const roteiroId = op.trim() || uid()
    const sequenciaBase = Number(sequencia || 5)

    // Check if a Roteiro with this OP already exists; if so, add etapas to it
    const roteiroExistente = getRoteiro(useAppStore.getState().roteiros, roteiroId)
    if (roteiroExistente) {
      // Update existing Roteiro with new etapas
      const novasEtapas: RoteiroEtapa[] = roteiro.map(r => ({
        machineId: r.machineId,
        setup: r.setup || 0,
        usinagem: r.usinagem || 0,
        diasProcesso: diasProcessoEtapa(r),
        fornecedorExterno: r.fornecedorExterno ?? fornecedorExterno,
        tipoServicoExterno: r.tipoServicoExterno ?? tipoServicoExterno,
        status: r.status || "FILA MÁQUINA"
      }))
      updateRoteiro(roteiroId, {
        desc: desc.trim(),
        np: np.trim(),
        op: op.trim(),
        pv: pv.trim(),
        qtd: Number(qtd || 0),
        sequencia: Number(sequencia || 5),
        opStatus,
        observacao: observacao.trim(),
        fornecedorExterno,
        tipoServicoExterno,
        etapas: novasEtapas,
        updatedAt: new Date().toISOString()
      })
    }

    // Create the centralized Roteiro first
    const novoRoteiro: Roteiro = {
      id: roteiroId,
      desc: desc.trim(),
      np: np.trim(),
      op: op.trim(),
      pv: pv.trim(),
      qtd: Number(qtd || 0),
      sequencia: sequenciaBase,
      opStatus,
      observacao: observacao.trim(),
      fornecedorExterno,
      tipoServicoExterno,
      entradaMinimaRoteiro: entrada || "",
      entradaManual: entradaManual && !!entrada,
      entradaManualValor: entrada || "",
      updatedAt: new Date().toISOString(),
      etapas: roteiro.map(r => ({
        machineId: r.machineId,
        setup: r.setup || 0,
        usinagem: r.usinagem || 0,
        diasProcesso: diasProcessoEtapa(r),
        fornecedorExterno: r.fornecedorExterno ?? fornecedorExterno,
        tipoServicoExterno: r.tipoServicoExterno ?? tipoServicoExterno,
        status: r.status || "FILA MÁQUINA"
      }))
    }
    addRoteiro(novoRoteiro)

    roteiroIds.forEach((machineId, index) => {
      if (isAlmox(machineId)) return
      const maqDestino = maquinas.find(m => m.id === machineId)
      if (!maqDestino) return

      const routeItem = roteiro[index] || { setup: 0, usinagem: 0 }
      const itemSetup = Number(routeItem.setup || 0)
      const itemUsinagem = Number(routeItem.usinagem || 0)
      const itemDiasProcesso = diasProcessoEtapa(routeItem)

      const ultimoAtivo = ultimoTrabalhoAtivo(maqDestino)
      const entradaDaFila = ultimoAtivo?.saida || ""
      const entradaDesejada = index === 0 ? entrada : ""
      const novaEntrada = entradaDaFila || entradaDesejada || ""

      let saida = ""
      if (entradaManual && index === 0 && entrada) {
        if (itemDiasProcesso > 0) {
          const d = parseDataOperacional(entrada)
          saida = d ? toDatetimeLocal(adicionarDiasProcesso(d, itemDiasProcesso)) : ""
        } else {
          saida = calcularSaida(entrada, itemSetup, itemUsinagem, Number(qtd || 0), maqDestino.turnos || "1", fator)
        }
      }

      const etapaStatus = opStatus === "PLANEJADA" ? "PLANEJADA" : (routeItem.status || (index === 0 ? "FILA MÁQUINA" : "MAT. EM OUTRA MÁQUINA"))

      addJob({
        id: uid(),
        roteiroId,
        roteiroEtapa: index + 1,
        entradaMinimaRoteiro: index === 0 ? "" : "",
        entradaManual: entradaManual && index === 0,
        entradaManualValor: index === 0 ? entrada : "",
        desc: desc.trim(),
        pv: pv.trim(),
        op: op.trim(),
        np: np.trim(),
        sequencia: sequenciaBase + index * 5,
        qtd: Number(qtd || 0),
        setup: itemSetup,
        usinagem: itemUsinagem,
        diasProcesso: itemDiasProcesso,
        entrada: novaEntrada,
        saida,
        saidaManual: false,
        opStatus,
        status: etapaStatus,
        observacao: observacao.trim(),
        maquinaId: machineId,
        fornecedorExterno: routeItem.fornecedorExterno ?? fornecedorExterno,
        tipoServicoExterno: routeItem.tipoServicoExterno ?? tipoServicoExterno
      })
    })

    setOpen(false)
  }

  if (!open) return null

  const fornecedores = [...new Set(servicosExternosConfig.map(s => s.fornecedor))]
  const servicosFiltrados = servicosExternosConfig.filter(s => s.fornecedor === fornecedorExterno)
  const saidaPreview = calcSaidaPreview()

  return (
    <div className="fixed inset-0 bg-[rgba(7,31,56,.48)] flex items-center justify-center p-4 z-[100]" onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="max-w-[1280px] w-full max-h-[92vh] overflow-auto bg-white dark:bg-[var(--painel)] rounded-3xl shadow-[0_28px_80px_rgba(0,0,0,.26)] border border-[rgba(216,231,245,.8)] dark:border-[var(--linha)]">
        <div className="sticky top-0 z-[2] bg-white dark:bg-[var(--painel)] flex items-start justify-between gap-2.5 px-3.5 py-3 border-b border-[var(--linha)]">
          <div>
            <h2 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-lg leading-tight">{editId ? "Editar serviço" : "Novo serviço"}</h2>
            <p className="text-[var(--cinza)] text-[11px] m-0 mt-1">Informe os dados do serviço à esquerda e monte o roteiro de máquinas à direita. A saída é calculada automaticamente.</p>
          </div>
          <button className="btn-outline btn-small" onClick={() => setOpen(false)}>Fechar</button>
        </div>
        <form className="px-3.5 py-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3 items-start max-md:grid-cols-1">
            <div className="border border-[var(--linha)] rounded-xl bg-gradient-to-b from-white to-[#f7fbff] dark:from-[#111827] dark:to-[#0f172a] p-3 flex flex-col gap-2.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[var(--cinza)] text-xs font-black">Descrição do item</label>
                <textarea className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 min-h-[60px] resize-y outline-none" required value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Corpo válvula esfera 2&rdquo;" />
              </div>
              <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
                <div>
                  <label className="text-[var(--cinza)] text-xs font-black">Código NP</label>
                  <input className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none" placeholder="XXXX-XXX-XXXX" value={np} onChange={e => { setNp(e.target.value); if (!editId) { const exist = buscarRoteiroPorNP(e.target.value); if (exist) { setRoteiro(exist.etapas.map((r, idx) => ({ ...r, status: opStatus === "PLANEJADA" ? "PLANEJADA" : (idx === 0 ? "FILA MÁQUINA" : "MAT. EM OUTRA MÁQUINA") }))); setDesc(exist.desc || "") } } }} />
                </div>
                <div>
                  <label className="text-[var(--cinza)] text-xs font-black">OP (Ordem de Produção)</label>
                  <input className={`w-full border rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none ${opDuplicada ? "border-red-500 dark:border-red-400" : "border-[var(--linha)]"}`} placeholder="Ex: OP-12345" value={op} onChange={e => setOp(e.target.value)} />
                  {opDuplicada && (
                    <small className="text-red-500 dark:text-red-400 text-[11px] mt-1 block">OP já cadastrada. Não é permitido duplicar.</small>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
                <div>
                  <label className="text-[var(--cinza)] text-xs font-black">Quantidade</label>
                  <input type="number" min="1" step="1" className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none" placeholder="0" required value={qtd} onChange={e => setQtd(e.target.value)} />
                </div>
                <div>
                  <label className="text-[var(--cinza)] text-xs font-black">PV Pedido de venda</label>
                  <input className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none" placeholder="Ex: PV-12345" value={pv} onChange={e => setPv(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[var(--cinza)] text-xs font-black">{entradaManual || editId ? "Entrada" : "Entrada sugerida"}</label>
                <input type="datetime-local" className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none" value={entrada} onChange={e => { setEntrada(e.target.value); setEntradaManual(true) }} />
                {!editId && !entradaManual && maq && (
                  <small className="text-[var(--cinza)] text-[11px] mt-1">
                    {ultimoTrabalhoAtivo(maq)?.saida
                      ? `Saída do último serviço da primeira máquina do roteiro (${escapeHTML(maq.nome)}): ${formatDateTime(ultimoTrabalhoAtivo(maq)!.saida)}.`
                      : "Para o primeiro serviço da primeira máquina do roteiro, informe a entrada inicial."}
                  </small>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[var(--cinza)] text-xs font-black">Status da OP</label>
                <select className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none" value={opStatus} onChange={e => {
                  const novo = e.target.value
                  setOpStatus(novo)
                  if (novo === "PLANEJADA") {
                    setRoteiro(roteiro.map(r => ({ ...r, status: "PLANEJADA" })))
                  } else {
                    setRoteiro(roteiro.map((r, idx) => ({ ...r, status: idx === 0 ? "FILA MÁQUINA" : "MAT. EM OUTRA MÁQUINA" })))
                  }
                }}>
                  {OP_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              {status === "SERVIÇO EXTERNO" && (
                <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
                  <div>
                    <label className="text-[var(--cinza)] text-xs font-black">Fornecedor</label>
                    <select className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2" value={fornecedorExterno} onChange={e => { setFornecedorExterno(e.target.value); setTipoServicoExterno(""); const novo = roteiro.map(r => ({ ...r, diasProcesso: 0 })); setRoteiro(novo) }}>
                      <option value="">Selecione...</option>
                      {fornecedores.map(f => <option key={f} value={f}>{escapeHTML(f)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[var(--cinza)] text-xs font-black">Tipo de serviço</label>
                    <select className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2" value={tipoServicoExterno} onChange={e => { setTipoServicoExterno(e.target.value); const cfg = servicosExternosConfig.find(s => s.fornecedor === fornecedorExterno && s.servico === e.target.value); if (cfg && roteiro.length > 0) { const novo = roteiro.map(r => ({ ...r, diasProcesso: cfg.dias })); setRoteiro(novo) } }}>
                      <option value="">Selecione...</option>
                      {servicosFiltrados.map(s => <option key={s.id} value={s.servico}>{escapeHTML(s.servico)} ({s.dias} dia{s.dias !== 1 ? 's' : ''})</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[var(--cinza)] text-xs font-black">Observação</label>
                <textarea className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 min-h-[60px] resize-y outline-none" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Observações rápidas sobre material, pendências, retrabalho etc." />
              </div>
            </div>
            <div className="border border-[var(--linha)] rounded-xl bg-gradient-to-b from-white to-[#f7fbff] dark:from-[#111827] dark:to-[#0f172a] p-3 flex flex-col gap-2">
              <h3 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm">Roteiro de máquinas</h3>
              <div>
                <label className="text-[var(--cinza)] text-xs font-black">Seq. operacional inicial</label>
                <input type="number" min="0" step="5" className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none" value={sequencia} onChange={e => setSequencia(e.target.value)} />
              </div>
              <div className="flex gap-2 items-end">
                <button type="button" className="btn-primary text-xs" onClick={adicionarEtapa}>+ Adicionar máquina</button>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                {roteiro.map((item, idx) => {
                  const seq = Number(sequencia || 5) + idx * 5
                  const maqSel = maquinas.find(m => m.id === item.machineId)
                  const nomeMaq = maqSel?.nome || ""
                  const ehExterno = isServicoExterno(nomeMaq)
                  const pp = maqSel ? detectarProcessoPadrao(nomeMaq) : null
                  const isProcesso = pp !== null
                  const isAlmoxSel = item.machineId === ID_ALMOX

                  return (
                    <div
                      key={idx}
                      draggable
                      onDragStart={e => {
                        dragIdxRef.current = idx
                        ;(e.target as HTMLElement).closest(".roteiro-stage")?.classList.add("dragging")
                        e.dataTransfer.effectAllowed = "move"
                        e.dataTransfer.setData("text/plain", String(idx))
                      }}
                      onDragOver={e => {
                        if (dragIdxRef.current === null || dragIdxRef.current === idx) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = "move"
                        document.querySelectorAll(".roteiro-stage.drag-over").forEach(el => el.classList.remove("drag-over"))
                        ;(e.target as HTMLElement).closest(".roteiro-stage")?.classList.add("drag-over")
                      }}
                      onDrop={e => {
                        e.preventDefault()
                        document.querySelectorAll(".roteiro-stage.drag-over").forEach(el => el.classList.remove("drag-over"))
                        const srcIdx = dragIdxRef.current
                        if (srcIdx !== null && srcIdx !== idx) {
                          const novo = [...roteiro]
                          const [item] = novo.splice(srcIdx, 1)
                          novo.splice(idx, 0, item)
                          setRoteiro(novo)
                        }
                        dragIdxRef.current = null
                      }}
                      onDragEnd={() => {
                        document.querySelectorAll(".roteiro-stage.dragging, .roteiro-stage.drag-over").forEach(el => el.classList.remove("dragging", "drag-over"))
                        dragIdxRef.current = null
                      }}
                      className="roteiro-stage flex flex-col gap-2 border border-[var(--linha)] rounded-xl bg-white dark:bg-[var(--branco)] p-3"
                    >
                      <div className="flex gap-2 items-center max-md:flex-col max-md:items-stretch">
                        <span className="drag-handle cursor-grab select-none text-[var(--cinza)] text-sm shrink-0">⠿</span>
                        <span className="inline-flex items-center justify-center bg-[var(--azul-claro)] text-[var(--azul-escuro)] text-[10px] font-black rounded-full px-1.5 py-0.5 whitespace-nowrap shrink-0">{seq}</span>
                        <select
                          className="flex-1 min-w-0 border border-[var(--linha)] rounded-lg p-2 text-sm font-black bg-white dark:bg-[var(--branco)] text-[var(--texto)]"
                          value={item.machineId}
                          onChange={e => {
                            const newId = e.target.value
                            const novo = [...roteiro]
                            const maqNova = maquinas.find(m => m.id === newId)
                            const pp2 = maqNova ? detectarProcessoPadrao(maqNova.nome) : null
                            const ehExt = isServicoExterno(maqNova?.nome || "")
                            const etapaStatus = opStatus === "PLANEJADA" ? "PLANEJADA" : (item.status || "FILA MÁQUINA")
                            if (ehExt) {
                              novo[idx] = { ...novo[idx], machineId: newId, setup: 0, usinagem: 0, diasProcesso: 0, status: etapaStatus, tipoServicoExterno: "", fornecedorExterno: "" }
                            } else {
                              novo[idx] = { ...novo[idx], machineId: newId, status: etapaStatus, ...(pp2 ? { diasProcesso: pp2.dias } : {}) }
                            }
                            setRoteiro(novo)
                          }}
                        >
                          <option value={ID_ALMOX}>ALMOX (Almoxarifado)</option>
                          {[...maquinas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(m => (
                            <option key={m.id} value={m.id}>{escapeHTML(m.nome)}</option>
                          ))}
                        </select>
                        <select
                          className={`shrink-0 w-[150px] max-md:w-full border border-[var(--linha)] rounded-lg p-2 text-[11px] font-black badge-${classeStatusTrabalho(item.status || "FILA MÁQUINA")}`}
                          value={item.status || "FILA MÁQUINA"}
                          onChange={e => atualizarEtapa(idx, "status", e.target.value)}
                        >
                          {JOB_STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2 items-center pl-[34px] max-md:pl-0 max-md:flex-col max-md:items-stretch">
                        {ehExterno && (
                          <div className="flex gap-2 items-center max-md:flex-col max-md:items-stretch max-md:w-full">
                            <select
                              className="flex-1 min-w-0 border border-[var(--linha)] rounded-lg p-1.5 text-sm font-bold bg-white dark:bg-[var(--branco)] text-[var(--texto)]"
                              value={item.tipoServicoExterno || ""}
                              onChange={e => alterarServicoExternoRoteiro(idx, 'tipoServico', e.target.value)}
                            >
                              <option value="">Tipo de serviço...</option>
                              {[...new Set(servicosExternosConfig.map(s => s.servico))].map(s => (
                                <option key={s} value={s}>{escapeHTML(s)}</option>
                              ))}
                            </select>
                            <select
                              className="flex-1 min-w-0 border border-[var(--linha)] rounded-lg p-1.5 text-sm font-bold bg-white dark:bg-[var(--branco)] text-[var(--texto)]"
                              value={item.fornecedorExterno || ""}
                              onChange={e => alterarServicoExternoRoteiro(idx, 'fornecedor', e.target.value)}
                              disabled={!item.tipoServicoExterno}
                            >
                              <option value="">Fornecedor...</option>
                              {servicosExternosConfig.filter(s => s.servico === item.tipoServicoExterno).map(s => (
                                <option key={s.id} value={s.fornecedor}>{escapeHTML(s.fornecedor)}</option>
                              ))}
                            </select>
                            <span className="text-xs font-black text-[var(--azul)] shrink-0">{item.diasProcesso || 0}d</span>
                          </div>
                        )}
                        {!ehExterno && !isProcesso && (
                          <div className="flex gap-2 items-center max-md:flex-col max-md:items-stretch max-md:w-full">
                            <label className="text-[10px] font-black text-[var(--cinza)] uppercase shrink-0">Setup</label>
                            <input type="number" min="0" step="1" className="w-[80px] max-md:w-full border border-[var(--linha)] rounded-lg p-1.5 text-sm bg-white dark:bg-[var(--branco)] text-[var(--texto)]" value={item.setup || ""} onChange={e => atualizarEtapa(idx, "setup", Number(e.target.value))} disabled={isAlmoxSel} />
                            <label className="text-[10px] font-black text-[var(--cinza)] uppercase shrink-0">Usinagem</label>
                            <input type="number" min="0" step="1" className="w-[80px] max-md:w-full border border-[var(--linha)] rounded-lg p-1.5 text-sm bg-white dark:bg-[var(--branco)] text-[var(--texto)]" value={item.usinagem || ""} onChange={e => atualizarEtapa(idx, "usinagem", Number(e.target.value))} disabled={isAlmoxSel} />
                          </div>
                        )}
                        {isProcesso && !ehExterno && (
                          <span className="text-xs font-black text-[var(--azul)]">Processo padrão: {pp!.dias}d</span>
                        )}
                        <div className="flex gap-1.5 ml-auto shrink-0 max-md:self-end">
                          <button type="button" className="btn-danger btn-small" onClick={() => removerEtapa(idx)} disabled={roteiro.length <= 1} title="Remover"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {roteiro.length > 1 && (
                <small className="text-[var(--cinza)] text-[11px]">
                  Roteiro: {roteiro.map((item, idx) => `${Number(sequencia || 5) + idx * 5} - ${escapeHTML(maquinas.find(m => m.id === item.machineId)?.nome || "?")}`).join(" → ")}
                </small>
              )}
              {roteiro.length <= 1 && (
                <small className="text-[var(--cinza)] text-[11px]">Você pode adicionar qualquer máquina como próxima etapa, inclusive a mesma máquina novamente.</small>
              )}
              {entrada && (
                <div className="mt-2 p-2 bg-[var(--azul-claro)] dark:bg-[var(--azul-claro)] rounded-lg text-center">
                  <small className="text-[var(--azul-escuro)] dark:text-[var(--azul)] font-black">
                    {editId ? "Saída" : "Previsão"} : {saidaPreview ? formatDateTime(saidaPreview) : "—"}
                  </small>
                </div>
              )}
            </div>
          </div>
          {erroSalvar && (
            <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {erroSalvar}
            </div>
          )}
          <div className="flex justify-end gap-2.5 mt-4 flex-wrap">
            <button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="submit" className="btn-primary">{editId ? "Salvar alterações" : "Adicionar roteiro na fila"}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
