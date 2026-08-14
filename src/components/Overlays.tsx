"use client"

import { useEffect, useState } from "react"
import { getDbStatus, onDbStatusChange, type DbStatusState } from "@/lib/sync"

export function Toast() {
  return <div id="copyToast" className="copy-toast" />
}

const STATUS_LABEL: Record<DbStatusState["status"], string> = {
  connecting: "Banco: conectando…",
  connected: "Banco: online",
  error: "Banco: erro",
}

export function DbStatus() {
  const [db, setDb] = useState(getDbStatus)

  useEffect(() => {
    return onDbStatusChange(setDb)
  }, [])

  return (
    <div id="dbStatus" className={`db-status ${db.status}`}>
      <span className="db-status-dot" />
      <span className="db-status-label">{STATUS_LABEL[db.status]}</span>
      {db.status === "error" && db.error && (
        <span className="db-status-error">{db.error}</span>
      )}
    </div>
  )
}
