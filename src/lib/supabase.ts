import { createClient } from "@supabase/supabase-js"
import { nivelDeRole, type NivelAcesso } from "@/lib/auth"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

const CONFIGURADO =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("COLE_AQUI") &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes("COLE_AQUI")

export const supabaseClient = CONFIGURADO
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

export interface UsuarioSessao {
  email: string
  nivel: NivelAcesso
}

export async function getSessaoUsuario(): Promise<UsuarioSessao | null> {
  if (!supabaseClient) return null
  const { data, error } = await supabaseClient.auth.getUser()
  if (error || !data.user) return null
  return {
    email: data.user.email || "",
    nivel: nivelDeRole(data.user.app_metadata?.role)
  }
}

export async function login(email: string, senha: string) {
  if (!supabaseClient) return { error: new Error("Supabase não configurado") }
  return supabaseClient.auth.signInWithPassword({ email, password: senha })
}

export async function logout() {
  if (!supabaseClient) return
  return supabaseClient.auth.signOut()
}

export async function obterTokenAtual(): Promise<string | null> {
  if (!supabaseClient) return null
  const { data } = await supabaseClient.auth.getSession()
  return data.session?.access_token || null
}
