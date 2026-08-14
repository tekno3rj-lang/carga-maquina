const { createClient } = require("@supabase/supabase-js")
const fs = require("fs")
const path = require("path")

// Carrega as credenciais do .env.local manualmente
const envPath = path.join(__dirname, "..", ".env.local")
if (!fs.existsSync(envPath)) {
  console.error("Arquivo .env.local não encontrado. Verifique se ele existe na raiz do projeto.")
  process.exit(1)
}

const envContent = fs.readFileSync(envPath, "utf-8")
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const SUPABASE_ANON_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim()

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Não foi possível ler NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY do .env.local")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Procura o arquivo de backup
const backupDir = __dirname
let backupPath = path.join(backupDir, "..", "backup-carga-maquina.json")
if (!fs.existsSync(backupPath)) {
  // Tenta encontrar qualquer arquivo backup*.json na raiz
  const files = fs.readdirSync(path.join(backupDir, ".."))
  const backupFile = files.find(f => f.startsWith("backup") && f.endsWith(".json"))
  if (backupFile) {
    backupPath = path.join(backupDir, "..", backupFile)
  } else {
    console.error("Arquivo de backup não encontrado.")
    console.log("Cole o arquivo backup-carga-maquina.json na raiz do projeto e execute novamente.")
    process.exit(1)
  }
}

console.log(`Lendo backup: ${path.basename(backupPath)}`)

const raw = fs.readFileSync(backupPath, "utf-8")
const data = JSON.parse(raw)

const maquinas = data.maquinas || []
const roteiros = data.roteiros || []
const config = {
  fator: data.fator ?? 4.2,
  mostrarOcultos: data.mostrarOcultos ?? false,
  prioridadesPV: data.prioridadesPV || [],
  servicosExternosConfig: data.servicosExternosConfig || [],
  atualId: data.atualId || null,
}

async function push() {
  console.log(`Encontradas ${maquinas.length} máquinas no backup.`)

  // 1. Limpar tabela de máquinas (evita conflitos de IDs)
  console.log("Limpando tabela maquinas...")
  const { error: delError } = await supabase.from("maquinas").delete().neq("id", "__dummy__")
  if (delError) {
    console.error("Erro ao limpar maquinas:", delError.message)
    process.exit(1)
  }

  // 2. Inserir todas as máquinas
  const timestamp = new Date().toISOString()
  const machineRows = maquinas.map(m => ({
    id: m.id,
    data: (() => {
      const { _updatedAt, ...dados } = m
      return dados
    })(),
    updated_at: timestamp,
  }))

  console.log(`Inserindo ${machineRows.length} máquinas...`)
  const { error: upsertError } = await supabase.from("maquinas").upsert(machineRows, {
    onConflict: "id",
    ignoreDuplicates: false,
  })
  if (upsertError) {
    console.error("Erro ao inserir máquinas:", upsertError.message)
    process.exit(1)
  }

  // 3. Salvar config
  console.log("Salvando configuração...")
  const { error: configError } = await supabase.from("app_config").upsert(
    {
      id: "config",
      data: {
        fator: config.fator,
        mostrarOcultos: config.mostrarOcultos,
        prioridadesPV: config.prioridadesPV,
        servicosExternosConfig: config.servicosExternosConfig,
      },
      updated_at: timestamp,
    },
    { onConflict: "id", ignoreDuplicates: false }
  )
  if (configError) {
    console.error("Erro ao salvar config:", configError.message)
    process.exit(1)
  }

  console.log("")
  console.log("✅ Dados enviados com sucesso para o Supabase!")
  console.log(`   ${maquinas.length} máquinas importadas`)
  console.log("")
  console.log("Agora recarregue o Netlify (F5) — todas as máquinas devem aparecer.")
}

push().catch(err => {
  console.error("Erro inesperado:", err)
  process.exit(1)
})
