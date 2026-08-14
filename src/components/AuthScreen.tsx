"use client"

import { useState } from "react"
import { login, getSessaoUsuario } from "@/lib/supabase"
import { useAppStore } from "@/store/useAppStore"
import { marcarInicioSessao } from "@/lib/auth"

export function AuthScreen() {
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [erro, setErro] = useState("")
  const [carregando, setCarregando] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (carregando) return
    setErro("")
    setCarregando(true)
    const { error } = await login(email.trim(), senha)
    if (error) {
      setErro(error.message || "Não foi possível entrar. Verifique e-mail e senha.")
      setCarregando(false)
      return
    }
    marcarInicioSessao()
    const sessao = await getSessaoUsuario()
    if (sessao) useAppStore.getState().setUsuario(sessao)
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#052b52] via-[#0d5f9f] to-[#052b52] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-white dark:bg-[var(--painel)] rounded-3xl shadow-[0_28px_80px_rgba(0,0,0,.3)] border border-[rgba(216,231,245,.8)] dark:border-[var(--linha)] p-6">
        <div className="flex flex-col items-center gap-2 mb-5">
          <img
            className="h-auto w-[140px]"
            src="https://vpfxyxgsxpespynzrlqj.supabase.co/storage/v1/object/public/imgs/oilequip_logo.webp"
            alt="Oilequip"
          />
          <h1 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-xl leading-tight">Carga Máquina</h1>
          <p className="m-0 text-[var(--cinza)] text-xs">Acesso restrito — faça login para continuar</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-black text-[var(--texto)]">E-mail</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[var(--linha)] bg-white dark:bg-[var(--hover)] text-sm text-[var(--texto)] outline-none focus:border-[var(--azul)] transition-colors"
              placeholder="seu@email.com"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-black text-[var(--texto)]">Senha</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[var(--linha)] bg-white dark:bg-[var(--hover)] text-sm text-[var(--texto)] outline-none focus:border-[var(--azul)] transition-colors"
              placeholder="••••••••"
            />
          </label>
          {erro && (
            <p className="m-0 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-3 py-2">
              {erro}
            </p>
          )}
          <button type="submit" disabled={carregando} className="btn-primary w-full justify-center py-2.5 text-sm">
            {carregando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  )
}
