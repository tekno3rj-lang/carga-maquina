"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect } from "react"
import { useAppStore } from "@/store/useAppStore"
import { Header } from "@/components/Header"
import { MachineSidebar, MobileMachineTabs } from "@/components/MachineSidebar"
import { CurrentPanel } from "@/components/CurrentPanel"
import { JobsTable } from "@/components/JobsTable"
import { PlannedJobsTable } from "@/components/PlannedJobsTable"
import { MapeamentoTable } from "@/components/MapeamentoTable"
import { Toast, DbStatus } from "@/components/Overlays"
import { canOpenEdicaoModal } from "@/lib/auth"

const MachineModal = dynamic(() => import("@/components/modals/MachineModal").then(m => ({ default: m.MachineModal })), { ssr: false })
const ServiceModal = dynamic(() => import("@/components/modals/ServiceModal").then(m => ({ default: m.ServiceModal })), { ssr: false })
const PVPriorityModal = dynamic(() => import("@/components/modals/PVPriorityModal").then(m => ({ default: m.PVPriorityModal })), { ssr: false })
const ExternalServicesModal = dynamic(() => import("@/components/modals/ExternalServicesModal").then(m => ({ default: m.ExternalServicesModal })), { ssr: false })
const SimulationModal = dynamic(() => import("@/components/modals/SimulationModal").then(m => ({ default: m.SimulationModal })), { ssr: false })
const ConfirmModal = dynamic(() => import("@/components/modals/ConfirmModal").then(m => ({ default: m.ConfirmModal })), { ssr: false })
const UsersModal = dynamic(() => import("@/components/modals/UsersModal").then(m => ({ default: m.UsersModal })), { ssr: false })

export default function Home() {
  const mostrandoPlanejadasGeral = useAppStore(s => s.mostrandoPlanejadasGeral)
  const mostrandoMapeamento = useAppStore(s => s.mostrandoMapeamento)

  const bloquearModaisEdicao = useCallback((e: CustomEvent) => {
    const nome = e.detail
    if (typeof nome !== "string") return
    if (canOpenEdicaoModal(nome)) return
    e.preventDefault()
    e.stopImmediatePropagation()
  }, [])

  return (
    <>
      <Header />
      <main className="w-full mt-2.5 mb-5 px-2.5 grid grid-cols-[200px_minmax(0,1fr)] gap-3 max-lg:grid-cols-1">
        <div className="max-lg:hidden">
          <MachineSidebar />
        </div>
        <section className="min-w-0 flex flex-col gap-2">
          <div id="mobileTabs" className="hidden max-lg:flex gap-2 overflow-auto pb-1 no-print"><MobileMachineTabs /></div>
          {mostrandoMapeamento ? (
            <MapeamentoTable />
          ) : mostrandoPlanejadasGeral ? (
            <PlannedJobsTable />
          ) : (
            <>
              <CurrentPanel />
              <JobsTable />
            </>
          )}
        </section>
      </main>
      <MachineModal />
      <ServiceModal />
      <PVPriorityModal />
      <ExternalServicesModal />
      <SimulationModal />
      <ConfirmModal />
      <UsersModal />
      <Toast />
      <DbStatus />
      <div id="conflictToast" className="conflict-toast" />
      <EdicaoGuard onBlock={bloquearModaisEdicao} />
    </>
  )
}

function EdicaoGuard({ onBlock }: { onBlock: (e: CustomEvent) => void }) {
  useEffect(() => {
    const handler = (e: Event) => onBlock(e as CustomEvent)
    window.addEventListener("open-modal", handler, true)
    return () => window.removeEventListener("open-modal", handler, true)
  }, [onBlock])
  return null
}
