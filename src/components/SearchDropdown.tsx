"use client"

import { useState, useEffect, useCallback, useRef, useDeferredValue } from "react"
import { useAppStore } from "@/store/useAppStore"
import { isJobPlanejado, isJobFinalizado, classeStatusTrabalho } from "@/lib/scheduling"
import { escapeHTML, truncar } from "@/lib/formats"

export function SearchDropdown() {
  const maquinas = useAppStore(s => s.maquinas)
  const selectMachine = useAppStore(s => s.selectMachine)
  const togglePlanejadasGeral = useAppStore(s => s.togglePlanejadasGeral)
  const setMostrandoPlanejadasGeral = useAppStore(s => s.setMostrandoPlanejadasGeral)
  const setMostrarOcultos = useAppStore(s => s.setMostrarOcultos)
  const [termo, setTermo] = useState("")
  const termoDeferred = useDeferredValue(termo)
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // Wire up the global search input from Header
    const handler = (e: Event) => {
      const input = document.querySelector(".global-search-input") as HTMLInputElement
      if (input) {
        inputRef.current = input
        input.addEventListener("input", (ev: Event) => {
          const val = (ev.target as HTMLInputElement).value
          setTermo(val)
          if (timerRef.current) clearTimeout(timerRef.current)
          if (!val || val.trim().length < 2) {
            setOpen(false)
            return
          }
          timerRef.current = setTimeout(() => setOpen(true), 280)
        })
        input.addEventListener("keydown", (ev: KeyboardEvent) => {
          if (ev.key === "Escape") { setOpen(false); input.blur() }
          if (ev.key === "Enter") {
            const val = (ev.target as HTMLInputElement).value
            if (val && val.trim().length >= 2) setOpen(true)
          }
        })
      }
    }
    // Click outside
    const clickOutside = (e: MouseEvent) => {
      const container = document.querySelector(".search-container")
      if (container && !container.contains(e.target as Node)) {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener("click", clickOutside)
    setTimeout(handler, 100)
    return () => {
      document.removeEventListener("click", clickOutside)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const resultados = useCallback(() => {
    if (!termoDeferred || termoDeferred.trim().length < 2) return []
    const termoLower = termoDeferred.toLowerCase()
    const res: { maquina: typeof maquinas[0]; trabalho: typeof maquinas[0]["trabalhos"][0] }[] = []

    maquinas.forEach(maquina => {
      (maquina.trabalhos || []).forEach(trabalho => {
        const campos = [
          trabalho.np || "",
          trabalho.op || "",
          trabalho.pv || "",
          trabalho.desc || "",
          trabalho.observacao || "",
          trabalho.status || "",
          String(trabalho.sequencia || ""),
          String(trabalho.qtd || "")
        ].join(" ").toLowerCase()

        if (campos.includes(termoLower)) {
          res.push({ maquina, trabalho })
        }
      })
    })

    // Deduplicate planned jobs
    const vistos = new Map<string, typeof res[0]>()
    const dedup: typeof res = []
    for (const r of res) {
      if (isJobPlanejado(r.trabalho)) {
        const chave = r.trabalho.roteiroId || r.trabalho.op || r.trabalho.id
        const existente = vistos.get(chave)
        if (!existente || (r.trabalho.roteiroEtapa || 99) < (existente.trabalho.roteiroEtapa || 99)) {
          vistos.set(chave, r)
        }
      } else {
        dedup.push(r)
      }
    }
    for (const r of vistos.values()) dedup.push(r)

    const ordemStatus: Record<string, number> = {
      "EM OPERAÇÃO": 0,
      "FILA MÁQUINA": 1,
      "MAT. EM OUTRA MÁQUINA": 2,
      "FILA - PCP": 3,
      "FINALIZADO": 4
    }
    dedup.sort((a, b) => {
      const pa = ordemStatus[a.trabalho.status] ?? 5
      const pb = ordemStatus[b.trabalho.status] ?? 5
      return pa - pb
    })

    return dedup.slice(0, 50)
  }, [termoDeferred, maquinas])

  const marcarDestaque = (texto: string, busca: string) => {
    if (!texto || !busca) return escapeHTML(texto || "")
    const escaped = escapeHTML(texto)
    const buscaEscaped = busca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(`(${buscaEscaped})`, "gi")
    return escaped.replace(regex, '<span class="bg-yellow-300/60 dark:bg-blue-400/30 rounded px-0.5">$1</span>')
  }

  const navegar = (maquinaId: string, trabalhoId: string) => {
    setOpen(false)
    if (inputRef.current) inputRef.current.value = ""
    setTermo("")

    let isPlanejada = false
    let roteiroId = ""
    let isFinalizado = false
    for (const m of maquinas) {
      const t = m.trabalhos.find(j => j.id === trabalhoId)
      if (t) {
        isPlanejada = isJobPlanejado(t)
        roteiroId = t.roteiroId || t.op || ""
        isFinalizado = isJobFinalizado(t)
        break
      }
    }

    if (isPlanejada && roteiroId) {
      setMostrandoPlanejadasGeral(true)
      setTimeout(() => {
        const row = document.querySelector(`tr[data-roteiro-id="${CSS.escape(roteiroId)}"]`) as HTMLElement
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" })
          row.style.outline = "3px solid var(--azul)"
          row.style.outlineOffset = "-3px"
          setTimeout(() => { row.style.outline = ""; row.style.outlineOffset = "" }, 2200)
        }
      }, 160)
      return
    }

    if (isFinalizado) setMostrarOcultos(true)
    selectMachine(maquinaId)
    setTimeout(() => {
      const row = document.querySelector(`tr[data-job-id="${trabalhoId}"]`) as HTMLElement
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" })
        row.style.outline = "3px solid var(--azul)"
        row.style.outlineOffset = "-3px"
        setTimeout(() => { row.style.outline = ""; row.style.outlineOffset = "" }, 2200)
      }
    }, 120)
  }

  if (!open) return null

  const results = resultados()

  if (results.length === 0) {
    return (
      <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 w-[560px] max-lg:w-[90vw] max-h-[520px] overflow-auto bg-white dark:bg-[var(--branco)] border border-[var(--linha)] rounded-2xl shadow-[0_16px_48px_rgba(5,43,82,.28)]">
        <div className="text-center py-6 text-[var(--cinza)] text-xs">Nenhum resultado para &quot;{escapeHTML(termo)}&quot;</div>
      </div>
    )
  }

  return (
    <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 w-[560px] max-lg:w-[90vw] max-h-[520px] overflow-auto bg-white dark:bg-[var(--branco)] border border-[var(--linha)] rounded-2xl shadow-[0_16px_48px_rgba(5,43,82,.28)] scrollbar-thin">
      <div className="sticky top-0 bg-white dark:bg-[var(--branco)] px-3.5 py-1 text-[11px] font-black text-[var(--cinza)] uppercase tracking-wide border-b border-[var(--linha)]">
        {results.length} resultado{results.length === 1 ? "" : "s"}
      </div>
      {results.map(({ maquina, trabalho }) => {
        const statusClasse = classeStatusTrabalho(trabalho.status)
        const statusLabel = trabalho.status || "FILA MÁQUINA"

        const tituloParts: string[] = []
        if (trabalho.np) tituloParts.push(marcarDestaque(trabalho.np, termo))
        if (trabalho.op) tituloParts.push(marcarDestaque(trabalho.op, termo))
        if (trabalho.pv) tituloParts.push(marcarDestaque(trabalho.pv, termo))
        if (tituloParts.length === 0) tituloParts.push(marcarDestaque(truncar(trabalho.desc || "Sem descrição", 80), termo))

        const metaParts = [
          trabalho.sequencia ? `Seq: ${trabalho.sequencia}` : "",
          maquina.nome,
          `Qtd: ${trabalho.qtd || 0}`,
          trabalho.observacao ? `Obs: ${truncar(trabalho.observacao, 40)}` : ""
        ].filter(Boolean)

        return (
          <div
            key={trabalho.id}
            className="flex items-center gap-2.5 px-4 py-3 cursor-pointer border-b border-[#f0f4f8] dark:border-[var(--linha)] hover:bg-[var(--azul-claro)] dark:hover:bg-[var(--azul-claro)] transition-colors"
            onClick={() => navegar(maquina.id, trabalho.id)}
          >
            <span className={`shrink-0 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-black leading-tight whitespace-nowrap badge-${statusClasse}`}>{statusLabel}</span>
            <div className="flex-1 min-w-0">
              <span className="block font-black text-sm text-[var(--texto)] whitespace-nowrap overflow-hidden text-ellipsis" dangerouslySetInnerHTML={{ __html: tituloParts.join(" · ") }} />
              <span className="block text-[11px] text-[var(--cinza)] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">{metaParts.map(p => escapeHTML(p)).join(" · ")}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
