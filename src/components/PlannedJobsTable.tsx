"use client"

import { useAppStore } from "@/store/useAppStore"
import { isJobPlanejado, classeStatusTrabalho, totalLoteFatorado, isAlmox } from "@/lib/scheduling"
import { formatDateTime, formatMinutos, formatLeadTime, escapeHTML } from "@/lib/formats"
import { pedirConfirmacao } from "@/components/modals/ConfirmModal"
import { podeEditar } from "@/lib/auth"
import { Fragment, useMemo } from "react"

export function PlannedJobsTable() {
  const maquinas = useAppStore(s => s.maquinas)
  const roteiros = useAppStore(s => s.roteiros)
  const fator = useAppStore(s => s.fator)
  const removeJob = useAppStore(s => s.removeJob)
  const toggleDesconsiderarCarga = useAppStore(s => s.toggleDesconsiderarCarga)
  const filtroPV = useAppStore(s => s.planejadasFiltroPV)
  const setPlanejadasFiltroPV = useAppStore(s => s.setPlanejadasFiltroPV)
  const usuario = useAppStore(s => s.usuario)
  const editavel = podeEditar(usuario?.nivel)

  const grupos = useMemo(() => {
    const map = new Map<string, { chave: string; jobs: typeof maquinas[0]["trabalhos"]; maqs: typeof maquinas }>()
    maquinas.forEach(m => {
      (m.trabalhos || []).forEach(j => {
        if (isJobPlanejado(j)) {
          const chave = j.roteiroId || j.op || j.id
          if (!map.has(chave)) map.set(chave, { chave, jobs: [], maqs: [] })
          const g = map.get(chave)!
          g.jobs.push(j)
          g.maqs.push(m)
        }
      })
    })
    map.forEach(g => {
      const combined = g.jobs.map((job, i) => ({ job, maquina: g.maqs[i] }))
      combined.sort((a, b) => (a.job.roteiroEtapa || 0) - (b.job.roteiroEtapa || 0))
      g.jobs = combined.map(c => c.job)
      g.maqs = combined.map(c => c.maquina)
    })
    return Array.from(map.values()).sort((a, b) =>
      String(a.jobs[0]?.op || "").localeCompare(String(b.jobs[0]?.op || ""), "pt-BR", { numeric: true })
    )
  }, [maquinas])

  const pvsDisponiveis = useMemo(() => {
    const set = new Set<string>()
    for (const g of grupos) {
      const pv = g.jobs[0]?.pv
      if (pv) set.add(pv)
    }
    if (filtroPV) set.add(filtroPV)
    return Array.from(set).sort()
  }, [grupos, filtroPV])

  const gruposFiltrados = useMemo(() => {
    if (!filtroPV) return grupos
    return grupos.filter(g => g.jobs[0]?.pv === filtroPV)
  }, [grupos, filtroPV])

  const handleSimular = (roteiroId: string) => {
    window.dispatchEvent(new CustomEvent("simular-planejada", { detail: { type: "simular", roteiroId } }))
  }

  const handleExcluir = (chave: string) => {
    if (!chave) return
    pedirConfirmacao("Excluir toda a OP planejada?", () => {
      const afetadas = new Set<string>()
      maquinas.forEach(m => {
        const remover: string[] = []
        m.trabalhos.forEach(t => {
          if (t.roteiroId === chave || (t.op === chave && isJobPlanejado(t))) {
            remover.push(t.id)
          }
        })
        remover.forEach(id => { removeJob(m.id, id); afetadas.add(m.id) })
      })
    })
  }

  const handleEditar = (maqId: string, jobId: string) => {
    useAppStore.setState({ atualId: maqId })
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("edit-job", { detail: jobId }))
    }, 50)
  }

  return (
    <section className="panel queue-panel p-2 pl-3 bg-[rgba(249,251,255,.94)] dark:bg-[var(--painel)] border border-[var(--linha)] rounded-[var(--raio)] shadow-[var(--sombra)]">
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center mb-1.5">
        <div>
          <h2 className="section-title m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm font-bold">Planejadas Geral</h2>
          <p className="text-[var(--cinza)] text-[11px] m-0 leading-tight">
            Planejadas não entram no sequenciamento oficial. Use &quot;Simular&quot; para prever cada OP contra a carga liberada.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          {pvsDisponiveis.length > 0 && (
            <select
              className="text-xs border border-[var(--linha)] rounded-lg px-1 py-0.5 bg-white dark:bg-[var(--hover)] text-[var(--texto)]"
              value={filtroPV}
              onChange={e => setPlanejadasFiltroPV(e.target.value)}
            >
              <option value="">Todos os PVs</option>
              {pvsDisponiveis.map(pv => (
                <option key={pv} value={pv}>{pv}</option>
              ))}
            </select>
          )}
          {editavel && (
            <button className="btn-primary text-xs" onClick={() => {
              if (!maquinas.length) { alert("Crie uma máquina antes."); return }
              useAppStore.getState().selectMachine(maquinas[0].id)
              setTimeout(() => window.dispatchEvent(new CustomEvent("open-modal", { detail: "jobModal" })), 50)
            }}>+ Novo serviço</button>
          )}
          <button className="btn-outline text-xs" onClick={() => useAppStore.getState().setMostrandoPlanejadasGeral(false)}>Voltar</button>
        </div>
      </div>
      {filtroPV && (
        <p className="text-[var(--cinza)] text-[11px] mb-1">
          {gruposFiltrados.length} OP{(gruposFiltrados.length !== 1 ? "s" : "")} — {filtroPV}
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
              <tr><td colSpan={10} className="text-center py-4 text-[var(--cinza)] text-xs">{filtroPV ? "Nenhuma ordem de produção planejada encontrada para a PV selecionada." : "Nenhuma ordem de produção planejada encontrada."}</td></tr>
            ) : (
              gruposFiltrados.map(grupo => {
                const primeiro = grupo.jobs[0]
                const desconsiderado = grupo.jobs.some(j => j.desconsiderarCarga)
                const setupTotal = grupo.jobs.reduce((s, j) => s + Number(j.setup || 0), 0)
                const usinagemTotal = grupo.jobs.reduce((s, j) => s + Number(j.usinagem || 0) * Number(j.qtd || 0), 0)
                const totalFatorado = grupo.jobs.reduce((s, j, i) => s + totalLoteFatorado(j, fator, grupo.maqs[i]), 0)
                const etapasConcluidas = grupo.jobs.filter(j => String(j.status || "").toUpperCase() === "FINALIZADO").length
                const roteiroId = primeiro.roteiroId || ""
                const roteiroData = roteiros.find(r => r.id === roteiroId)
                const machineIdsRoteiro = roteiroData ? roteiroData.etapas.map(e => e.machineId) : null

                return (
                  <tr key={roteiroId || primeiro.op} data-roteiro-id={roteiroId || primeiro.op || ""} className={desconsiderado ? "opacity-40" : ""}>
                    <td className="px-1 py-0.5">
                      <strong className="text-xs">{escapeHTML(primeiro.op || "-")}</strong>
                    </td>
                    <td className="px-1 py-0.5 max-w-[160px]">
                      <span className="block max-w-[160px] whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer font-black text-xs" title={escapeHTML(primeiro.desc)} onClick={() => navigator.clipboard.writeText(primeiro.desc)}>
                        {escapeHTML(primeiro.desc || "-")}
                      </span>
                    </td>
                    <td className="px-1 py-0.5 text-xs"><span className="font-black">{escapeHTML(primeiro.np || "-")}</span></td>
                    <td className="px-1 py-0.5 text-xs"><span className="font-black">{escapeHTML(primeiro.pv || "-")}</span></td>
                    <td className="px-1 py-0.5 text-xs">{primeiro.qtd || 0}</td>
                    <td className="text-[11px] leading-relaxed">
                      {(() => {
                        let jobIdx = 0
                        const lista = machineIdsRoteiro?.length ? machineIdsRoteiro : grupo.maqs.map(m => m.id)
                        return lista.map((rid: string, ridx: number) => {
                          if (isAlmox(rid)) return <Fragment key={ridx}><span className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-black leading-tight whitespace-nowrap badge-default m-[1px]">ALMOX</span>{(ridx + 1) % 10 === 0 && <br />}</Fragment>
                          const maqAt = grupo.maqs[jobIdx]
                          const jobAt = grupo.jobs[jobIdx]
                          jobIdx++
                          if (maqAt) {
                            const s = jobAt ? (jobAt.status || "FILA MÁQUINA") : "—"
                            const sc = classeStatusTrabalho(s)
                            const entradaInformada = jobAt?.entradaManual && jobAt.entradaManualValor
                              ? ` · Entrada informada: ${formatDateTime(jobAt.entradaManualValor)}`
                              : ""
                            return <Fragment key={ridx}><span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-black leading-tight whitespace-nowrap m-[1px] badge-${sc}`} title={`Seq. ${jobAt?.sequencia || (5 + ridx * 5)} · ${s}${entradaInformada} · Use Simular para prever as datas`}>{escapeHTML(maqAt.nome)}</span>{(ridx + 1) % 10 === 0 && <br />}</Fragment>
                          }
                          return null
                        })
                      })()}
                      {etapasConcluidas > 0 && <br />}
                      {etapasConcluidas > 0 && <span className="text-[10px] text-[var(--cinza)]">{etapasConcluidas}/{grupo.jobs.length} etapas concluídas</span>}
                    </td>
                    <td className="px-1 py-0.5 text-xs">{formatMinutos(setupTotal)}</td>
                    <td className="px-1 py-0.5 text-xs">{formatMinutos(usinagemTotal)}</td>
                    <td className="px-1 py-0.5 text-xs">{desconsiderado ? <span className="text-[var(--cinza)] italic">—</span> : <strong>{formatLeadTime(totalFatorado)}</strong>}</td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        <button className="btn-outline btn-small" onClick={() => handleSimular(roteiroId)} title="Simular">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 9-14 9V3z"/></svg>
                        </button>
                        {editavel && (
                          <button className="btn-outline btn-small" onClick={() => handleEditar(grupo.maqs[0]?.id || "", primeiro.id)} title="Editar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                          </button>
                        )}
                        {editavel && (
                          <button
                            className={`btn-small ${desconsiderado ? "btn-primary" : "btn-outline"}`}
                            onClick={() => toggleDesconsiderarCarga(roteiroId || primeiro.op || "")}
                            title={desconsiderado ? "Considerar na carga planejada" : "Desconsiderar da carga planejada"}
                          >
                            {desconsiderado
                              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            }
                          </button>
                        )}
                        {editavel && (
                          <button className="btn-danger btn-small" onClick={() => handleExcluir(roteiroId || primeiro.op || "")} title="Excluir">
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
