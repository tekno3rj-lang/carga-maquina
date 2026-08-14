"use client"

import { useAppStore } from "@/store/useAppStore"
import { podeEditar } from "@/lib/auth"
import { isAlmox, isJobFinalizado, classeStatusTrabalho, totalLoteFatorado } from "@/lib/scheduling"
import { formatDateTime, formatMinutos, formatLeadTime, escapeHTML } from "@/lib/formats"
import { pedirConfirmacao } from "@/components/modals/ConfirmModal"
import { Fragment, useMemo } from "react"

function extrairPV(pv: string): string {
  const m = String(pv || "").match(/^(\d{5})/)
  return m ? m[1] : ""
}

function extrairItem(pv: string): string {
  const m = String(pv || "").match(/-(\d+)$/)
  return m ? m[1] : ""
}

function classeMapeamento(status: string | undefined, semJob: boolean): string {
  if (semJob) {
    const s = String(status || "").toUpperCase()
    if (s === "FINALIZADO") return "finalizado"
    return "outra"
  }
  const s = String(status || "").toUpperCase()
  if (s === "MAT. EM OUTRA MÁQUINA") return "outra"
  return classeStatusTrabalho(status || "FILA MÁQUINA")
}

export function MapeamentoTable() {
  const maquinas = useAppStore(s => s.maquinas)
  const roteiros = useAppStore(s => s.roteiros)
  const fator = useAppStore(s => s.fator)
  const setMostrandoMapeamento = useAppStore(s => s.setMostrandoMapeamento)
  const updateJob = useAppStore(s => s.updateJob)
  const removeJob = useAppStore(s => s.removeJob)
  const filtroPV = useAppStore(s => s.mapeamentoFiltroPV)
  const setMapeamentoFiltroPV = useAppStore(s => s.setMapeamentoFiltroPV)
  const usuario = useAppStore(s => s.usuario)
  const editavel = podeEditar(usuario?.nivel)

  const maquinaPorId = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of maquinas) {
      map.set(m.id, m.nome)
    }
    return map
  }, [maquinas])

  const grupos = useMemo(() => {
    const jobsPorRoteiro = new Map<string, { jobs: typeof maquinas[0]["trabalhos"]; maqs: typeof maquinas }>()
    for (const m of maquinas) {
      for (const j of m.trabalhos) {
        const opStatus = String(j.opStatus || "").toUpperCase()
        if (opStatus !== "LIBERADA") continue
        if (!j.op) continue
        const chave = j.roteiroId || j.id
        if (!jobsPorRoteiro.has(chave)) jobsPorRoteiro.set(chave, { jobs: [], maqs: [] })
        const g = jobsPorRoteiro.get(chave)!
        g.jobs.push(j)
        g.maqs.push(m)
      }
    }

    const result: {
      roteiroId: string
      jobs: typeof maquinas[0]["trabalhos"]
      maqs: typeof maquinas
      roteiro: typeof roteiros[0] | undefined
      primeiro: typeof maquinas[0]["trabalhos"][0]
    }[] = []

    for (const [roteiroId, g] of jobsPorRoteiro) {
      const combined = g.jobs.map((job, i) => ({ job, maquina: g.maqs[i] }))
      combined.sort((a, b) => (a.job.roteiroEtapa || 0) - (b.job.roteiroEtapa || 0))
      g.jobs = combined.map(c => c.job)
      g.maqs = combined.map(c => c.maquina)

      const roteiro = roteiros.find(r => r.id === roteiroId)
      const primeiro = g.jobs[0]
      if (primeiro) {
        result.push({ roteiroId, jobs: g.jobs, maqs: g.maqs, roteiro, primeiro })
      }
    }

    result.sort((a, b) =>
      String(a.primeiro?.op || "").localeCompare(String(b.primeiro?.op || ""), "pt-BR", { numeric: true })
    )
    return result
  }, [maquinas, roteiros])

  const pvsDisponiveis = useMemo(() => {
    const set = new Set<string>()
    for (const g of grupos) {
      const pv = g.primeiro.pv
      if (pv) set.add(pv)
    }
    if (filtroPV) set.add(filtroPV)
    return Array.from(set).sort()
  }, [grupos, filtroPV])

  const gruposFiltrados = useMemo(() => {
    if (!filtroPV) return grupos
    return grupos.filter(g => g.primeiro.pv === filtroPV)
  }, [grupos, filtroPV])

  const porcentagemConclusaoPV = useMemo(() => {
    if (!filtroPV || gruposFiltrados.length === 0) return null
    const soma = gruposFiltrados.reduce((acc, g) => {
      const total = g.jobs.length
      if (!total) return acc
      const concluidas = g.jobs.filter(j => isJobFinalizado(j)).length
      return acc + (concluidas / total * 100)
    }, 0)
    return Math.round(soma / gruposFiltrados.length)
  }, [gruposFiltrados, filtroPV])

  const handleEditar = (maqId: string, jobId: string) => {
    useAppStore.setState({ atualId: maqId })
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("edit-job", { detail: jobId }))
    }, 50)
  }

  const handleExcluir = (chave: string) => {
    if (!chave) return
    pedirConfirmacao("Excluir toda a OP liberada?", () => {
      maquinas.forEach(m => {
        const remover: string[] = []
        m.trabalhos.forEach(t => {
          if (t.roteiroId === chave || t.op === chave) {
            remover.push(t.id)
          }
        })
        remover.forEach(id => { removeJob(m.id, id) })
      })
    })
  }

  return (
    <section className="panel queue-panel p-2 pl-3 bg-[rgba(249,251,255,.94)] dark:bg-[var(--painel)] border border-[var(--linha)] rounded-[var(--raio)] shadow-[var(--sombra)]">
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center mb-1.5">
        <div>
          <h2 className="section-title m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm font-bold">Mapeamento de OPs</h2>
          <p className="text-[var(--cinza)] text-[11px] m-0 leading-tight">
            Ordens de produção liberadas, agrupadas por roteiro. Visão geral de todo o chão de fábrica.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {pvsDisponiveis.length > 0 && (
            <select
              className="text-xs border border-[var(--linha)] rounded-lg px-1 py-0.5 bg-white dark:bg-[var(--hover)] text-[var(--texto)]"
              value={filtroPV}
              onChange={e => setMapeamentoFiltroPV(e.target.value)}
            >
              <option value="">Todos os PVs</option>
              {pvsDisponiveis.map(pv => (
                <option key={pv} value={pv}>{pv}</option>
              ))}
            </select>
          )}
          <button className="btn-outline text-xs" onClick={() => setMostrandoMapeamento(false)}>Voltar</button>
        </div>
      </div>
      {filtroPV && (
        <p className="text-[var(--cinza)] text-[11px] mb-1 flex items-center gap-2">
          <span>{gruposFiltrados.length} OP{(gruposFiltrados.length !== 1 ? "s" : "")} — {filtroPV}</span>
          {porcentagemConclusaoPV !== null && (
            <span className="inline-flex items-center gap-1.5" title="Percentual de conclusão da PV (média das OPs)">
              <span className="inline-block w-24 h-2 rounded-full bg-[#e6f4ea] dark:bg-[#143828] overflow-hidden">
                <span className="block h-full rounded-full bg-[#137333]" style={{ width: `${porcentagemConclusaoPV}%` }} />
              </span>
              <strong className="text-[10px] font-black">{porcentagemConclusaoPV}%</strong>
            </span>
          )}
        </p>
      )}
      <div className="table-wrap w-full overflow-auto border border-[var(--linha)] rounded-[18px] bg-white dark:bg-[var(--painel)]">
        <table className="w-full border-collapse min-w-[1200px]">
          <thead>
            <tr>
              {["OP", "Descrição", "NP", "PV", "Qtd.", "Roteiro", "Setup total", "Usinagem total", "Lead time", "Ações"].map(h => (
                <th key={h} className="bg-[var(--azul)] text-white text-left px-1 py-0.5 text-[11px] whitespace-nowrap first:rounded-tl-[17px] last:rounded-tr-[17px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gruposFiltrados.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-4 px-3 text-[var(--cinza)] text-xs">{filtroPV ? "Nenhuma OP encontrada para a PV selecionada." : "Nenhuma ordem de produção liberada encontrada."}</td></tr>
            ) : (
              gruposFiltrados.map(grupo => {
                const setupTotal = grupo.jobs.reduce((s, j) => s + Number(j.setup || 0), 0)
                const usinagemTotal = grupo.jobs.reduce((s, j) => s + Number(j.usinagem || 0) * Number(j.qtd || 0), 0)
                const totalFatorado = grupo.jobs.reduce((s, j, i) => s + totalLoteFatorado(j, fator, grupo.maqs[i]), 0)
                const etapas = grupo.roteiro?.etapas || []
                const temRoteiro = etapas.length > 0

                return (
                  <tr key={grupo.roteiroId}>
                    <td className="px-1 py-0.5"><strong className="text-xs">{escapeHTML(grupo.primeiro.op || "-")}</strong></td>
                    <td className="px-1 py-0.5 max-w-[160px]">
                      <span className="block max-w-[160px] whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer font-black text-xs" title={escapeHTML(grupo.primeiro.desc)} onClick={() => navigator.clipboard.writeText(grupo.primeiro.desc)}>
                        {escapeHTML(grupo.primeiro.desc || "-")}
                      </span>
                    </td>
                    <td className="px-1 py-0.5 text-xs"><span className="font-black">{escapeHTML(grupo.primeiro.np || "-")}</span></td>
                    <td className="px-1 py-0.5 text-xs"><span className="font-black" title={escapeHTML(grupo.primeiro.pv || "")}>{escapeHTML((grupo.primeiro.pv || "-").slice(0, 12))}</span></td>
                    <td className="px-1 py-0.5 text-xs">{grupo.primeiro.qtd || 0}</td>
                    <td className="px-1 py-0.5 text-[11px] leading-relaxed">
                      {temRoteiro ? (
                        etapas.map((etapa, ridx) => {
                          if (isAlmox(etapa.machineId)) {
                            return <Fragment key={ridx}><span className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-black leading-tight whitespace-nowrap badge-default m-[1px]">ALMOX</span>{(ridx + 1) % 10 === 0 && <br />}</Fragment>
                          }
                          const etapaIdx = ridx + 1
                          const jobMatch = grupo.jobs.find(j => j.roteiroEtapa === etapaIdx)
                          const nomeMaq = maquinaPorId.get(etapa.machineId) || etapa.machineId.slice(0, 8)
                          const semJob = !jobMatch
                          const status = etapa.status || jobMatch?.status || (semJob ? "MAT. EM OUTRA MÁQUINA" : "—")
                          const sc = classeMapeamento(status, semJob)
                          const seq = jobMatch?.sequencia || (5 + ridx * 5)
                          return <Fragment key={ridx}><span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-black leading-tight whitespace-nowrap m-[1px] badge-${sc}`} title={`Seq. ${seq} · ${status} · Entrada: ${formatDateTime(jobMatch?.entrada || "")} · Saída: ${formatDateTime(jobMatch?.saida || "")}`}>{escapeHTML(nomeMaq)}</span>{(ridx + 1) % 10 === 0 && <br />}</Fragment>
                        })
                      ) : (
                        grupo.jobs.map((job, ridx) => {
                          const maq = grupo.maqs[ridx]
                          if (isAlmox(job.maquinaId || maq?.id)) {
                            return <Fragment key={ridx}><span className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-black leading-tight whitespace-nowrap badge-default m-[1px]">ALMOX</span>{(ridx + 1) % 10 === 0 && <br />}</Fragment>
                          }
                          const nomeMaq = maq?.nome || job.maquinaId.slice(0, 8)
                          const s = job.status || "FILA MÁQUINA"
                          const sc = classeStatusTrabalho(s)
                          return <Fragment key={ridx}><span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-black leading-tight whitespace-nowrap m-[1px] badge-${sc}`} title={`Seq. ${job.sequencia || (5 + ridx * 5)} · ${s} · Entrada: ${formatDateTime(job.entrada || "")} · Saída: ${formatDateTime(job.saida || "")}`}>{escapeHTML(nomeMaq)}</span>{(ridx + 1) % 10 === 0 && <br />}</Fragment>
                        })
                      )}
                      {(etapas.length > 0 || grupo.jobs.length > 0) && <br />}
                      {(() => {
                        const pct = Math.round(grupo.jobs.filter(j => isJobFinalizado(j)).length / grupo.jobs.length * 100)
                        return (
                          <span className="inline-flex items-center gap-1.5" title={`${pct}% das etapas concluídas`}>
                            <span className="inline-block w-16 h-1.5 rounded-full bg-[#e6f4ea] dark:bg-[#143828] overflow-hidden">
                              <span className="block h-full rounded-full bg-[#137333]" style={{ width: `${pct}%` }} />
                            </span>
                            <strong className="text-[10px] font-black text-[var(--texto)]">{pct}%</strong>
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-1 py-0.5 text-xs">{formatMinutos(setupTotal)}</td>
                    <td className="px-1 py-0.5 text-xs">{formatMinutos(usinagemTotal)}</td>
                    <td className="px-1 py-0.5 text-xs"><strong>{formatLeadTime(totalFatorado)}</strong></td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {editavel && (
                          <button className="btn-outline btn-small" onClick={() => handleEditar(grupo.maqs[0]?.id || "", grupo.primeiro.id)} title="Editar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                          </button>
                        )}
                        {editavel && (
                          <button className="btn-danger btn-small" onClick={() => handleExcluir(grupo.roteiroId || grupo.primeiro.op || "")} title="Excluir">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
