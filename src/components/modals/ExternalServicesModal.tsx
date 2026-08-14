"use client"

import { useState, useEffect, useRef } from "react"
import { useAppStore } from "@/store/useAppStore"
import { escapeHTML, uid } from "@/lib/formats"
import { pedirConfirmacao } from "@/components/modals/ConfirmModal"
import { pushLocalToSupabase } from "@/lib/sync"
import type { ExternalService } from "@/store/types"

export function ExternalServicesModal() {
  const [open, setOpen] = useState(false)
  const [fornecedor, setFornecedor] = useState("")
  const [servico, setServico] = useState("")
  const [dias, setDias] = useState("")
  const [importando, setImportando] = useState(false)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const servicosExternosConfig = useAppStore(s => s.servicosExternosConfig)
  const addServicoExterno = useAppStore(s => s.addServicoExterno)
  const removeServicoExterno = useAppStore(s => s.removeServicoExterno)

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === "servicosExternosModal") setOpen(true)
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

  const handleAdd = () => {
    const f = fornecedor.trim()
    const s = servico.trim()
    const d = Number(dias || 0)
    if (!f || !s || d <= 0) {
      alert("Preencha todos os campos.")
      return
    }
    addServicoExterno({ id: uid(), fornecedor: f, servico: s, dias: d })
    setFornecedor("")
    setServico("")
    setDias("")
  }

  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    e.target.value = ""
    if (!arquivo) return

    setImportando(true)
    try {
      const dados = JSON.parse(await arquivo.text()) as { servicosExternosConfig?: unknown }
      if (!Array.isArray(dados.servicosExternosConfig)) {
        throw new Error("O backup não contém uma lista de serviços externos.")
      }

      const importados: ExternalService[] = dados.servicosExternosConfig.map((valor) => {
        if (!valor || typeof valor !== "object") throw new Error("O backup contém um serviço externo inválido.")
        const item = valor as Record<string, unknown>
        const id = typeof item.id === "string" ? item.id.trim() : ""
        const fornecedorImportado = typeof item.fornecedor === "string" ? item.fornecedor.trim() : ""
        const servicoImportado = typeof item.servico === "string" ? item.servico.trim() : ""
        const diasImportados = Number(item.dias)
        if (!id || !fornecedorImportado || !servicoImportado || !Number.isFinite(diasImportados) || diasImportados <= 0) {
          throw new Error("O backup contém um serviço externo inválido.")
        }
        return { id, fornecedor: fornecedorImportado, servico: servicoImportado, dias: diasImportados }
      })

      const mesclados = new Map(servicosExternosConfig.map((item) => [item.id, item]))
      importados.forEach((item) => mesclados.set(item.id, item))
      useAppStore.setState({ servicosExternosConfig: [...mesclados.values()] })
      await pushLocalToSupabase()
      alert(`${importados.length} serviço${importados.length !== 1 ? "s" : ""} externo${importados.length !== 1 ? "s" : ""} restaurado${importados.length !== 1 ? "s" : ""} com sucesso.`)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Não foi possível importar os serviços externos.")
    } finally {
      setImportando(false)
    }
  }

  const fornecedores = [...new Set(servicosExternosConfig.map(s => s.fornecedor))]
  const agrupados: Record<string, typeof servicosExternosConfig> = {}
  servicosExternosConfig.forEach(c => {
    if (!agrupados[c.fornecedor]) agrupados[c.fornecedor] = []
    agrupados[c.fornecedor].push(c)
  })

  return (
    <div className="fixed inset-0 bg-[rgba(7,31,56,.48)] flex items-center justify-center p-4 z-[100]" onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="max-w-[1120px] w-full max-h-[92vh] overflow-auto bg-white dark:bg-[var(--painel)] rounded-3xl shadow-[0_28px_80px_rgba(0,0,0,.26)] border border-[rgba(216,231,245,.8)] dark:border-[var(--linha)]">
        <div className="sticky top-0 z-[2] bg-white dark:bg-[var(--painel)] flex items-start justify-between gap-2.5 px-3.5 py-3 border-b border-[var(--linha)]">
          <div>
            <h2 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-lg leading-tight">Configurar serviços externos</h2>
            <p className="text-[var(--cinza)] text-[11px] m-0 mt-1">Cadastre fornecedores, tipos de serviço e tempos padrão em dias corridos.</p>
          </div>
          <button className="btn-outline btn-small" onClick={() => setOpen(false)}>Fechar</button>
        </div>
        <div className="px-3.5 py-3">
          <div className="grid grid-cols-[minmax(260px,.8fr)_minmax(320px,1.2fr)] gap-4 items-start max-md:grid-cols-1">
            <div className="border border-[var(--linha)] rounded-xl bg-gradient-to-b from-white to-[#f7fbff] dark:from-[#111827] dark:to-[#0f172a] p-2.5 grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm">Adicionar serviço</h3>
                <button className="btn-outline btn-small" disabled={importando} onClick={() => arquivoRef.current?.click()}>
                  {importando ? "Importando…" : "Restaurar backup"}
                </button>
                <input ref={arquivoRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportar} />
              </div>
              <div>
                <label className="text-[var(--cinza)] text-xs font-black">Fornecedor</label>
                <input
                  className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none"
                  placeholder="Ex: Têmpera Center"
                  value={fornecedor}
                  onChange={e => setFornecedor(e.target.value)}
                  list="fornecedoresList"
                  onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
                />
                <datalist id="fornecedoresList">
                  {fornecedores.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>
              <div>
                <label className="text-[var(--cinza)] text-xs font-black">Tipo de serviço</label>
                <input
                  className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none"
                  placeholder="Ex: Têmpera"
                  value={servico}
                  onChange={e => setServico(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
                />
              </div>
              <div>
                <label className="text-[var(--cinza)] text-xs font-black">Tempo padrão (dias corridos)</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none"
                  placeholder="Ex: 5"
                  value={dias}
                  onChange={e => setDias(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
                />
              </div>
              <button className="btn-primary" onClick={handleAdd}>Adicionar</button>
            </div>
            <div className="border border-[var(--linha)] rounded-xl bg-gradient-to-b from-white to-[#f7fbff] dark:from-[#111827] dark:to-[#0f172a] p-2.5">
              <h3 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm mb-2">Serviços cadastrados</h3>
              <div className="flex flex-col gap-1.5 max-h-[55vh] overflow-auto pr-0.5">
                {servicosExternosConfig.length === 0 ? (
                  <div className="text-center py-4 text-[var(--cinza)] text-xs">Nenhum serviço externo configurado.</div>
                ) : (
                  Object.entries(agrupados).map(([forn, servicos]) => (
                    <div key={forn} className="border border-[var(--linha)] rounded-lg p-2.5">
                      <strong className="text-[var(--azul-escuro)] dark:text-[var(--azul)]">{escapeHTML(forn)}</strong>
                      {servicos.map(s => (
                        <div key={s.id} className="flex items-center gap-2 py-1 border-t border-[var(--linha)]">
                          <span className="flex-1 text-sm">{escapeHTML(s.servico)} — <strong>{s.dias} dia{s.dias !== 1 ? 's' : ''}</strong></span>
                          <button className="btn-danger btn-small" onClick={() => pedirConfirmacao("Remover este serviço externo?", () => removeServicoExterno(s.id))}>Remover</button>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
