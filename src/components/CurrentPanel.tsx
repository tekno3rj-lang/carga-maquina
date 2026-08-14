"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/store/useAppStore"
import { trabalhosAtivos, trabalhosPlanejados, formatDiasUteis } from "@/lib/scheduling"
import { formatMinutos, escapeHTML } from "@/lib/formats"
import { podeEditar } from "@/lib/auth"

export function CurrentPanel() {
  const maquinas = useAppStore(s => s.maquinas)
  const atualId = useAppStore(s => s.atualId)
  const fator = useAppStore(s => s.fator)
  const setFator = useAppStore(s => s.setFator)
  const usuario = useAppStore(s => s.usuario)
  const editavel = podeEditar(usuario?.nivel)
  const resumoCicloSequenciamento = useAppStore(s => s.resumoCicloSequenciamento)
  const toggleOcultos = useAppStore(s => s.toggleOcultos)
  const mostrarOcultos = useAppStore(s => s.mostrarOcultos)
  const painelResumoVisivel = useAppStore(s => s.painelResumoVisivel)
  const togglePainelResumo = useAppStore(s => s.togglePainelResumo)
  const [fatorInput, setFatorInput] = useState(String(fator))
  const [ultimoFator, setUltimoFator] = useState(fator)
  if (ultimoFator !== fator) {
    setUltimoFator(fator)
    setFatorInput(String(fator))
  }
  const maq = useMemo(() => maquinas.find(m => m.id === atualId) || null, [maquinas, atualId])
  const jobs = useMemo(() => maq ? trabalhosAtivos(maq) : [], [maq])
  const jobsPlanejados = useMemo(() => maq ? trabalhosPlanejados(maq) : [], [maq])

  const { qtd, setup, usinagem, totalFatorado, setupPlanejado, usinagemPlanejada, totalFatoradoPlanejado, totalGeral, ocultos } = useMemo(() => {
    const qtd = jobs.reduce((s, j) => s + Number(j.qtd || 0), 0)
    const setup = jobs.reduce((s, j) => s + Number(j.setup || 0), 0)
    const usinagem = jobs.reduce((s, j) => s + Number(j.usinagem || 0) * Number(j.qtd || 0), 0)
    const totalFatorado = setup * (fator || 4.2) + usinagem
    const jobsPlanejadosConsiderados = jobsPlanejados.filter(j => !j.desconsiderarCarga)
    const setupPlanejado = jobsPlanejadosConsiderados.reduce((s, j) => s + Number(j.setup || 0), 0)
    const usinagemPlanejada = jobsPlanejadosConsiderados.reduce((s, j) => s + Number(j.usinagem || 0) * Number(j.qtd || 0), 0)
    const totalFatoradoPlanejado = setupPlanejado * (fator || 4.2) + usinagemPlanejada
    const totalGeral = totalFatorado + totalFatoradoPlanejado
    const ocultos = maq ? (maq.trabalhos || []).filter(j => String(j.status || "").toUpperCase() === "FINALIZADO").length : 0
    return { qtd, setup, usinagem, totalFatorado, setupPlanejado, usinagemPlanejada, totalFatoradoPlanejado, totalGeral, ocultos }
  }, [jobs, jobsPlanejados, fator, maq])

  return (
    <section className="panel p-2 pl-3 bg-[rgba(249,251,255,.94)] dark:bg-[var(--painel)] border border-[var(--linha)] rounded-[var(--raio)] shadow-[var(--sombra)]">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[var(--azul-escuro)] dark:text-[var(--azul)] text-[clamp(15px,1.8vw,20px)] leading-tight break-words">
            {escapeHTML(maq?.nome || "Nenhuma máquina criada")}
          </h2>
          <p className={`m-0 text-xs ${resumoCicloSequenciamento ? "text-[#92400e] dark:text-[var(--amarelo)] font-black" : "text-[var(--cinza)]"}`}>
            {resumoCicloSequenciamento || (maq
              ? "Tela da máquina selecionada. Organize a fila por prioridade; entradas e saídas são recalculadas automaticamente."
              : "Clique em \"Gerenciar máquinas\" para começar.")}
          </p>
        </div>
        {maq && (
          <button
            onClick={togglePainelResumo}
            title={painelResumoVisivel ? "Ocultar resumo" : "Mostrar resumo"}
            aria-label={painelResumoVisivel ? "Ocultar resumo" : "Mostrar resumo"}
            aria-expanded={painelResumoVisivel}
            className="flex items-center justify-center w-9 h-9 shrink-0 rounded-md border border-[var(--linha)] bg-[#edf5fc] dark:bg-[var(--hover)] text-[var(--cinza)] hover:text-[var(--azul)] hover:border-[#89c5f4] transition-all cursor-pointer"
          >
            {painelResumoVisivel ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" x2="22" y1="2" y2="22" />
              </svg>
            )}
          </button>
        )}
      </div>

      {maq && painelResumoVisivel && (
        <>
          <div className="grid grid-cols-7 gap-1 max-md:grid-cols-2">
            <div className="stat"><span>Trabalhos na fila</span><strong>{jobs.length}</strong></div>
            <div className="stat"><span>Quantidade total</span><strong>{qtd}</strong></div>
            <div className="stat"><span>Setup total</span><strong>{formatMinutos(setup)}</strong></div>
            <div className="stat"><span>Usinagem total</span><strong>{formatMinutos(usinagem)}</strong></div>
            <div className="stat"><span>Carga liberadas</span><strong>{formatMinutos(totalFatorado)}</strong> <span className="text-[var(--cinza)] text-[10px]">{formatDiasUteis(totalFatorado, maq?.turnos || "1")}</span></div>
            <div className="stat"><span>Carga total</span><strong>{formatMinutos(totalGeral)}</strong> <span className="text-[var(--cinza)] text-[10px]">{formatDiasUteis(totalGeral, maq?.turnos || "1")}</span></div>
            <div className="stat">
              <span>Fator de segurança</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={fatorInput}
                  disabled={!editavel}
                  onChange={e => {
                    setFatorInput(e.target.value)
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v) && v > 0) setFator(v)
                  }}
                  onBlur={() => setFatorInput(String(fator))}
                  className="w-16 text-center bg-transparent border-none outline-none text-[var(--azul)] text-[15px] font-black p-0 m-0 leading-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <small className="text-[var(--cinza)] text-[10px] font-black">× fator no setup</small>
              </div>
            </div>
          </div>
        </>
      )}
      {maq && (
        <div className="flex gap-2 mt-2 items-center flex-wrap">
          {(ocultos > 0 || mostrarOcultos) && (
              <>
                {ocultos > 0 && (
                  <span className="inline-flex items-center border border-[var(--linha)] rounded-full px-2 py-1 bg-[#edf5fc] dark:bg-[var(--hover)] text-[var(--cinza)] text-[11px] font-black whitespace-nowrap">
                    {ocultos} oculto{ocultos === 1 ? "" : "s"}
                  </span>
                )}
                <button
                  onClick={toggleOcultos}
                  className="btn-outline text-xs"
                >
                  {mostrarOcultos ? "Ver visíveis" : "Histórico"}
                </button>
              </>
            )}
            {editavel && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("open-modal", { detail: "jobModal" }))}
                className="btn-primary text-xs"
              >
                + Novo serviço
              </button>
            )}
          </div>
      )}
    </section>
  )
}
