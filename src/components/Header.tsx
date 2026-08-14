"use client"

import { useState, useEffect, useRef } from "react"
import { useAppStore } from "@/store/useAppStore"
import { THEME_STORAGE_KEY } from "@/lib/constants"
import { escapeHTML } from "@/lib/formats"
import { exportarJSON, importarJSON } from "@/lib/data-migration"
import { supabaseClient, logout } from "@/lib/supabase"
import { podeEditar, podeBackup, podeGerenciarUsuarios } from "@/lib/auth"
import { SearchDropdown } from "./SearchDropdown"

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(THEME_STORAGE_KEY) === "escuro"
  })
  const togglePlanejadasGeral = useAppStore(s => s.togglePlanejadasGeral)
  const mostrandoPlanejadasGeral = useAppStore(s => s.mostrandoPlanejadasGeral)
  const toggleMapeamento = useAppStore(s => s.toggleMapeamento)
  const mostrandoMapeamento = useAppStore(s => s.mostrandoMapeamento)
  const usuario = useAppStore(s => s.usuario)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editavel = podeEditar(usuario?.nivel)
  const backupPermitido = podeBackup(usuario?.nivel)
  const gerenciaUsuarios = podeGerenciarUsuarios(usuario?.nivel)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
  }, [darkMode])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      const container = document.getElementById("settingsContainer")
      if (container && !container.contains(e.target as Node)) setMenuOpen(false)
    }
    setTimeout(() => document.addEventListener("click", handler), 0)
    return () => document.removeEventListener("click", handler)
  }, [menuOpen])

  const toggleDark = () => {
    const next = !darkMode
    setDarkMode(next)
    localStorage.setItem(THEME_STORAGE_KEY, next ? "escuro" : "claro")
    document.documentElement.classList.toggle("dark", next)
  }

  const handleExport = () => {
    const state = useAppStore.getState()
    const json = exportarJSON(state)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "backup-carga-maquina.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const imported = importarJSON(reader.result as string)
      if (imported) {
        useAppStore.setState({
          maquinas: imported.maquinas,
          roteiros: imported.roteiros,
          atualId: imported.atualId,
          fator: imported.fator,
          mostrarOcultos: imported.mostrarOcultos,
          mostrarPlanejadas: imported.mostrarPlanejadas,
          prioridadesPV: imported.prioridadesPV,
          servicosExternosConfig: imported.servicosExternosConfig,
          _configUpdatedAt: imported._configUpdatedAt ?? null,
          historicoUndo: [],
          historicoRedo: [],
        })
        useAppStore.getState()._recalcular()
        window.alert("Backup importado com sucesso.")
      } else {
        window.alert("Não foi possível importar. Verifique se o arquivo é um backup válido.")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  return (
    <header className="w-full bg-gradient-to-r from-[#052b52] via-[#0d5f9f] to-[#052b52] dark:from-[#081020] dark:to-[#12284a] text-white sticky top-0 z-30 shadow-[var(--sombra)] no-print">
      <div className="flex items-center gap-2.5 px-4 py-3 max-lg:flex-col max-lg:items-stretch">
        <img
          className="h-auto w-[120px] shrink-0 ml-8"
          src="https://vpfxyxgsxpespynzrlqj.supabase.co/storage/v1/object/public/imgs/oilequip_logo.webp"
          alt="Oilequip"
        />
        <div className="flex-1 min-w-0 flex items-center gap-2.5 px-4 max-lg:flex-col max-lg:px-0">
          <div className="shrink-0">
            <h1 className="text-[clamp(22px,3vw,32px)] -tracking-[.8px] leading-tight m-0">Carga Máquina</h1>
            <p className="text-[#dceeff] dark:text-[#c7ddff] text-[13px] mt-1">Carga, PV e prioridade de fila</p>
          </div>
          <div className="search-container ml-auto max-lg:ml-0 relative flex items-center gap-2 w-[320px] max-lg:w-full transition-[width] duration-300 ease-out focus-within:w-[560px] max-lg:focus-within:w-full">
            <span className="absolute left-2.5 text-sm opacity-70 pointer-events-none">🔍</span>
            <input
              className="global-search-input w-full pl-[30px] pr-10 py-1.5 rounded-full border border-white/30 bg-white/15 text-white text-sm outline-none placeholder:text-white/60 focus:bg-white/25 focus:border-white/60 transition-[background-color,border-color] duration-200"
              type="text"
              placeholder="Buscar NP, OP, PV, descrição..."
              onKeyDown={e => {
                if (e.key === "/" && document.activeElement !== e.currentTarget) {
                  e.preventDefault()
                  e.currentTarget.focus()
                }
              }}
            />
            <kbd className="absolute right-3 bg-white/20 border border-white/30 rounded-md px-1.5 py-0.5 text-[11px] text-white/70 pointer-events-none">/</kbd>
            <SearchDropdown />
          </div>
          <div className="flex gap-2.5 items-center flex-wrap max-lg:w-full">
            <button
              onClick={() => { togglePlanejadasGeral(); setMenuOpen(false) }}
              className="bg-white/15 text-white border border-white/25 rounded-[9999px] px-3.5 py-1.5 text-xs font-bold tracking-wide backdrop-blur hover:bg-white/25 hover:border-white/50 transition-all whitespace-nowrap"
            >
              {mostrandoPlanejadasGeral ? "Voltar" : "Planejadas"}
            </button>
            <button
              onClick={() => { toggleMapeamento(); setMenuOpen(false) }}
              className="bg-white/15 text-white border border-white/25 rounded-[9999px] px-3.5 py-1.5 text-xs font-bold tracking-wide backdrop-blur hover:bg-white/25 hover:border-white/50 transition-all whitespace-nowrap"
            >
              {mostrandoMapeamento ? "Voltar" : "Mapeamento"}
            </button>
            <div id="settingsContainer" className="relative">
              <button
                id="gearBtn"
                onClick={() => setMenuOpen(!menuOpen)}
                className="bg-transparent text-white text-lg p-1.5 rounded-md opacity-80 hover:opacity-100 hover:bg-white/12 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
              {menuOpen && (
                <div className="absolute top-full right-0 mt-2 bg-white dark:bg-[var(--branco)] border border-[var(--linha)] rounded-2xl shadow-[0_12px_36px_rgba(5,43,82,.2)] p-2.5 min-w-[210px] z-50 flex flex-col gap-1.5">
                  {usuario && (
                    <div className="px-3 py-1.5 mb-0.5 text-[11px] leading-tight">
                      <span className="block font-black text-[var(--texto)] break-all">{escapeHTML(usuario.email)}</span>
                      <span className="block font-bold uppercase tracking-wide text-[var(--azul)]">{escapeHTML(usuario.nivel)}</span>
                    </div>
                  )}
                  <button onClick={() => { toggleDark(); setMenuOpen(false) }} className="w-full text-left btn-outline text-sm font-bold py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition-colors">
                    {darkMode ? "☀️ Modo claro" : "🌙 Modo escuro"}
                  </button>
                  {editavel && (
                    <button onClick={() => { setMenuOpen(false); window.dispatchEvent(new CustomEvent("open-modal", { detail: "machineModal" })) }} className="w-full text-left btn-outline text-sm font-bold py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition-colors">
                      Gerenciar máquinas
                    </button>
                  )}
                  {editavel && (
                    <button onClick={() => { setMenuOpen(false); window.dispatchEvent(new CustomEvent("open-modal", { detail: "pvModal" })) }} className="w-full text-left btn-outline text-sm font-bold py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition-colors">
                      Priorizar PV
                    </button>
                  )}
                  {editavel && (
                    <button onClick={() => { setMenuOpen(false); window.dispatchEvent(new CustomEvent("open-modal", { detail: "servicosExternosModal" })) }} className="w-full text-left btn-outline text-sm font-bold py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition-colors">
                      Serviços externos
                    </button>
                  )}
                  {backupPermitido && (
                    <button onClick={() => { handleExport(); setMenuOpen(false) }} className="w-full text-left btn-outline text-sm font-bold py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition-colors">
                      Exportar backup
                    </button>
                  )}
                  {backupPermitido && (
                    <button onClick={() => { fileInputRef.current?.click(); setMenuOpen(false) }} className="w-full text-left btn-outline text-sm font-bold py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition-colors">
                      Importar backup
                    </button>
                  )}
                  <button onClick={() => { window.print(); setMenuOpen(false) }} className="w-full text-left btn-outline text-sm font-bold py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition-colors">
                    Imprimir
                  </button>
                  {gerenciaUsuarios && (
                    <button onClick={() => { setMenuOpen(false); window.dispatchEvent(new CustomEvent("open-modal", { detail: "usersModal" })) }} className="w-full text-left btn-outline text-sm font-bold py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition-colors">
                      Gerenciar usuários
                    </button>
                  )}
                  {usuario && (
                    <button
                      onClick={() => { setMenuOpen(false); if (supabaseClient) void logout() }}
                      className="w-full text-left btn-danger text-sm font-bold py-2 px-3 rounded-xl transition-colors"
                    >
                      Sair
                    </button>
                  )}
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          </div>
        </div>
      </div>
    </header>
  )
}
