"use client"

import { useState, useEffect } from "react"
import { useAppStore } from "@/store/useAppStore"
import { MACHINE_STATUSES } from "@/lib/constants"
import { escapeHTML } from "@/lib/formats"
import { pedirConfirmacao } from "@/components/modals/ConfirmModal"

type ModalProps = {
  id: string
  children: React.ReactNode
  title: string
  hint?: string
  small?: boolean
}

function Modal({ id, children, title, hint, small }: ModalProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === id) setOpen(true)
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
  }, [id])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-[rgba(7,31,56,.48)] flex items-center justify-center p-4 z-[100]"
      onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div className={`${small ? "max-w-[560px]" : "max-w-[1120px]"} w-full max-h-[92vh] overflow-auto bg-white dark:bg-[var(--painel)] rounded-3xl shadow-[0_28px_80px_rgba(0,0,0,.26)] border border-[rgba(216,231,245,.8)] dark:border-[var(--linha)]`}>
        <div className="sticky top-0 z-[2] bg-white dark:bg-[var(--painel)] flex items-start justify-between gap-2.5 px-3.5 py-3 border-b border-[var(--linha)]">
          <div>
            <h2 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-lg leading-tight">{title}</h2>
            {hint && <p className="text-[var(--cinza)] text-[11px] m-0 mt-1">{hint}</p>}
          </div>
          <button className="btn-outline btn-small" onClick={() => setOpen(false)}>Fechar</button>
        </div>
        <div className="px-3.5 py-3">
          {children}
        </div>
      </div>
    </div>
  )
}

export function MachineModal() {
  const maquinas = useAppStore(s => s.maquinas)
  const atualId = useAppStore(s => s.atualId)
  const addMachine = useAppStore(s => s.addMachine)
  const removeMachine = useAppStore(s => s.removeMachine)
  const selectMachine = useAppStore(s => s.selectMachine)
  const editMachineName = useAppStore(s => s.editMachineName)
  const editMachineStatus = useAppStore(s => s.editMachineStatus)
  const editMachineTurnos = useAppStore(s => s.editMachineTurnos)
  const [nome, setNome] = useState("")
  const [status, setStatus] = useState("EM OPERAÇÃO")
  const [turnos, setTurnos] = useState("1")

  const handleAdd = () => {
    if (!nome.trim()) return
    addMachine(nome.trim(), status, turnos)
    setNome("")
    setStatus("EM OPERAÇÃO")
  }

  return (
    <Modal id="machineModal" title="Gerenciar máquinas" hint="Adicione, edite ou remova máquinas em uma única janela.">
      <div className="grid grid-cols-[minmax(260px,.8fr)_minmax(320px,1.2fr)] gap-4 items-start max-md:grid-cols-1">
        <div className="border border-[var(--linha)] rounded-xl bg-gradient-to-b from-white to-[#f7fbff] dark:from-[#111827] dark:to-[#0f172a] p-2.5 grid gap-2">
          <h3 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm">Adicionar máquina</h3>
          <div>
            <label className="block mb-1.5 text-[var(--cinza)] text-xs font-black">Nome da máquina</label>
            <input
              className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none"
              placeholder="Ex: Torno CNC 01"
              value={nome}
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
            />
          </div>
          <div>
            <label className="block mb-1.5 text-[var(--cinza)] text-xs font-black">Status inicial</label>
            <select
              className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              {MACHINE_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block mb-1.5 text-[var(--cinza)] text-xs font-black">Turnos</label>
            <select
              className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2"
              value={turnos}
              onChange={e => setTurnos(e.target.value)}
            >
              <option value="1">1 turno (06:00–14:00, 7h útil)</option>
              <option value="2">2 turnos (06:00–22:00, 14h útil)</option>
              <option value="3">3 turnos (22:00–06:00, 21h útil)</option>
            </select>
          </div>
          <button className="btn-primary" onClick={handleAdd}>Adicionar máquina</button>
        </div>
        <div className="border border-[var(--linha)] rounded-xl bg-gradient-to-b from-white to-[#f7fbff] dark:from-[#111827] dark:to-[#0f172a] p-2.5">
          <h3 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm mb-2">Máquinas cadastradas</h3>
          <div className="flex flex-col gap-1.5 max-h-[55vh] overflow-auto pr-0.5">
            {maquinas.length === 0 ? (
              <div className="text-center py-4 text-[var(--cinza)] text-xs">Nenhuma máquina cadastrada.</div>
            ) : (
              [...maquinas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true })).map(m => (
                <div key={m.id} className={`grid grid-cols-[1fr_.8fr_.8fr_auto] gap-1.5 items-end border rounded-xl p-2 ${m.id === atualId ? "border-[#89c5f4] bg-[var(--azul-claro)] dark:bg-[var(--azul-claro)]" : "border-[var(--linha)] bg-white dark:bg-[var(--branco)]"}`}>
                  <div>
                    <label className="block mb-1.5 text-[var(--cinza)] text-xs font-black">Nome</label>
                    <input
                      className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-1.5 text-sm"
                      defaultValue={m.nome}
                      onBlur={e => editMachineName(m.id, e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1.5 text-[var(--cinza)] text-xs font-black">Status</label>
                    <select
                      className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-1.5 text-sm"
                      defaultValue={m.statusMaquina}
                      onChange={e => editMachineStatus(m.id, e.target.value)}
                    >
                      {MACHINE_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-[var(--cinza)] text-xs font-black">Turnos</label>
                    <select
                      className="w-full border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-1.5 text-sm"
                      defaultValue={m.turnos}
                      onChange={e => editMachineTurnos(m.id, e.target.value)}
                    >
                      <option value="1">1 turno</option>
                      <option value="2">2 turnos</option>
                      <option value="3">3 turnos</option>
                    </select>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap justify-end">
                    <button className="btn-outline btn-small" onClick={() => { selectMachine(m.id) }}>Abrir</button>
                    <button className="btn-danger btn-small" onClick={() => pedirConfirmacao(`Remover a máquina "${m.nome}" e todos os serviços dela?`, () => removeMachine(m.id))}>Remover</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
