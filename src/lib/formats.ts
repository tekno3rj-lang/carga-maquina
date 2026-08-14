export function formatDateTime(valor: string): string {
  if (!valor) return "-"
  const data = parseDataOperacional(valor)
  if (!data) return "-"
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()} ${pad(data.getHours())}:${pad(data.getMinutes())}`
}

export function formatMinutos(minutos: number | string): string {
  const n = Number(minutos || 0)
  const minTxt = Number.isInteger(n) ? String(n) : n.toFixed(2)
  if (n >= 60) {
    return `${minTxt} min (${(n / 60).toFixed(2)}h)`
  }
  return `${minTxt} min`
}

export function formatLeadTime(minutos: number): string {
  const n = Number(minutos || 0)
  if (!Number.isFinite(n) || n < 0) return "-"
  const minTxt = Number.isInteger(n) ? String(n) : n.toFixed(2)
  const totalHoras = n / 60
  const horasInt = Math.floor(totalHoras)
  const minsRest = Math.round((totalHoras - horasInt) * 60)
  const dias = Math.floor(horasInt / 24)
  const hrs = horasInt % 24

  if (dias > 0) {
    const parteHrs = hrs > 0 ? ` ${hrs}h` : ""
    return `${minTxt} min (${dias}d${parteHrs})`
  }
  if (horasInt > 0) {
    const parteMin = minsRest > 0 ? ` ${minsRest}min` : ""
    return `${minTxt} min (${horasInt}h${parteMin})`
  }
  return `${minTxt} min`
}

export function parseDataOperacional(valor: string): Date | null {
  if (!valor) return null
  const texto = String(valor).trim()
  if (!texto) return null

  const matchDT = texto.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (matchDT) {
    const [, a, m, d, h, min] = matchDT
    const data = new Date(+a, +m - 1, +d, +h, +min, 0, 0)
    return dataEhValidaOperacional(data) ? data : null
  }

  const matchDate = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (matchDate) {
    const [, a, m, d] = matchDate
    const data = new Date(+a, +m - 1, +d, 8, 0, 0, 0)
    return dataEhValidaOperacional(data) ? data : null
  }

  const matchBRDT = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)
  if (matchBRDT) {
    const [, d, m, a, h, min] = matchBRDT
    const data = new Date(+a, +m - 1, +d, +h, +min, 0, 0)
    return dataEhValidaOperacional(data) ? data : null
  }

  const matchBRDate = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (matchBRDate) {
    const [, d, m, a] = matchBRDate
    const data = new Date(+a, +m - 1, +d, 8, 0, 0, 0)
    return dataEhValidaOperacional(data) ? data : null
  }

  const data = new Date(texto)
  return dataEhValidaOperacional(data) ? data : null
}

export function dataEhValidaOperacional(date: Date): boolean {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false
  const ano = date.getFullYear()
  return ano >= 2020 && ano <= 2100
}

export function toDatetimeLocal(date: Date): string {
  if (!dataEhValidaOperacional(date)) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "T" + [pad(date.getHours()), pad(date.getMinutes())].join(":")
}

export function normalizarDataEntrada(valor: string): string {
  const data = parseDataOperacional(valor)
  return data ? toDatetimeLocal(data) : ""
}

export function escapeHTML(value: string): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function truncar(texto: string, max: number): string {
  if (!texto) return ""
  return texto.length > max ? texto.slice(0, max) + "..." : texto
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
