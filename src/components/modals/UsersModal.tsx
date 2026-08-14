"use client"

import { useState, useEffect, useCallback } from "react"
import { supabaseClient, obterTokenAtual } from "@/lib/supabase"
import { escapeHTML } from "@/lib/formats"
import { podeGerenciarUsuarios, type NivelAcesso } from "@/lib/auth"
import { useAppStore } from "@/store/useAppStore"

interface UsuarioListado {
  id: string
  email: string
  role: string
  criado_em: string
  bloqueado: boolean
}

const URL_FUNCAO = "/.netlify/functions/gerenciar-usuarios"

async function chamarFuncao(body: unknown): Promise<{ ok: boolean; dados?: unknown; erro?: string }> {
  try {
    const token = await obterTokenAtual()
    const res = await fetch(URL_FUNCAO, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
      body: JSON.stringify(body),
    })
    if (res.status === 404) {
      return { ok: false, erro: "Função Netlify não encontrada. No desenvolvimento, rode com `netlify dev`; em produção, confirme o deploy." }
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, erro: (json as { erro?: string }).erro || `Erro ${res.status}` }
    }
    return { ok: true, dados: json }
  } catch {
    return { ok: false, erro: "Falha de rede ao chamar a função Netlify." }
  }
}

export function UsersModal() {
  const [open, setOpen] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState("")
  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([])
  const [emailNovo, setEmailNovo] = useState("")
  const [senhaNova, setSenhaNova] = useState("")
  const [nivelNovo, setNivelNovo] = useState<NivelAcesso>("editor")
  const [meuId, setMeuId] = useState("")

  const usuario = useAppStore(s => s.usuario)
  const gerencia = podeGerenciarUsuarios(usuario?.nivel)

  const carregarUsuarios = useCallback(async () => {
    setCarregando(true)
    setErro("")
    try {
      const r = await chamarFuncao({ acao: "listar" })
      if (!r.ok) { setErro(r.erro || "Erro ao listar usuários"); return }
      const dados = r.dados as { usuarios: UsuarioListado[] }
      setUsuarios(Array.isArray(dados?.usuarios) ? dados.usuarios : [])
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === "usersModal") {
        setOpen(true)
        setErro("")
        void carregarUsuarios()
        void (async () => {
          if (!supabaseClient) return
          const { data } = await supabaseClient.auth.getUser()
          if (data?.user) setMeuId(data.user.id)
        })()
      }
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
  }, [carregarUsuarios])

  const criarUsuario = async () => {
    const email = emailNovo.trim().toLowerCase()
    if (!email || !senhaNova) { setErro("Informe e-mail e senha inicial."); return }
    if (senhaNova.length < 6) { setErro("A senha deve ter pelo menos 6 caracteres."); return }
    setErro("")
    setCarregando(true)
    try {
      const r = await chamarFuncao({ acao: "criar", email, senha: senhaNova, nivel: nivelNovo })
      if (!r.ok) { setErro(r.erro || "Erro ao criar usuário"); return }
      setEmailNovo("")
      setSenhaNova("")
      await carregarUsuarios()
    } finally {
      setCarregando(false)
    }
  }

  const alterarNivel = async (target: UsuarioListado, nivel: NivelAcesso) => {
    if (target.id === meuId) return
    setErro("")
    setCarregando(true)
    try {
      const r = await chamarFuncao({ acao: "alterarNivel", targetUserId: target.id, nivel })
      if (!r.ok) { setErro(r.erro || "Erro ao alterar nível"); return }
      await carregarUsuarios()
    } finally {
      setCarregando(false)
    }
  }

  const alternarBloqueio = async (target: UsuarioListado) => {
    if (target.id === meuId) return
    setErro("")
    setCarregando(true)
    try {
      const r = await chamarFuncao({ acao: target.bloqueado ? "desbloquear" : "bloquear", targetUserId: target.id })
      if (!r.ok) { setErro(r.erro || "Erro ao alterar bloqueio"); return }
      await carregarUsuarios()
    } finally {
      setCarregando(false)
    }
  }

  if (!open) return null
  if (!gerencia) return null

  return (
    <div className="fixed inset-0 bg-[rgba(7,31,56,.48)] flex items-center justify-center p-4 z-[100]" onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="max-w-[680px] w-full max-h-[92vh] overflow-auto bg-white dark:bg-[var(--painel)] rounded-3xl shadow-[0_28px_80px_rgba(0,0,0,.26)] border border-[rgba(216,231,245,.8)] dark:border-[var(--linha)]">
        <div className="sticky top-0 z-[2] bg-white dark:bg-[var(--painel)] flex items-start justify-between gap-2.5 px-3.5 py-3 border-b border-[var(--linha)]">
          <div>
            <h2 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-lg leading-tight">Gerenciar usuários</h2>
            <p className="text-[var(--cinza)] text-[11px] m-0 mt-1">Crie contas e defina níveis de acesso. A alteração de nível leva até 1 hora para refletir na sessão do usuário.</p>
          </div>
          <button className="btn-outline btn-small" onClick={() => setOpen(false)}>Fechar</button>
        </div>
        <div className="px-3.5 py-3 flex flex-col gap-4">
          <div className="border border-[var(--linha)] rounded-xl bg-gradient-to-b from-white to-[#f7fbff] dark:from-[#111827] dark:to-[#0f172a] p-3.5 flex flex-col gap-3">
            <h3 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm">Criar usuário</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-black text-[var(--texto)]">E-mail</span>
                <input
                  type="email"
                  className="border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none"
                  placeholder="usuario@empresa.com"
                  value={emailNovo}
                  onChange={e => setEmailNovo(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-black text-[var(--texto)]">Senha inicial</span>
                <input
                  type="text"
                  className="border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none"
                  placeholder="Definida pelo administrador"
                  value={senhaNova}
                  onChange={e => setSenhaNova(e.target.value)}
                />
              </label>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <select
                className="border border-[var(--linha)] rounded-lg bg-[var(--branco)] dark:bg-[var(--branco)] text-[var(--texto)] p-2 outline-none text-sm"
                value={nivelNovo}
                onChange={e => setNivelNovo(e.target.value as NivelAcesso)}
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="visualizador">Visualizador</option>
              </select>
              <button className="btn-primary" disabled={carregando} onClick={() => void criarUsuario()}>Criar usuário</button>
              <small className="text-[var(--cinza)] text-[11px]">O usuário recebe login e senha deste e-mail com o nível escolhido.</small>
            </div>
          </div>
          <div className="border border-[var(--linha)] rounded-xl bg-gradient-to-b from-white to-[#f7fbff] dark:from-[#111827] dark:to-[#0f172a] p-3.5 flex flex-col gap-2">
            <h3 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-sm">Usuários ({usuarios.length})</h3>
            {erro && <p className="m-0 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-3 py-2">{erro}</p>}
            {carregando && <small className="text-[var(--cinza)] text-[11px]">Carregando…</small>}
            <div className="flex flex-col gap-1.5 max-h-[36vh] overflow-auto pr-0.5">
              {usuarios.map(u => {
                const souEu = u.id === meuId
                return (
                  <div key={u.id} className="grid grid-cols-[1fr_auto] gap-2 items-center border border-[var(--linha)] rounded-lg bg-white dark:bg-[var(--branco)] p-2 px-2.5">
                    <div className="min-w-0">
                      <strong className="text-sm break-all">{escapeHTML(u.email)}</strong>
                      <span className={`inline-block ml-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${u.role === "admin" ? "bg-[var(--azul)] text-white" : u.role === "editor" ? "bg-[var(--azul-claro)] text-[var(--azul-escuro)]" : "bg-gray-200 text-gray-600"}`}>{escapeHTML(u.role)}</span>
                      {u.bloqueado && <span className="inline-block ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide bg-red-100 text-red-700">Bloqueado</span>}
                      {souEu && <span className="inline-block ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide bg-slate-200 text-slate-600">Você</span>}
                    </div>
                    <div className="flex gap-1.5">
                      <select
                        className="text-xs border border-[var(--linha)] rounded-lg px-1.5 py-1 bg-white dark:bg-[var(--hover)] text-[var(--texto)] disabled:opacity-50"
                        value={u.role}
                        disabled={souEu}
                        onChange={e => void alterarNivel(u, e.target.value as NivelAcesso)}
                        title={souEu ? "Você não pode alterar o próprio nível" : "Alterar nível de acesso"}
                      >
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="visualizador">Visualizador</option>
                      </select>
                      <button
                        className={`btn-small ${u.bloqueado ? "btn-primary" : "btn-danger"}`}
                        disabled={souEu}
                        onClick={() => void alternarBloqueio(u)}
                        title={souEu ? "Você não pode bloquear a si mesmo" : u.bloqueado ? "Desbloquear usuário" : "Bloquear usuário (impede login)"}
                      >
                        {u.bloqueado ? "Desbloquear" : "Bloquear"}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}