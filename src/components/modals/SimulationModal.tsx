"use client"

import { useState, useEffect } from "react"
import { useAppStore } from "@/store/useAppStore"
import { formatDateTime, formatMinutos, escapeHTML } from "@/lib/formats"
import type { SimulacaoEtapa } from "@/store/types"

type SimulacaoModalDetail = {
  type?: string
  roteiroId?: string
}

export function SimulationModal() {
  const [open, setOpen] = useState(false)
  const [roteiroId, setRoteiroId] = useState("")
  const [entradaInput, setEntradaInput] = useState("")
  const [prioridade, setPrioridade] = useState(false)
  const [resultado, setResultado] = useState<SimulacaoEtapa[] | null>(null)
  const simularPlanejada = useAppStore(s => s.simularPlanejada)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SimulacaoModalDetail>).detail
      if (detail?.type === "simular" && typeof detail.roteiroId === "string") {
        setRoteiroId(detail.roteiroId)
        const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        setEntradaInput(local.toISOString().slice(0, 16))
        setResultado(null)
        setOpen(true)
      }
    }
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("open-modal", handler)
    window.addEventListener("simular-planejada", handler)
    window.addEventListener("keydown", escHandler)
    return () => {
      window.removeEventListener("open-modal", handler)
      window.removeEventListener("simular-planejada", handler)
      window.removeEventListener("keydown", escHandler)
    }
  }, [])

  if (!open) return null

  const handleCalcular = () => {
    if (!entradaInput) {
      alert("Informe a data de entrada.")
      return
    }
    const res = simularPlanejada(roteiroId, entradaInput, prioridade)
    setResultado(res)
  }

  const ultimo = resultado?.[resultado.length - 1]
  const primeiro = resultado?.[0]
  const totalMin = resultado?.reduce((s, r) => s + (r.totalLote || 0), 0) || 0

  return (
    <div className="fixed inset-0 bg-[rgba(7,31,56,.48)] flex items-center justify-center p-4 z-[100]" onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="max-w-[560px] w-full max-h-[92vh] overflow-auto bg-white dark:bg-[var(--painel)] rounded-3xl shadow-[0_28px_80px_rgba(0,0,0,.26)] border border-[rgba(216,231,245,.8)] dark:border-[var(--linha)]">
        <div className="sticky top-0 z-[2] bg-white dark:bg-[var(--painel)] flex items-start justify-between gap-2.5 px-3.5 py-3 border-b border-[var(--linha)]">
          <div>
            <h2 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-lg leading-tight">Simular OP planejada</h2>
            <p className="text-[var(--cinza)] text-[11px] m-0 mt-1">Calcule as datas de entrada e saída considerando a carga atual das máquinas.</p>
          </div>
          <button className="btn-outline btn-small" onClick={() => setOpen(false)}>Fechar</button>
        </div>
        <div className="px-3.5 py-3">
          <div className="mb-3">
            <label className="text-[var(--cinza)] text-xs font-black">Data de entrada na fábrica</label>
            <input
              type="datetime-local"
              className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none"
              value={entradaInput}
              onChange={e => setEntradaInput(e.target.value)}
            />
          </div>
          <div className="mb-3 flex items-center gap-2.5">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={prioridade} onChange={e => setPrioridade(e.target.checked)} />
              <div className="w-9 h-5 bg-gray-200 dark:bg-[var(--hover)] rounded-full peer peer-checked:bg-[var(--azul)] after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
            <span className="text-[var(--cinza)] text-xs font-black">Prioridade máxima</span>
            <span className="text-[10px] text-[var(--cinza)] opacity-60">(abaixo apenas de EM OPERAÇÃO)</span>
          </div>
          {resultado === null ? (
            <p className="text-[var(--cinza)] text-xs">Preencha a data de entrada e clique em &quot;Calcular&quot; para simular as datas de saída em cada máquina do roteiro.</p>
          ) : resultado.length === 0 ? (
            <p className="text-[var(--vermelho)] text-xs">Simulação bloqueada por conflito de fila/roteiro ou dados inválidos.</p>
          ) : (
            <div className="border border-[var(--linha)] rounded-xl overflow-hidden mt-2">
              <table className="w-full border-collapse min-w-0">
                <thead>
                  <tr>
                    <th className="table-header px-2 py-1.5 text-[11px] text-left">Máquina</th>
                    <th className="table-header px-2 py-1.5 text-[11px] text-left">Setup</th>
                    <th className="table-header px-2 py-1.5 text-[11px] text-left">Usinagem</th>
                    <th className="table-header px-2 py-1.5 text-[11px] text-left">Total</th>
                    <th className="table-header px-2 py-1.5 text-[11px] text-left">Entrada</th>
                    <th className="table-header px-2 py-1.5 text-[11px] text-left">Saída</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5 text-xs font-black border-b border-[var(--linha)] bg-white dark:bg-[var(--branco)]">{escapeHTML(r.maquinaNome)}</td>
                      <td className="px-2 py-1.5 text-xs border-b border-[var(--linha)] bg-white dark:bg-[var(--branco)]">{formatMinutos(r.setup)}</td>
                      <td className="px-2 py-1.5 text-xs border-b border-[var(--linha)] bg-white dark:bg-[var(--branco)]">{formatMinutos(r.usinagem)}</td>
                      <td className="px-2 py-1.5 text-xs border-b border-[var(--linha)] bg-white dark:bg-[var(--branco)]">{formatMinutos(r.totalLote)}</td>
                      <td className="px-2 py-1.5 text-xs border-b border-[var(--linha)] bg-white dark:bg-[var(--branco)]">{formatDateTime(r.entrada)}</td>
                      <td className="px-2 py-1.5 text-xs border-b border-[var(--linha)] bg-white dark:bg-[var(--branco)]">{formatDateTime(r.saida)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-2.5 bg-[var(--azul-claro)] dark:bg-[#0c1f33] border-t border-[#b9dcf9] dark:border-[#1a4a64] text-center">
                <strong className="text-sm text-[var(--azul-escuro)] dark:text-[var(--azul)]">Saída final: {formatDateTime(ultimo?.saida || "")}</strong>
                <br />
                <span className="text-xs text-[var(--cinza)]">Lead time total: {totalMin} min · Início: {formatDateTime(primeiro?.entrada || "")}</span>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2.5 mt-4 flex-wrap">
            <button className="btn-outline" onClick={() => setOpen(false)}>Fechar</button>
            <button className="btn-primary" onClick={handleCalcular}>Calcular</button>
          </div>
        </div>
      </div>
    </div>
  )
}
