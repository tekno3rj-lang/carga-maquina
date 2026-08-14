"use client"

import { memo, useEffect, useMemo, useCallback } from "react"
import { useAppStore } from "@/store/useAppStore"
import { trabalhosAtivos, trabalhosOcultos, trabalhosPlanejados, classeStatusMaquina, detectarProcessoPadrao } from "@/lib/scheduling"
import { formatMinutos, escapeHTML } from "@/lib/formats"
import type { Job, Machine } from "@/store/types"

function isProcessType(name: string): boolean {
  return detectarProcessoPadrao(name) !== null || /servi[çc]o/i.test(name) || /externo/i.test(name)
}

const totalLoteCard = (ativos: Job[]) => ativos.reduce((s, j) => s + Number(j.setup || 0) + Number(j.usinagem || 0) * Number(j.qtd || 0), 0)

interface MachineCardProps {
  m: Machine
  isActive: boolean
  onSelect: (id: string) => void
}

const MachineCard = memo(function MachineCard({ m, isActive, onSelect }: MachineCardProps) {
  const ativos = trabalhosAtivos(m)
  const ocultos = trabalhosOcultos(m)
  const planejados = trabalhosPlanejados(m)
  const total = totalLoteCard(ativos)
  const statusClasse = classeStatusMaquina(m.statusMaquina).replace("machine-", "")

  const handleClick = useCallback(() => onSelect(m.id), [m.id, onSelect])

  return (
    <div
      className={`grid gap-0.5 items-center p-1.5 rounded-lg border cursor-pointer transition-all
        ${isActive
          ? "bg-[var(--azul-claro)] dark:bg-[var(--azul-claro)] dark:border-[var(--azul)] shadow-[0_8px_20px_rgba(11,99,182,.1)]"
          : "bg-[#edf5fc] dark:bg-[var(--branco)] border-[var(--linha)] hover:border-[#89c5f4]"
        }`}
      onClick={handleClick}
    >
      <span className="font-black text-[10px] break-words dark:text-[var(--texto)]">{escapeHTML(m.nome)}</span>
      <span className="flex items-center gap-0.5 flex-wrap text-[10px] text-[var(--texto)]">
        <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-black leading-tight whitespace-nowrap badge-machine-${statusClasse}`}>
          {escapeHTML(m.statusMaquina)}
        </span>
        <span>{ativos.length} visíveis</span>
        <span>{ocultos.length} ocultos</span>
        <span>{planejados.length} planejadas</span>
        <span>{formatMinutos(total)}</span>
      </span>
    </div>
  )
})

interface ProcessCardProps {
  m: Machine
  isActive: boolean
  onSelect: (id: string) => void
}

const ProcessCard = memo(function ProcessCard({ m, isActive, onSelect }: ProcessCardProps) {
  const count = trabalhosAtivos(m).length + trabalhosOcultos(m).length + trabalhosPlanejados(m).length
  const statusClasse = classeStatusMaquina(m.statusMaquina).replace("machine-", "")

  const handleClick = useCallback(() => onSelect(m.id), [m.id, onSelect])

  return (
    <div
      className={`grid gap-0.5 items-center p-1.5 rounded-lg border cursor-pointer transition-all
        ${isActive
          ? "bg-[var(--azul-claro)] dark:bg-[var(--azul-claro)] dark:border-[var(--azul)]"
          : "bg-[#f5f9fc] dark:bg-[var(--hover)] border-[var(--linha)] hover:border-[#89c5f4]"
        }`}
      onClick={handleClick}
    >
      <span className="font-black text-[10px] break-words dark:text-[var(--texto)]">{escapeHTML(m.nome)}</span>
      <span className="flex items-center gap-0.5 flex-wrap text-[9px] text-[var(--texto)]">
        <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-black leading-tight whitespace-nowrap badge-machine-${statusClasse}`}>
          {escapeHTML(m.statusMaquina)}
        </span>
        <span>{count} serviço{(count || 1) > 1 ? "s" : ""}</span>
        <span>Tempo padrão</span>
      </span>
    </div>
  )
})

export function MachineSidebar() {
  const maquinas = useAppStore(s => s.maquinas)
  const atualId = useAppStore(s => s.atualId)
  const selectMachine = useAppStore(s => s.selectMachine)

  const sorted = useMemo(() =>
    [...maquinas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true })),
    [maquinas]
  )
  const normais = useMemo(() => sorted.filter(m => !isProcessType(m.nome)), [sorted])
  const processos = useMemo(() => sorted.filter(m => isProcessType(m.nome)), [sorted])

  useEffect(() => {
    if (atualId && sorted.length > 0 && !sorted.some(m => m.id === atualId)) {
      selectMachine(normais.length > 0 ? normais[0].id : sorted[0].id)
    }
  }, [atualId, normais, sorted, selectMachine])

  const onSelect = useCallback((id: string) => selectMachine(id), [selectMachine])

  if (maquinas.length === 0) {
    return (
      <aside className="panel p-2 h-fit sticky top-[90px] flex flex-col gap-1.5 bg-[rgba(249,251,255,.94)] dark:bg-[var(--painel)] border border-[var(--linha)] rounded-[var(--raio)] shadow-[var(--sombra)]">
        <h2 className="section-title">Máquinas</h2>
        <div className="text-[var(--cinza)] text-xs text-center py-4">Nenhuma máquina cadastrada.</div>
      </aside>
    )
  }

  return (
    <aside className="panel p-2 h-fit sticky top-[90px] flex flex-col gap-1.5 bg-[rgba(249,251,255,.94)] dark:bg-[var(--painel)] border border-[var(--linha)] rounded-[var(--raio)] shadow-[var(--sombra)]">
      <h2 className="section-title m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm font-bold">Máquinas</h2>
      <div className="flex flex-col gap-0.5 max-h-[calc(100vh-170px)] overflow-auto pr-0.5">
        {normais.map(m => (
          <MachineCard key={m.id} m={m} isActive={m.id === atualId} onSelect={onSelect} />
        ))}
      </div>
      {processos.length > 0 && (
        <>
          <h3 className="section-title m-0 mt-2 text-[var(--cinza)] dark:text-[var(--cinza)] text-[11px] font-bold uppercase tracking-wide">Processos</h3>
          <div className="flex flex-col gap-0.5">
            {processos.map(m => (
              <ProcessCard key={m.id} m={m} isActive={m.id === atualId} onSelect={onSelect} />
            ))}
          </div>
        </>
      )}
    </aside>
  )
}

interface MachineTabProps {
  m: Machine
  isActive: boolean
  onSelect: (id: string) => void
}

const MachineTab = memo(function MachineTab({ m, isActive, onSelect }: MachineTabProps) {
  const statusClass = (sm: string) => {
    const s = String(sm || "").toUpperCase()
    if (s.includes("S/OPERADOR")) return "sem-operador"
    if (s.includes("DESATIVADO")) return "desativado"
    if (s.includes("MANUTENÇÃO")) return "manutencao"
    return "op"
  }

  const sc = statusClass(m.statusMaquina)
  const handleClick = useCallback(() => onSelect(m.id), [m.id, onSelect])

  return (
    <button
      className={`whitespace-nowrap text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all flex-shrink-0
        ${isActive ? `btn-machine-${sc}-active` : `btn-machine-${sc}`}`}
      onClick={handleClick}
    >
      {m.nome}
    </button>
  )
})

export function MobileMachineTabs() {
  const maquinas = useAppStore(s => s.maquinas)
  const atualId = useAppStore(s => s.atualId)
  const selectMachine = useAppStore(s => s.selectMachine)

  const sorted = useMemo(() =>
    [...maquinas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true })),
    [maquinas]
  )

  const onSelect = useCallback((id: string) => selectMachine(id), [selectMachine])

  if (maquinas.length === 0) return null

  return (
    <div className="flex gap-1.5 overflow-auto pb-0.5">
      {sorted.map(m => (
        <MachineTab key={m.id} m={m} isActive={m.id === atualId} onSelect={onSelect} />
      ))}
    </div>
  )
}
