import { STORAGE_KEY } from "@/lib/constants"
import { useAppStore } from "@/store/useAppStore"

export type NivelAcesso = "admin" | "editor" | "visualizador"

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000
const SESSION_START_KEY = `${STORAGE_KEY}_sessao_inicio`

export function nivelDeRole(role: unknown): NivelAcesso {
  if (role === "admin") return "admin"
  if (role === "editor") return "editor"
  return "visualizador"
}

export function decodificarJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1]
    if (!payload) return null
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const json = decodeURIComponent(
      Array.from(atob(b64), c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function marcarInicioSessao() {
  try {
    localStorage.setItem(SESSION_START_KEY, String(Date.now()))
  } catch {
    // armazenamento indisponível
  }
}

export function sessaoExpirada(): boolean {
  try {
    const valor = localStorage.getItem(SESSION_START_KEY)
    if (!valor) return true
    return Date.now() - Number(valor) > SESSION_DURATION_MS
  } catch {
    return false
  }
}

export function podeEditar(nivel: NivelAcesso | null | undefined): boolean {
  return nivel == null || nivel === "admin" || nivel === "editor"
}

export function podeGerenciarUsuarios(nivel: NivelAcesso | null | undefined): boolean {
  return nivel === "admin"
}

export function podeBackup(nivel: NivelAcesso | null | undefined): boolean {
  return nivel == null || nivel === "admin"
}

const MODAIS_EDITAVEIS = new Set(["jobModal", "machineModal", "pvModal", "servicosExternosModal"])

export function canOpenEdicaoModal(nomeModal: string): boolean {
  return !MODAIS_EDITAVEIS.has(nomeModal) || podeEditar(useAppStore.getState().usuario?.nivel)
}
