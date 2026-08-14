"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useAppStore } from "@/store/useAppStore"
import { supabaseClient, getSessaoUsuario } from "@/lib/supabase"
import { loadFromSupabase, subscribeStoreChanges, subscribeRealtime } from "@/lib/sync"
import { AuthScreen } from "@/components/AuthScreen"
import { marcarInicioSessao, sessaoExpirada } from "@/lib/auth"

function isCampoEditavel(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toUpperCase()
  return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

type BootState = "carregando" | "semSessao" | "pronto"

export function AppProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<BootState>("carregando")
  const unsubChangesRef = useRef<(() => void) | null>(null)
  const unsubRealtimeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let ativo = true
    let appInicializada = false

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const ctrlOuMeta = e.ctrlKey || e.metaKey
      if (!ctrlOuMeta || e.altKey || isCampoEditavel(e.target)) return

      if (key === "z") {
        e.preventDefault()
        if (e.shiftKey) {
          useAppStore.getState().redo()
        } else {
          useAppStore.getState().undo()
        }
      } else if (key === "y") {
        e.preventDefault()
        useAppStore.getState().redo()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    const desligarBootstrap = () => {
      unsubChangesRef.current?.()
      unsubRealtimeRef.current?.()
    }

    const bootarApp = async () => {
      if (appInicializada) return
      appInicializada = true
      try {
        await loadFromSupabase()
        unsubChangesRef.current = subscribeStoreChanges()
        unsubRealtimeRef.current = subscribeRealtime()
        useAppStore.getState()._recalcular()
      } catch (erro) {
        appInicializada = false
        throw erro
      }
    }

    const registrarSessao = async (): Promise<boolean> => {
      const sessao = await getSessaoUsuario()
      if (!sessao) return false
      useAppStore.getState().setUsuario(sessao)
      return true
    }

    let pararAuth: (() => void) | null = null

    const init = async () => {
      try {
        if (!useAppStore.persist.hasHydrated()) {
          await useAppStore.persist.rehydrate()
        }

        if (!supabaseClient) {
          await bootarApp()
          if (ativo) setBoot("pronto")
          return
        }
        const client = supabaseClient

        const ativarSessao = async () => {
          try {
            if (!(await registrarSessao())) {
              if (ativo) setBoot("semSessao")
              return
            }
            await bootarApp()
            if (ativo) setBoot("pronto")
          } catch {
            if (ativo) setBoot("semSessao")
          }
        }

        const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
          if (event === "SIGNED_IN") {
            marcarInicioSessao()
            window.setTimeout(() => void ativarSessao(), 0)
          } else if (event === "SIGNED_OUT") {
            useAppStore.getState().clearUsuario()
            if (ativo) setBoot("semSessao")
          } else if ((event === "TOKEN_REFRESHED" || event === "USER_UPDATED") && session) {
            window.setTimeout(() => void registrarSessao(), 0)
          }
        })

        const timer = window.setInterval(() => {
          if (sessaoExpirada()) {
            void client.auth.signOut()
          }
        }, 60_000)

        pararAuth = () => {
          subscription.unsubscribe()
          window.clearInterval(timer)
        }

        const { data: { session }, error } = await client.auth.getSession()
        if (error || !session) {
          if (ativo) setBoot("semSessao")
          return
        }
        if (sessaoExpirada()) {
          await client.auth.signOut()
          if (ativo) setBoot("semSessao")
          return
        }
        await ativarSessao()
      } catch {
        if (ativo) setBoot("semSessao")
      }
    }

    void init()

    return () => {
      ativo = false
      window.removeEventListener("keydown", handleKeyDown)
      desligarBootstrap()
      pararAuth?.()
    }
  }, [])

  if (boot === "semSessao") return <AuthScreen />
  if (boot === "carregando") {
    return (
      <div className="min-h-screen w-full bg-[#f4f8fc] dark:bg-[#081020] flex items-center justify-center">
        <span className="text-sm font-bold text-[var(--cinza)]">Carregando…</span>
      </div>
    )
  }

  return <>{children}</>
}
