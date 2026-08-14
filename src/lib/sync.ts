import { supabaseClient } from "./supabase"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { ExternalService, Job, Machine } from "@/store/types"
import { useAppStore } from "@/store/useAppStore"
import { STORAGE_KEY } from "./constants"

export type DbStatusState = {
  status: "connecting" | "connected" | "error"
  error?: string
}

const SERVICOS_CONFIRMADOS_KEY = `${STORAGE_KEY}_servicos_externos_confirmados`
const LOCAL_PENDING_WINDOW_MS = 10000
const MAX_TENTATIVAS_CONFIG = 3

let _dbState: DbStatusState = { status: "connecting" }
const _localUpdateTimestamps = new Map<string, number>()
const _statusListeners = new Set<(state: DbStatusState) => void>()
let _lastSavedMachinesKey = ""
let _lastSavedConfigKey = ""
let _applyingRemoteChange = false
let _pendingLocalSave = false
let _lastLocalChangeAt = 0
let _prevSnapshot = ""
let _prevExternalServicesKey = ""
let _confirmedExternalServices: ExternalService[] = []
let _saveRequested = false
let _savePromise: Promise<void> | null = null
let _retryTimer: ReturnType<typeof setTimeout> | null = null
let _unsubStoreChanges: (() => void) | null = null
let _canalRealtime: RealtimeChannel | null = null

function notifyStatus() {
  _statusListeners.forEach((fn) => fn(_dbState))
}

export function getDbStatus(): DbStatusState {
  return _dbState
}

export function onDbStatusChange(fn: (state: DbStatusState) => void) {
  _statusListeners.add(fn)
  return () => {
    _statusListeners.delete(fn)
  }
}

function servicoValido(valor: unknown): valor is ExternalService {
  if (!valor || typeof valor !== "object") return false
  const servico = valor as ExternalService
  return typeof servico.id === "string" && servico.id.length > 0 &&
    typeof servico.fornecedor === "string" && servico.fornecedor.length > 0 &&
    typeof servico.servico === "string" && servico.servico.length > 0 &&
    typeof servico.dias === "number" && Number.isFinite(servico.dias) && servico.dias > 0
}

function normalizarServicos(valor: unknown): ExternalService[] {
  if (!Array.isArray(valor)) return []
  const unicos = new Map<string, ExternalService>()
  valor.filter(servicoValido).forEach((servico) => unicos.set(servico.id, servico))
  return [...unicos.values()]
}

function lerServicosConfirmados(): ExternalService[] | null {
  if (typeof window === "undefined") return null
  try {
    const valor = localStorage.getItem(SERVICOS_CONFIRMADOS_KEY)
    return valor === null ? null : normalizarServicos(JSON.parse(valor))
  } catch {
    return null
  }
}

function gravarServicosConfirmados(servicos: ExternalService[]) {
  _confirmedExternalServices = structuredClone(servicos)
  if (typeof window !== "undefined") {
    localStorage.setItem(SERVICOS_CONFIRMADOS_KEY, JSON.stringify(servicos))
  }
}

function servicosKey(servicos: ExternalService[]): string {
  return JSON.stringify(servicos)
}

function servicosIguais(a: ExternalService, b: ExternalService): boolean {
  return a.id === b.id && a.fornecedor === b.fornecedor && a.servico === b.servico && a.dias === b.dias
}

function calcularDeltaServicos(atuais: ExternalService[]) {
  const confirmados = new Map(_confirmedExternalServices.map((servico) => [servico.id, servico]))
  const idsAtuais = new Set(atuais.map((servico) => servico.id))
  return {
    adicionados: atuais.filter((servico) => {
      const confirmado = confirmados.get(servico.id)
      return !confirmado || !servicosIguais(servico, confirmado)
    }),
    removidos: new Set(_confirmedExternalServices.filter((servico) => !idsAtuais.has(servico.id)).map((servico) => servico.id)),
  }
}

function aplicarDeltaServicos(remotos: ExternalService[], atuais: ExternalService[]): ExternalService[] {
  const { adicionados, removidos } = calcularDeltaServicos(atuais)
  const resultado = new Map(remotos.filter((servico) => !removidos.has(servico.id)).map((servico) => [servico.id, servico]))
  adicionados.forEach((servico) => resultado.set(servico.id, servico))
  return [...resultado.values()]
}

function onlySemanticKeys(maquinas: Machine[]) {
  return maquinas.map((m) => ({
    ...m,
    _updatedAt: undefined,
    trabalhos: m.trabalhos.map((t) => {
      const rest: Record<string, unknown> = { ...(t as Job) }
      delete rest.entrada
      delete rest.saida
      delete rest.entradaMinimaRoteiro
      return rest
    }),
  }))
}

function getMachinesKey(maquinas: Machine[]): string {
  return JSON.stringify(onlySemanticKeys(maquinas))
}

function getConfigKey(state: {
  fator: number
  mostrarOcultos: boolean
  prioridadesPV: string[]
  servicosExternosConfig: ExternalService[]
}): string {
  return JSON.stringify({
    fator: state.fator,
    mostrarOcultos: state.mostrarOcultos,
    prioridadesPV: state.prioridadesPV,
    servicosExternosConfig: state.servicosExternosConfig,
  })
}

function normalizeForSnapshot() {
  const s = useAppStore.getState()
  return {
    maquinas: onlySemanticKeys(s.maquinas),
    fator: s.fator,
    mostrarOcultos: s.mostrarOcultos,
    prioridadesPV: s.prioridadesPV,
    servicosExternosConfig: s.servicosExternosConfig,
  }
}

function getSnapshot() {
  return JSON.stringify(normalizeForSnapshot())
}

function temDeltaServicos(): boolean {
  const delta = calcularDeltaServicos(useAppStore.getState().servicosExternosConfig)
  return delta.adicionados.length > 0 || delta.removidos.size > 0
}

function markSavedSnapshot() {
  const state = useAppStore.getState()
  _lastSavedMachinesKey = getMachinesKey(state.maquinas)
  _lastSavedConfigKey = getConfigKey(state)
  _prevSnapshot = getSnapshot()
  _prevExternalServicesKey = servicosKey(state.servicosExternosConfig)
}

function applyRemoteChange(fn: () => void) {
  _applyingRemoteChange = true
  try {
    fn()
  } finally {
    _applyingRemoteChange = false
    markSavedSnapshot()
  }
}

function registrarTimestampLocal(timestamp: string, quantidade: number) {
  if (quantidade > 0) _localUpdateTimestamps.set(timestamp, quantidade)
}

export async function loadFromSupabase(): Promise<void> {
  if (!supabaseClient) {
    _dbState = { status: "error", error: "Supabase não configurado" }
    notifyStatus()
    return
  }

  _dbState = { status: "connecting" }
  notifyStatus()

  try {
    const { data: machinesData, error: machinesError } = await supabaseClient
      .from("maquinas")
      .select("*")
      .order("id")

    if (machinesError) throw machinesError

    if (machinesData && machinesData.length > 0) {
      const machines: Machine[] = machinesData.map((r) => r.data)
      useAppStore.getState()._setMaquinas(machines, true)
    }

    const { data: configData, error: configError } = await supabaseClient
      .from("app_config")
      .select("*")
      .eq("id", "config")
      .maybeSingle()

    if (configError) throw configError

    const locais = normalizarServicos(useAppStore.getState().servicosExternosConfig)
    const confirmadosPersistidos = lerServicosConfirmados()
    const cfg = configData?.data || {}
    const remotos = normalizarServicos(cfg.servicosExternosConfig)

    if (confirmadosPersistidos) {
      _confirmedExternalServices = confirmadosPersistidos
    } else {
      _confirmedExternalServices = remotos
    }

    const reconciliados = confirmadosPersistidos ? aplicarDeltaServicos(remotos, locais) : remotos
    gravarServicosConfirmados(remotos)

    if (configData) {
      useAppStore.getState()._setConfig({
        fator: cfg.fator,
        mostrarOcultos: cfg.mostrarOcultos,
        prioridadesPV: Array.isArray(cfg.prioridadesPV) ? cfg.prioridadesPV : [],
        servicosExternosConfig: reconciliados,
        _configUpdatedAt: configData.updated_at,
      })
      }

    markSavedSnapshot()
    _dbState = { status: "connected" }
    notifyStatus()

    if (!configData || temDeltaServicos()) {
      _pendingLocalSave = true
      _lastLocalChangeAt = Date.now()
      await requestSave()
    }
  } catch (err) {
    console.error("Falha ao carregar do Supabase:", err)
    _dbState = {
      status: "error",
      error: err instanceof Error ? err.message : "Erro desconhecido",
    }
    notifyStatus()
  }
}

async function salvarMaquinas(state: ReturnType<typeof useAppStore.getState>, currentKey: string): Promise<void> {
  if (!supabaseClient || currentKey === _lastSavedMachinesKey) return

  const prev = _lastSavedMachinesKey ? JSON.parse(_lastSavedMachinesKey) : []
  const curr = onlySemanticKeys(state.maquinas)
  const toDelete = prev
    .filter((p: Machine) => !curr.some((c) => c.id === p.id))
    .map((p: Machine) => p.id)

  if (toDelete.length > 0) {
    const { error } = await supabaseClient.from("maquinas").delete().in("id", toDelete)
    if (error) throw error
  }

  const changed = curr.filter((c) => {
    const p = prev.find((item: Machine) => item.id === c.id)
    return !p || JSON.stringify(p) !== JSON.stringify(c)
  })

  if (changed.length > 0) {
    const timestamp = new Date().toISOString()
    const machineRows = changed.map((m) => ({
      id: m.id,
      data: m,
      updated_at: timestamp,
    }))
    const { error } = await supabaseClient.from("maquinas").upsert(machineRows, {
      onConflict: "id",
      ignoreDuplicates: false,
    })
    if (error) throw error
    registrarTimestampLocal(timestamp, changed.length)
  }

  _lastSavedMachinesKey = currentKey
}

async function salvarConfig(state: ReturnType<typeof useAppStore.getState>, currentConfigKey: string): Promise<void> {
  if (!supabaseClient || (currentConfigKey === _lastSavedConfigKey && !temDeltaServicos())) return

  const servicosLocais = structuredClone(state.servicosExternosConfig)

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS_CONFIG; tentativa += 1) {
    const { data: atual, error: leituraError } = await supabaseClient
      .from("app_config")
      .select("data,updated_at")
      .eq("id", "config")
      .maybeSingle()

    if (leituraError) throw leituraError

    const configRemota = atual?.data || {}
    const servicosRemotos = normalizarServicos(configRemota.servicosExternosConfig)
    const servicosMesclados = aplicarDeltaServicos(servicosRemotos, servicosLocais)
    const timestamp = new Date().toISOString()
    const data = {
      ...configRemota,
      fator: state.fator,
      mostrarOcultos: state.mostrarOcultos,
      prioridadesPV: state.prioridadesPV,
      servicosExternosConfig: servicosMesclados,
    }

    if (!atual) {
      const { error } = await supabaseClient.from("app_config").insert({ id: "config", data, updated_at: timestamp })
      if (error) {
        if (tentativa < MAX_TENTATIVAS_CONFIG - 1) continue
        throw error
      }
    } else {
      const { data: atualizado, error } = await supabaseClient
        .from("app_config")
        .update({ data, updated_at: timestamp })
        .eq("id", "config")
        .eq("updated_at", atual.updated_at)
        .select("updated_at")
        .maybeSingle()

      if (error) throw error
      if (!atualizado) {
        if (tentativa < MAX_TENTATIVAS_CONFIG - 1) continue
        throw new Error("A configuração foi alterada por outra sessão. Tente novamente.")
      }
    }

    registrarTimestampLocal(timestamp, 1)
    gravarServicosConfirmados(servicosMesclados)

    if (servicosKey(useAppStore.getState().servicosExternosConfig) === servicosKey(servicosLocais)) {
      _applyingRemoteChange = true
      useAppStore.setState({ servicosExternosConfig: servicosMesclados, _configUpdatedAt: timestamp })
      _applyingRemoteChange = false
      _prevSnapshot = getSnapshot()
      _prevExternalServicesKey = servicosKey(servicosMesclados)
    }

    _lastSavedConfigKey = getConfigKey({ ...state, servicosExternosConfig: servicosMesclados })
    return
  }
}

function agendarNovaTentativa() {
  if (_retryTimer || typeof window === "undefined") return
  _retryTimer = setTimeout(() => {
    _retryTimer = null
    void requestSave()
  }, 5000)
}

async function performSave(): Promise<void> {
  if (!supabaseClient) return

  const state = useAppStore.getState()
  const currentKey = getMachinesKey(state.maquinas)
  const currentConfigKey = getConfigKey(state)

  if (currentKey === _lastSavedMachinesKey && currentConfigKey === _lastSavedConfigKey && !temDeltaServicos()) {
    _pendingLocalSave = false
    return
  }

  try {
    await salvarMaquinas(state, currentKey)
    await salvarConfig(state, currentConfigKey)
    _dbState = { status: "connected" }
    _pendingLocalSave = getMachinesKey(useAppStore.getState().maquinas) !== _lastSavedMachinesKey ||
      getConfigKey(useAppStore.getState()) !== _lastSavedConfigKey || temDeltaServicos()
  } catch (err) {
    console.error("Falha ao salvar no Supabase:", err)
    _dbState = {
      status: "error",
      error: err instanceof Error ? err.message : "Erro desconhecido",
    }
    _pendingLocalSave = true
    agendarNovaTentativa()
  }
  notifyStatus()
}

async function requestSave(): Promise<void> {
  _saveRequested = true
  if (_savePromise) return _savePromise

  _savePromise = (async () => {
    while (_saveRequested) {
      _saveRequested = false
      await performSave()
    }
  })().finally(() => {
    _savePromise = null
  })

  return _savePromise
}

function isLocalChange(updatedAt: string | undefined): boolean {
  if (!updatedAt) return false
  const count = _localUpdateTimestamps.get(updatedAt)
  if (count === undefined) return false
  if (count <= 1) {
    _localUpdateTimestamps.delete(updatedAt)
  } else {
    _localUpdateTimestamps.set(updatedAt, count - 1)
  }
  return true
}

function hasPendingLocalSave(): boolean {
  return _pendingLocalSave && (Date.now() - _lastLocalChangeAt < LOCAL_PENDING_WINDOW_MS || temDeltaServicos())
}

export function subscribeStoreChanges(): () => void {
  if (_unsubStoreChanges) return _unsubStoreChanges

  _prevSnapshot = getSnapshot()
  _prevExternalServicesKey = servicosKey(useAppStore.getState().servicosExternosConfig)
  let timer: ReturnType<typeof setTimeout> | null = null

  const handleChange = () => {
    const curr = getSnapshot()
    if (curr === _prevSnapshot) return
    _prevSnapshot = curr

    const externalServicesKey = servicosKey(useAppStore.getState().servicosExternosConfig)
    const servicosAlterados = externalServicesKey !== _prevExternalServicesKey
    _prevExternalServicesKey = externalServicesKey

    if (_applyingRemoteChange) return

    _pendingLocalSave = true
    _lastLocalChangeAt = Date.now()

    if (servicosAlterados) {
      if (timer) clearTimeout(timer)
      void requestSave()
      return
    }

    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void requestSave(), 2000)
  }

  _unsubStoreChanges = () => {
    if (timer) clearTimeout(timer)
    unsubscribeStore()
    _unsubStoreChanges = null
  }

  const unsubscribeStore = useAppStore.subscribe(handleChange)

  return _unsubStoreChanges
}

export function subscribeRealtime(): () => void {
  if (!supabaseClient) return () => {}
  if (_canalRealtime) return _unsubRealtime

  const channel = supabaseClient.channel("maquinas-sync")
  _canalRealtime = channel

  channel
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "maquinas" },
      (payload) => {
        if (isLocalChange((payload.new as { updated_at?: string })?.updated_at)) return
        if (hasPendingLocalSave()) return
        handleMachineChange(payload)
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_config" },
      (payload) => {
        if (isLocalChange((payload.new as { updated_at?: string })?.updated_at)) return
        if (hasPendingLocalSave()) return
        handleConfigChange(payload)
      }
    )
    .subscribe()

  return _unsubRealtime
}

function _unsubRealtime() {
  if (_canalRealtime) {
    _canalRealtime.unsubscribe()
    _canalRealtime = null
  }
}

function handleMachineChange(valor: unknown) {
  if (!valor || typeof valor !== "object") return
  const payload = valor as {
    eventType?: string
    old?: { id?: string }
    new?: { data?: unknown }
  }
  const store = useAppStore.getState()

  if (payload.eventType === "DELETE") {
    const id = payload.old?.id
    if (!id) return
    applyRemoteChange(() => {
      store._setMaquinas(store.maquinas.filter((m) => m.id !== id), true)
      useAppStore.getState()._recalcular()
    })
  } else {
    const machine = payload.new?.data as Machine | undefined
    if (!machine?.id) return
    const exists = store.maquinas.some((m) => m.id === machine.id)
    applyRemoteChange(() => {
      store._setMaquinas(
        exists
          ? store.maquinas.map((m) => (m.id === machine.id ? machine : m))
          : [...store.maquinas, machine],
        true
      )
      useAppStore.getState()._recalcular()
    })
  }
}

function handleConfigChange(valor: unknown) {
  if (!valor || typeof valor !== "object") return
  const payload = valor as {
    eventType?: string
    new?: { data?: Record<string, unknown>; updated_at?: string }
  }
  if (payload.eventType === "DELETE") return
  const cfg = payload.new?.data || {}
  const servicos = normalizarServicos(cfg.servicosExternosConfig)
  gravarServicosConfirmados(servicos)
  applyRemoteChange(() => {
    useAppStore.getState()._setConfig({
      fator: typeof cfg.fator === "number" ? cfg.fator : undefined,
      mostrarOcultos: typeof cfg.mostrarOcultos === "boolean" ? cfg.mostrarOcultos : undefined,
      prioridadesPV: Array.isArray(cfg.prioridadesPV) ? cfg.prioridadesPV : [],
      servicosExternosConfig: servicos,
      _configUpdatedAt: payload.new?.updated_at,
    })
  })
}

export async function pushLocalToSupabase(): Promise<void> {
  _pendingLocalSave = true
  _lastLocalChangeAt = Date.now()
  await requestSave()
  if (_dbState.status === "error") throw new Error(_dbState.error || "Falha ao salvar no Supabase")
}
