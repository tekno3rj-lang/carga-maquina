import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""

function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

const gerenciarUsuarios = async (req: Request) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ erro: "Método não permitido" }), { status: 405, headers })
  }

  if (!SUPABASE_URL.startsWith("https://") || !SUPABASE_SECRET_KEY) {
    return new Response(JSON.stringify({ erro: "Função não configurada (URL ou chave administrativa do Supabase ausente)" }), { status: 500, headers })
  }

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return new Response(JSON.stringify({ erro: "JSON inválido" }), { status: 400, headers })
  }

  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!token) {
    return new Response(JSON.stringify({ erro: "Não autenticado" }), { status: 401, headers })
  }

  const adminClient = createAdminClient()

  const { data: authData, error: authError } = await adminClient.auth.getUser(token)
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ erro: "Sessão inválida ou expirada" }), { status: 401, headers })
  }

  const perfil = authData.user
  const role = String(perfil.app_metadata?.role || "")

  if (role !== "admin") {
    return new Response(JSON.stringify({ erro: "Apenas administradores podem gerenciar usuários" }), { status: 403, headers })
  }

  const acao = String(corpo.acao || "")

  if (acao === "listar") {
    const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 500 })
    if (error) {
      return new Response(JSON.stringify({ erro: error.message }), { status: 500, headers })
    }
    const usuarios = (data?.users || []).map(u => ({
      id: u.id,
      email: u.email || "",
      role: String(u.app_metadata?.role || "visualizador"),
      criado_em: u.created_at,
      bloqueado: Boolean(u.banned_until),
    }))
    return new Response(JSON.stringify({ usuarios }), { status: 200, headers })
  }

  if (acao === "criar") {
    const email = String(corpo.email || "").trim().toLowerCase()
    const senha = String(corpo.senha || "")
    const nivel = String(corpo.nivel || "editor")
    if (!email || !senha) {
      return new Response(JSON.stringify({ erro: "Informe e-mail e senha inicial" }), { status: 400, headers })
    }
    if (senha.length < 6) {
      return new Response(JSON.stringify({ erro: "A senha deve ter pelo menos 6 caracteres" }), { status: 400, headers })
    }
    if (!["admin", "editor", "visualizador"].includes(nivel)) {
      return new Response(JSON.stringify({ erro: "Nível de acesso inválido" }), { status: 400, headers })
    }
    const { error } = await adminClient.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      app_metadata: { role: nivel },
    })
    if (error) {
      return new Response(JSON.stringify({ erro: error.message }), { status: 500, headers })
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  }

  if (acao === "alterarNivel") {
    const targetUserId = String(corpo.targetUserId || "")
    const nivel = String(corpo.nivel || "")
    if (!targetUserId || !["admin", "editor", "visualizador"].includes(nivel)) {
      return new Response(JSON.stringify({ erro: "Parâmetros inválidos" }), { status: 400, headers })
    }
    if (targetUserId === perfil.id) {
      return new Response(JSON.stringify({ erro: "Você não pode alterar o próprio nível" }), { status: 400, headers })
    }
    const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
      app_metadata: { role: nivel },
    })
    if (error) {
      return new Response(JSON.stringify({ erro: error.message }), { status: 500, headers })
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  }

  if (acao === "bloquear" || acao === "desbloquear") {
    const targetUserId = String(corpo.targetUserId || "")
    if (!targetUserId) {
      return new Response(JSON.stringify({ erro: "Parâmetros inválidos" }), { status: 400, headers })
    }
    if (targetUserId === perfil.id) {
      return new Response(JSON.stringify({ erro: "Você não pode bloquear a si mesmo" }), { status: 400, headers })
    }
    const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: acao === "bloquear" ? "30d" : "none",
    })
    if (error) {
      return new Response(JSON.stringify({ erro: error.message }), { status: 500, headers })
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  }

  return new Response(JSON.stringify({ erro: "Ação desconhecida" }), { status: 400, headers })
}

export default gerenciarUsuarios
