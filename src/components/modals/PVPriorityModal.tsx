"use client"

import { useState, useEffect } from "react"
import { useAppStore } from "@/store/useAppStore"
import { escapeHTML } from "@/lib/formats"

export function PVPriorityModal() {
  const [open, setOpen] = useState(false)
  const [newPv, setNewPv] = useState("")
  const prioridadesPV = useAppStore(s => s.prioridadesPV)
  const addPvPrioridade = useAppStore(s => s.addPvPrioridade)
  const removePvPrioridade = useAppStore(s => s.removePvPrioridade)
  const movePvNaLista = useAppStore(s => s.movePvNaLista)
  const aplicarPriorizacaoPV = useAppStore(s => s.aplicarPriorizacaoPV)
  const maquinas = useAppStore(s => s.maquinas)

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === "pvModal") setOpen(true)
    }
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("open-modal", handler)
    window.addEventListener("keydown", escHandler)
    return () => {
      window.removeEventListener("open-modal", handler)
      window.removeEventListener("keydown", escHandler)
    }
  }, [])

  if (!open) return null

  const contarTrabalhosPorPV = (pv: string) => {
    let total = 0
    maquinas.forEach(m => {
      (m.trabalhos || []).forEach(j => {
        if (j.pv === pv && String(j.status || "").toUpperCase() !== "FINALIZADO") total++
      })
    })
    return total
  }

  const handleAdd = () => {
    const pv = newPv.trim()
    if (!pv) return
    if (prioridadesPV.includes(pv)) {
      alert("Este PV já está na lista de prioridade.")
      return
    }
    addPvPrioridade(pv)
    setNewPv("")
  }

  return (
    <div className="fixed inset-0 bg-[rgba(7,31,56,.48)] flex items-center justify-center p-4 z-[100]" onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="max-w-[560px] w-full max-h-[92vh] overflow-auto bg-white dark:bg-[var(--painel)] rounded-3xl shadow-[0_28px_80px_rgba(0,0,0,.26)] border border-[rgba(216,231,245,.8)] dark:border-[var(--linha)]">
        <div className="sticky top-0 z-[2] bg-white dark:bg-[var(--painel)] flex items-start justify-between gap-2.5 px-3.5 py-3 border-b border-[var(--linha)]">
          <div>
            <h2 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-lg leading-tight">Priorizar PV</h2>
            <p className="text-[var(--cinza)] text-[11px] m-0 mt-1">Organize os PVs por ordem de prioridade. O primeiro da lista é o mais prioritário.</p>
          </div>
          <button className="btn-outline btn-small" onClick={() => setOpen(false)}>Fechar</button>
        </div>
        <div className="px-3.5 py-3">
          <div className="grid grid-cols-2 gap-4 items-start max-md:grid-cols-1">
            <div className="border border-[var(--linha)] rounded-xl bg-gradient-to-b from-white to-[#f7fbff] dark:from-[#111827] dark:to-[#0f172a] p-3.5 flex flex-col gap-3">
              <h3 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm">Adicionar PV</h3>
              <div>
                <label className="text-[var(--cinza)] text-xs font-black">PV para priorizar</label>
                <input
                  className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none"
                  placeholder="Ex: PV-12345"
                  value={newPv}
                  onChange={e => setNewPv(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
                />
              </div>
              <button className="btn-primary" onClick={handleAdd}>Adicionar</button>
              <button className="btn-primary" onClick={() => { aplicarPriorizacaoPV(); setOpen(false) }}>Aplicar priorização</button>
              <small className="text-[var(--cinza)] text-[11px]">Os PVs não listados ficarão com a menor prioridade.</small>
            </div>
            <div className="border border-[var(--linha)] rounded-xl bg-gradient-to-b from-white to-[#f7fbff] dark:from-[#111827] dark:to-[#0f172a] p-3.5 flex flex-col gap-3">
              <h3 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm">Ordem de prioridade</h3>
              {prioridadesPV.length === 0 ? (
                <small className="text-[var(--cinza)] text-[11px]">Nenhum PV prioritário definido.</small>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-auto pr-0.5">
                  {prioridadesPV.map((pv, idx) => {
                    const count = contarTrabalhosPorPV(pv)
                    return (
                      <div key={pv} className="grid grid-cols-[auto_1fr_auto] gap-1.5 items-center border border-[var(--linha)] rounded-lg bg-white dark:bg-[var(--branco)] p-1.5 px-2 draggable" data-pv={pv}>
                        <span className="drag-handle cursor-grab text-[var(--cinza)] text-base select-none px-0.5">⠿</span>
                        <div>
                          <strong className="text-sm">{escapeHTML(pv)}</strong>
                          <span className="text-xs text-[var(--cinza)] ml-1 font-normal">{count} serviço{count === 1 ? "" : "s"} afetado{count === 1 ? "" : "s"}</span>
                        </div>
                        <button className="btn-danger btn-small" onClick={() => removePvPrioridade(pv)}>Remover</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
