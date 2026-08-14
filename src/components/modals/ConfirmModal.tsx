"use client"

import { useState, useEffect, useCallback } from "react"

type Confirmacao = {
  mensagem: string
  onConfirm: () => void
}

export function pedirConfirmacao(mensagem: string, onConfirm: () => void) {
  window.dispatchEvent(new CustomEvent("open-confirm", { detail: { mensagem, onConfirm } }))
}

export function ConfirmModal() {
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && typeof detail.mensagem === "string" && typeof detail.onConfirm === "function") {
        setConfirmacao(detail)
      }
    }
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmacao(null)
    }
    window.addEventListener("open-confirm", handler)
    window.addEventListener("keydown", escHandler)
    return () => {
      window.removeEventListener("open-confirm", handler)
      window.removeEventListener("keydown", escHandler)
    }
  }, [])

  const handleConfirm = useCallback(() => {
    const acao = confirmacao?.onConfirm
    setConfirmacao(null)
    if (acao) acao()
  }, [confirmacao])

  if (!confirmacao) return null

  return (
    <div
      className="fixed inset-0 bg-[rgba(7,31,56,.48)] flex items-center justify-center p-4 z-[100]"
      onClick={e => { if (e.target === e.currentTarget) setConfirmacao(null) }}
    >
      <div className="max-w-[420px] w-full bg-white dark:bg-[var(--painel)] rounded-3xl shadow-[0_28px_80px_rgba(0,0,0,.26)] border border-[rgba(216,231,245,.8)] dark:border-[var(--linha)] overflow-hidden">
        <div className="sticky top-0 z-[2] bg-white dark:bg-[var(--painel)] flex items-start justify-between gap-2.5 px-3.5 py-3 border-b border-[var(--linha)]">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v13"/><path d="M12 19v1"/><circle cx="12" cy="11" r="9" strokeDasharray="2 3"/></svg>
            </span>
            <h2 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-lg leading-tight">Confirmar exclusão</h2>
          </div>
          <button className="btn-outline btn-small" onClick={() => setConfirmacao(null)}>Fechar</button>
        </div>
        <div className="px-3.5 py-4">
          <p className="m-0 text-[var(--texto)] text-sm leading-relaxed">{confirmacao.mensagem}</p>
          <div className="flex gap-2 justify-end mt-4">
            <button className="btn-outline" onClick={() => setConfirmacao(null)}>Cancelar</button>
            <button className="btn-danger" onClick={handleConfirm}>Excluir</button>
          </div>
        </div>
      </div>
    </div>
  )
}