import type { Metadata } from "next"
import "./globals.css"
import { AppProvider } from "@/components/AppProvider"

export const metadata: Metadata = {
  title: "Carga Máquina",
  description: "Carga, PV e prioridade de fila - PCP",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
