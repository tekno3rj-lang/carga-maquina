"use client"

import { memo, useRef, useCallback, useMemo } from "react"
import { useAppStore } from "@/store/useAppStore"
import { trabalhosAtivos, trabalhosOcultos, isJobFinalizado, classeStatusTrabalho, totalLoteFatorado, formatDiasUteis, obterPrioridadePV, maquinaUsaFilaPrioridade } from "@/lib/scheduling"
import { formatDateTime, formatMinutos, escapeHTML, truncar } from "@/lib/formats"
import { JOB_STATUSES } from "@/lib/constants"
import { pedirConfirmacao } from "@/components/modals/ConfirmModal"
import { podeEditar } from "@/lib/auth"
import type { Job, Machine, Roteiro } from "@/store/types"

const JOB_ROW_EMPTY = ["Prioridade", "Descrição", "NP", "OP", "Seq. op.", "Qtd.", "Setup lote", "Usinagem/item", "Total lote", "Entrada", "Saída", "Status", "Máquina", "PV", "Observação", "Ações"]

interface JobRowProps {
  j: Job
  posAtiva: number
  ativosLength: number
  isProcesso: boolean
  maq: Machine
  fator: number
  roteiros: Roteiro[]
  maquinas: Machine[]
  prioridadesPV: string[]
  emCiclo: boolean
  bloqueado: boolean
  aguardandoRoteiro: boolean
  editavel: boolean
  dragIdRef: React.MutableRefObject<string | null>
  onMoveJobToPosition: (machineId: string, jobId: string, targetJobId: string) => void
  onUpdateJobStatus: (machineId: string, jobId: string, status: string) => void
  onRemoveJob: (machineId: string, jobId: string) => void
}

const JobRow = memo(function JobRow({
  j, posAtiva, ativosLength, isProcesso, maq, fator, roteiros, maquinas, prioridadesPV, emCiclo, bloqueado, aguardandoRoteiro,
  editavel, dragIdRef, onMoveJobToPosition, onUpdateJobStatus, onRemoveJob
}: JobRowProps) {
  const finalizado = isJobFinalizado(j)
  const prioridade = finalizado ? "Oculto" : (isProcesso ? `${j.roteiroEtapa || "—"}/${roteiros.find(r => r.id === j.roteiroId)?.etapas.length || "—"}` : `#${posAtiva + 1}`)
  const statusClasse = classeStatusTrabalho(j.status)
  const arrastavel = editavel && !finalizado && ativosLength > 1 && !isProcesso

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (isJobFinalizado(j)) { e.preventDefault(); return }
    dragIdRef.current = j.id
    ;(e.target as HTMLElement).closest("tr")?.classList.add("dragging")
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", j.id)
  }, [j, dragIdRef])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!dragIdRef.current || j.id === dragIdRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    document.querySelectorAll("tr.drag-over").forEach(el => el.classList.remove("drag-over"))
    ;(e.target as HTMLElement).closest("tr")?.classList.add("drag-over")
  }, [j.id, dragIdRef])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    document.querySelectorAll("tr.drag-over").forEach(el => el.classList.remove("drag-over"))
    if (dragIdRef.current && dragIdRef.current !== j.id) {
      onMoveJobToPosition(maq.id, dragIdRef.current, j.id)
    }
    dragIdRef.current = null
  }, [j.id, maq.id, dragIdRef, onMoveJobToPosition])

  const handleDragEnd = useCallback(() => {
    document.querySelectorAll("tr.dragging, tr.drag-over").forEach(el => el.classList.remove("dragging", "drag-over"))
    dragIdRef.current = null
  }, [dragIdRef])

  const etapaAtual = j.roteiroEtapa || 1
  const roteiroDoJob = roteiros.find(r => r.id === j.roteiroId)
  let maqAnteriorNome: string
  if (etapaAtual > 1 && roteiroDoJob && roteiroDoJob.etapas.length >= etapaAtual) {
    const maqAnteriorId = roteiroDoJob.etapas[etapaAtual - 2].machineId
    const maqAnterior = maquinas.find(m => m.id === maqAnteriorId)
    maqAnteriorNome = maqAnterior ? escapeHTML(maqAnterior.nome) : "—"
  } else {
    maqAnteriorNome = "ALMOX"
  }

  const pvPriority = obterPrioridadePV(j.pv, prioridadesPV)
  const pvClass = pvPriority === Infinity ? "none" : pvPriority < 3 ? "top" : "mid"
  const pvHtml = `<span class="pv-badge-${pvClass}" style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:999px;font-size:10px;font-weight:900;line-height:1;padding:0 5px;margin-right:4px">${pvPriority === Infinity ? "—" : pvPriority + 1}</span>`

  return (
    <tr
      className={`${finalizado ? "row-finalizado" : ""} ${emCiclo ? "bg-red-50 dark:bg-red-950/30" : bloqueado ? "bg-amber-50 dark:bg-amber-950/25" : aguardandoRoteiro ? "bg-slate-50 dark:bg-slate-900/30" : ""}`}
      draggable={arrastavel}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      data-job-id={j.id}
    >
      <td>
        <div className="flex items-center gap-1.5">
          <span className="min-w-[28px] inline-flex justify-center items-center bg-[var(--azul-claro)] dark:bg-[var(--azul-claro)] text-[var(--azul-escuro)] dark:text-[#dbeafe] border border-[#b9dcf9] dark:border-[var(--azul)] rounded-full px-1.5 py-1 font-black text-[11px]">{prioridade}</span>
          {emCiclo && <span className="inline-flex rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-1.5 py-0.5 text-[9px] font-black" title="Conflito entre a prioridade da máquina e o roteiro">Ciclo</span>}
          {bloqueado && <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[9px] font-black" title="Previsão aguardando a correção de um conflito anterior">Bloqueado</span>}
          {aguardandoRoteiro && <span className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 text-[9px] font-black" title="Processo paralelo aguardando a conclusão de uma etapa anterior">Aguardando roteiro</span>}
          {arrastavel && <span className="drag-handle cursor-grab text-[var(--cinza)] text-sm px-0.5 rounded hover:bg-[var(--azul-claro)] dark:hover:bg-[var(--hover)] select-none" data-job-id={j.id}>⠿</span>}
        </div>
      </td>
      <td className="max-w-[160px]">
        <span className="block max-w-[160px] whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer font-black text-[var(--texto)]" title={escapeHTML(j.desc)} onClick={() => navigator.clipboard.writeText(j.desc)}>
          {escapeHTML(j.desc)}
        </span>
      </td>
      <td className="max-w-[110px] min-w-[110px] whitespace-nowrap font-mono text-xs tracking-wide"><span className="font-black text-[var(--texto)]">{escapeHTML(j.np)}</span></td>
      <td className="max-w-[64px] min-w-[64px] whitespace-nowrap"><span className="font-black text-[var(--texto)]">{escapeHTML(j.op || '-')}</span></td>
      <td className="max-w-[60px] min-w-[60px] text-center whitespace-nowrap"><span className="inline-flex items-center justify-center bg-[var(--azul-claro)] text-[var(--azul-escuro)] text-[10px] font-black rounded-full px-1.5 py-0.5">{j.sequencia || 5}</span></td>
      <td className="text-xs">{j.qtd}</td>
      <td className="text-xs">{formatMinutos(j.setup)}</td>
      <td className="text-xs">{formatMinutos(j.usinagem)}</td>
      <td className="text-xs"><strong>{formatMinutos(totalLoteFatorado(j, fator, maq))}</strong> <span className="text-[var(--cinza)]">{formatDiasUteis(totalLoteFatorado(j, fator, maq), maq.turnos || "1")}</span></td>
      <td className="text-xs">{formatDateTime(finalizado ? (j.entradaRealizada || j.entrada) : j.entrada)}</td>
      <td className="text-xs">{formatDateTime(finalizado ? (j.finalizadoEm || j.saida) : j.saida)}</td>
      <td className="max-w-[160px] min-w-[160px] text-center">
        <select
          className={`status-select ${statusClasse} w-full min-w-0 px-2 py-1 rounded-full text-[11px] font-black text-center disabled:opacity-60`}
          value={j.status}
          disabled={!editavel}
          onChange={e => onUpdateJobStatus(maq.id, j.id, e.target.value)}
        >
          {JOB_STATUSES.map(s => (
            <option key={s} value={s}>{escapeHTML(s)}</option>
          ))}
        </select>
      </td>
      <td className="max-w-[130px] min-w-[130px]">
        <span className="block text-[11px] font-black text-[var(--texto)] px-2 py-1">{maqAnteriorNome}</span>
      </td>
      <td className="max-w-[100px] min-w-[100px] whitespace-nowrap overflow-hidden text-ellipsis font-black">
        <span dangerouslySetInnerHTML={{ __html: pvHtml }} />{escapeHTML(truncar(j.pv || "-", 5))}
      </td>
      <td className="max-w-[140px]">
        <span className="block max-w-[140px] whitespace-nowrap overflow-hidden text-ellipsis text-xs" title={escapeHTML(j.observacao || "")} onClick={() => navigator.clipboard.writeText(j.observacao || "")}>
          {escapeHTML(j.observacao || '-')}
        </span>
      </td>
      <td className="actions-col">
        <div className="flex gap-1.5 flex-wrap items-center">
          {editavel && (
            <button
              className="btn-outline btn-small"
              onClick={() => window.dispatchEvent(new CustomEvent("edit-job", { detail: j.id }))}
              title="Editar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </button>
          )}
          {editavel && (
            <button
              className="btn-danger btn-small"
              onClick={() => pedirConfirmacao(`Excluir serviço${(j.np || j.op || j.pv) ? ` (${[j.np, j.op, j.pv].filter(Boolean).join(" · ")})` : ""}?`, () => onRemoveJob(maq.id, j.id))}
              title="Excluir"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  )
})

export function JobsTable() {
  const maquinas = useAppStore(s => s.maquinas)
  const roteiros = useAppStore(s => s.roteiros)
  const atualId = useAppStore(s => s.atualId)
  const mostrarOcultos = useAppStore(s => s.mostrarOcultos)
  const prioridadesPV = useAppStore(s => s.prioridadesPV)
  const trabalhosComCiclo = useAppStore(s => s.trabalhosComCiclo)
  const trabalhosBloqueadosSequenciamento = useAppStore(s => s.trabalhosBloqueadosSequenciamento)
  const trabalhosAguardandoRoteiro = useAppStore(s => s.trabalhosAguardandoRoteiro)
  const fator = useAppStore(s => s.fator)
  const moveJobToPosition = useAppStore(s => s.moveJobToPosition)
  const updateJobStatus = useAppStore(s => s.updateJobStatus)
  const removeJob = useAppStore(s => s.removeJob)
  const usuario = useAppStore(s => s.usuario)
  const editavel = podeEditar(usuario?.nivel)

  const maq = useMemo(() => maquinas.find(m => m.id === atualId) || null, [maquinas, atualId])
  const isProcesso = useMemo(() => maq ? !maquinaUsaFilaPrioridade(maq.nome) : false, [maq])

  const ativos = useMemo(() => maq ? trabalhosAtivos(maq) : [], [maq])
  const ocultos = useMemo(() => maq ? trabalhosOcultos(maq) : [], [maq])
  const jobs = mostrarOcultos ? ocultos : ativos

  const dragIdRef = useRef<string | null>(null)

  const onMoveJobToPosition = useCallback((machineId: string, jobId: string, targetJobId: string) => {
    const bloqueio = moveJobToPosition(machineId, jobId, targetJobId)
    if (bloqueio) alert(bloqueio)
  }, [moveJobToPosition])

  const onUpdateJobStatus = useCallback((machineId: string, jobId: string, status: string) => {
    updateJobStatus(machineId, jobId, status)
  }, [updateJobStatus])

  const onRemoveJob = useCallback((machineId: string, jobId: string) => {
    removeJob(machineId, jobId)
  }, [removeJob])

  if (!maq) {
    return (
      <section className="panel queue-panel bg-[rgba(249,251,255,.94)] dark:bg-[var(--painel)] border border-[var(--linha)] rounded-[var(--raio)] shadow-[var(--sombra)]">
        <div className="text-center py-6 text-[var(--cinza)] text-sm">Crie ou selecione uma máquina para visualizar os trabalhos.</div>
      </section>
    )
  }

  if (maq.trabalhos.length === 0) {
    return (
      <section className="panel queue-panel bg-[rgba(249,251,255,.94)] dark:bg-[var(--painel)] border border-[var(--linha)] rounded-[var(--raio)] shadow-[var(--sombra)]">
        <div className="table-wrap">
          <table className="w-full border-collapse min-w-[1300px]">
            <thead>
              <tr>
                {JOB_ROW_EMPTY.map(h => (
                  <th key={h} className="table-header text-left px-1.5 py-1 text-[11px] whitespace-nowrap first:rounded-tl-[17px] last:rounded-tr-[17px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={16} className="text-center py-4 text-[var(--cinza)] text-xs">Ainda não há trabalhos nesta máquina. Clique em &quot;Novo serviço&quot;.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  if (jobs.length === 0) {
    return (
      <section className="panel queue-panel bg-[rgba(249,251,255,.94)] dark:bg-[var(--painel)] border border-[var(--linha)] rounded-[var(--raio)] shadow-[var(--sombra)]">
        <div className="table-wrap">
          <table className="w-full border-collapse min-w-[1300px]">
            <thead>
              <tr>
                {JOB_ROW_EMPTY.map(h => (
                  <th key={h} className="table-header text-left px-1.5 py-1 text-[11px] whitespace-nowrap first:rounded-tl-[17px] last:rounded-tr-[17px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={16} className="text-center py-4 text-[var(--cinza)] text-xs">
                {mostrarOcultos ? "Não há serviços finalizados/ocultos nesta máquina." : "Nenhum serviço ativo nesta máquina."}
              </td></tr>
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  const displayJobs = isProcesso
    ? [...jobs].sort((a, b) => {
        if (a.roteiroId !== b.roteiroId) return (a.roteiroId || "").localeCompare(b.roteiroId || "")
        return (a.roteiroEtapa || 0) - (b.roteiroEtapa || 0)
      })
    : jobs

  const tableHeaders = isProcesso
    ? ["Etapa", "Descrição", "NP", "OP", "Seq. op.", "Qtd.", "Setup lote", "Usinagem/item", "Total lote", "Entrada", "Saída", "Status", "Máquina", "PV", "Observação", "Ações"]
    : ["Prioridade", "Descrição", "NP", "OP", "Seq. op.", "Qtd.", "Setup lote", "Usinagem/item", "Total lote", "Entrada", "Saída", "Status", "Máquina", "PV", "Observação", "Ações"]

  return (
    <section className="panel queue-panel p-2 pl-3 bg-[rgba(249,251,255,.94)] dark:bg-[var(--painel)] border border-[var(--linha)] rounded-[var(--raio)] shadow-[var(--sombra)]">
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center mb-1.5">
        <div>
          <h2 className="section-title m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm font-bold">{isProcesso ? "Serviços" : "Fila de prioridade"}</h2>
          <p className="text-[var(--cinza)] text-[11px] m-0 leading-tight">
            {isProcesso
              ? "Ordem definida pelo roteiro de cada peça. Não é possível reordenar manualmente."
              : "Arraste os serviços pela alça ⠿ para reordenar. Use \"Priorizar PV\" no menu ⚙️ para reordenar automaticamente por prioridade de PV."}
          </p>
        </div>
      </div>
      <div className="table-wrap w-full overflow-auto border border-[var(--linha)] rounded-[18px] bg-white dark:bg-[var(--painel)]">
        <table className="w-full border-collapse min-w-[1300px]">
          <thead>
            <tr>
              {tableHeaders.map(h => (
                <th key={h} className="table-header text-left px-1.5 py-1 text-[11px] whitespace-nowrap first:rounded-tl-[17px] last:rounded-tr-[17px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayJobs.map(j => {
              const posAtiva = ativos.findIndex(t => t.id === j.id)
              return (
                <JobRow
                  key={j.id}
                  j={j}
                  posAtiva={posAtiva}
                  ativosLength={ativos.length}
                  isProcesso={isProcesso}
                  maq={maq}
                  fator={fator}
                  roteiros={roteiros}
                  maquinas={maquinas}
                  prioridadesPV={prioridadesPV}
                  emCiclo={trabalhosComCiclo.has(j.id)}
                  bloqueado={trabalhosBloqueadosSequenciamento.has(j.id)}
                  aguardandoRoteiro={trabalhosAguardandoRoteiro.has(j.id)}
                  editavel={editavel}
                  dragIdRef={dragIdRef}
                  onMoveJobToPosition={onMoveJobToPosition}
                  onUpdateJobStatus={onUpdateJobStatus}
                  onRemoveJob={onRemoveJob}
                />
              )
            })}
          </tbody>
        </table>
      </div>
      <input id="importFile" type="file" accept=".json" className="hidden" />
    </section>
  )
}
