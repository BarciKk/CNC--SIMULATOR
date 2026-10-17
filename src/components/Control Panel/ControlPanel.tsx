import { useState, useEffect, type FormEvent } from 'react'
import { useMachineStore, type ToolGeometryType } from '../../store/useMachineStore'
import { compileGCodeProgram, parseGCodeLine } from '../../parser/useCodeParser'

const DEMO_LATHE_PROGRAM = [
  '(DEMO FANUC: DCLNR + SVJBR + UCINAK + GWINT G76 + WIERTLO 140° + WYTACZAK)',
  'G20 G99',
  'G50 S3000',
  'G96 S250 M03 (T0101 - ZGRUBNY DCLNR)',
  'G00 X2.2 Z0.1 T0101 M08',
  'G01 X2.0 Z0.0 F0.01',
  'G01 X-0.05 F0.006 (PLANOWANIE CZOLA)',
  'G00 X2.1 Z0.1',
  'G71 U0.1 R0.03',
  'G71 P10 Q20 U0.02 W0.005 F0.012',
  'N10 G00 X1.0',
  'G01 Z-1.1 F0.006',
  'G02 X1.4 Z-1.3 R0.2',
  'G01 Z-2.2',
  'G01 X1.9 Z-2.8',
  'N20 G01 Z-3.4',
  'G28 U0 W0',
  '(T0303 - FINISZ SVJBR 35 STOPNI)',
  'G96 S300 T0303 M03',
  'G00 X2.1 Z0.1',
  'G70 P10 Q20 F0.005',
  'G28 U0 W0',
  '(T0202 - UCINAK LISTWA: PODCIECIE ZA GWINTEM)',
  'G97 S900 T0202 M03',
  'G00 X1.2 Z-1.02',
  'G75 X0.80 P150 F0.004',
  'G28 U0 W0',
  '(T0505 - GWINT G76 NA SREDNICY X1.0)',
  'G97 S800 T0505 M03',
  'G00 X1.15 Z0.15',
  'G76 P010060 Q50 R0.02',
  'G76 X0.86 Z-0.98 P70 Q25 F0.1',
  'G28 U0 W0',
  '(T0606 - WIERTLO 140 STOPNI: CYKL G83)',
  'G97 S1100 T0606 M03',
  'G00 X0.0 Z0.2',
  'G83 Z-2.4 R0.1 Q0.5 F0.006',
  'G28 U0 W0',
  '(T0707 - WYTACZAK SCLCR: ROZTACZANIE GNIAZDA)',
  'G96 S220 T0707 M03',
  'G00 X0.76 Z0.1',
  'G01 Z-1.1 F0.005',
  'G01 X0.48',
  'G00 Z0.3',
  'G28 U0 W0 M09',
  'M30',
]

const DEMO_MILL_PROGRAM = [
  '(DEMO FREZARKA 3-OS: KIESZEN OBWODOWA Z 4 LUKAMI G02 + WIERCENIE G83)',
  'G21 G90 G94',
  'S3500 M03',
  'G00 X0.8 Y1.3 Z0.5 T08 M08',
  'G01 Z-0.3 F150',
  'G01 X0.8 Y2.7 F240',
  'G02 X1.3 Y3.2 R0.5',
  'G01 X2.7 Y3.2',
  'G02 X3.2 Y2.7 R0.5',
  'G01 X3.2 Y1.3',
  'G02 X2.7 Y0.8 R0.5',
  'G01 X1.3 Y0.8',
  'G02 X0.8 Y1.3 R0.5',
  'G00 Z0.5',
  'G00 X2.0 Y2.0',
  'G83 Z-0.9 R0.1 Q0.3 F180',
  'G00 Z1.0 M09',
  'M30',
]

const TOOL_TYPE_OPTIONS: { value: ToolGeometryType; label: string }[] = [
  { value: 'DCLNR', label: 'DCLNR 95° (Zgrubny CNMG)' },
  { value: 'SVJBR', label: 'SVJBR 35° (Finisz Prawy)' },
  { value: 'SVJBL', label: 'SVJBL 35° (Finisz Reverse/Lewy)' },
  { value: 'GROOVE', label: 'Ucinak / Listwa Rowkująca' },
  { value: 'THREAD', label: 'Gwintownik 60° (SER)' },
  { value: 'DRILL', label: 'Wiertło (Stożek 140°)' },
  { value: 'SCLCR', label: 'Wytaczak Wewnętrzny (SCLCR)' },
]

export function ControlPanel() {
  const savedGcodeText = useMachineStore((s) => s.savedGcodeText)
  const [mdiCode, setMdiCode] = useState('')
  const [editorText, setEditorText] = useState(
    savedGcodeText || DEMO_LATHE_PROGRAM.join('\n')
  )
  const [isEditingCode, setIsEditingCode] = useState(true)
  const [rightTab, setRightTab] = useState<'dro' | 'tools'>('dro')

  const machine = useMachineStore()

  const compileAndLoad = (rawText: string) => {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((line) => line.length > 0)

    machine.resetMachine()
    const steps = compileGCodeProgram(lines)
    machine.loadProgram(lines, steps, rawText)

    if (steps.length > 0) {
      const first = steps[0]
      machine.setModalState({
        motionMode: first.motionMode,
        unitMode: first.unitMode,
        feedRate: first.feedRate,
        spindleSpeed: first.spindleSpeed,
        spindleMode: first.spindleMode,
        spindleDir: first.spindleDir,
        maxSpindleSpeed: first.maxSpindleSpeed,
        feedMode: first.feedMode,
        activeTool: first.toolNumber,
        coolant: first.coolant,
      })
      machine.updatePosition(first.target, first.arc)
    }
  }

  // Automatyczna kompilacja zapisanego w localStorage kodu przy pierwszym starcie
  useEffect(() => {
    if (machine.compiledSteps.length === 0 && editorText.trim().length > 0) {
      compileAndLoad(editorText)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setEditorText(text)
      compileAndLoad(text)
      setIsEditingCode(false)
    }
    reader.readAsText(file)
  }

  const executeMdi = (e: FormEvent) => {
    e.preventDefault()
    if (mdiCode.trim() === '') return
    parseGCodeLine(mdiCode)
    setMdiCode('')
  }

  const handleSingleBlock = () => {
    if (machine.compiledSteps.length === 0) {
      compileAndLoad(editorText)
      return
    }
    machine.pauseProgram()
    machine.advanceStep()
  }

  const handleCycleStart = () => {
    if (machine.compiledSteps.length === 0) {
      compileAndLoad(editorText)
    }
    setIsEditingCode(false)
    machine.playProgram()
  }

  const formatPos = (val: number) => {
    const decimals = machine.unitMode === 'G20' ? 4 : 3
    return val.toFixed(decimals)
  }

  const distToGoX = machine.targetPosition.x - machine.currentPosition.x
  const distToGoY = machine.targetPosition.y - machine.currentPosition.y
  const distToGoZ = machine.targetPosition.z - machine.currentPosition.z
  const currentToolCfg = machine.toolLibrary[machine.activeTool]

  return (
    <>
      {/* ================= LEWY PANEL: EDYTOR G-CODE (Z AUTO-ZAPISEM LOCALSTORAGE) ================= */}
      <div className="w-[370px] h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col p-3 z-10 shadow-2xl select-none">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
              Edytor Programu NC
            </h2>
            <p className="text-[11px] text-zinc-500">
              {machine.compiledSteps.length} kroków (Zapisano w pamięci przeglądarki)
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const demo = (
                machine.machineType === 'mill' ? DEMO_MILL_PROGRAM : DEMO_LATHE_PROGRAM
              ).join('\n')
              setEditorText(demo)
              compileAndLoad(demo)
            }}
            className="text-[11px] bg-orange-600/20 hover:bg-orange-600/40 text-orange-300 border border-orange-500/40 px-2.5 py-1 rounded font-semibold transition-colors"
          >
            {machine.machineType === 'mill' ? 'Załaduj Demo Frezarki' : 'Załaduj Demo Tokarki'}
          </button>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <input
            type="file"
            accept=".txt,.nc,.gcode,.tap"
            onChange={handleFileUpload}
            className="block flex-1 text-xs text-zinc-400 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700"
          />
          <button
            type="button"
            onClick={() => setIsEditingCode(!isEditingCode)}
            className={`px-2.5 py-1 text-xs font-bold rounded border transition-colors ${
              isEditingCode
                ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
            }`}
          >
            {isEditingCode ? 'TRYB: EDYCJA' : 'TRYB: ŚLEDZENIE'}
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0 mb-2">
          {isEditingCode ? (
            <textarea
              value={editorText}
              onChange={(e) => setEditorText(e.target.value)}
              spellCheck={false}
              placeholder="Wklej tutaj G-code z Fusion 360 / CAM..."
              className="flex-1 w-full bg-zinc-950 text-emerald-400 font-mono text-xs p-3 rounded border border-zinc-700 focus:border-blue-500 focus:outline-none resize-none leading-relaxed uppercase"
            />
          ) : (
            <div className="flex-1 w-full bg-zinc-950 p-2 rounded border border-zinc-800 overflow-y-auto font-mono text-xs text-zinc-400">
              {machine.gcodeLines.map((line, index) => (
                <div
                  key={index}
                  className={`px-2 py-0.5 rounded flex items-center ${
                    index === machine.currentLineIndex
                      ? 'bg-blue-600/40 text-white font-bold border-l-2 border-blue-400'
                      : ''
                  }`}
                >
                  <span className="text-zinc-600 w-7 inline-block select-none">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate">{line}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => compileAndLoad(editorText)}
          className="w-full mb-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded shadow transition-colors uppercase tracking-wide"
        >
          Przelicz Ścieżki i Zapisz (Kompiluj)
        </button>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleCycleStart}
            disabled={machine.isPlaying}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold py-2.5 rounded transition-colors"
          >
            CYCLE START
          </button>
          <button
            onClick={handleSingleBlock}
            disabled={machine.isPlaying}
            className="bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold py-2.5 rounded transition-colors"
          >
            SINGLE BLK
          </button>
          <button
            onClick={machine.pauseProgram}
            disabled={!machine.isPlaying}
            className="bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold py-2.5 rounded transition-colors"
          >
            FEED HOLD
          </button>
        </div>
      </div>

      {/* ================= PRAWY PANEL: DRO + MAGAZYN NARZĘDZI (T01-T08) ================= */}
      <div className="fixed right-0 top-0 bottom-0 w-[340px] bg-zinc-900 border-l border-zinc-800 flex flex-col justify-between p-3 z-10 shadow-2xl select-none">
        <div className="flex-1 flex flex-col min-h-0">
          {/* Przełącznik zakładek prawego panelu: DRO vs Biblioteka Narzędzi */}
          <div className="flex items-center justify-between gap-1 mb-2.5">
            <div className="flex flex-1 bg-zinc-950 p-0.5 rounded border border-zinc-800">
              <button
                type="button"
                onClick={() => setRightTab('dro')}
                className={`flex-1 py-1 text-[11px] font-bold rounded transition-colors ${
                  rightTab === 'dro' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                FANUC DRO
              </button>
              <button
                type="button"
                onClick={() => setRightTab('tools')}
                className={`flex-1 py-1 text-[11px] font-bold rounded transition-colors ${
                  rightTab === 'tools'
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                NARZĘDZIA (T01-T08)
              </button>
            </div>

            <button
              onClick={() => compileAndLoad(editorText)}
              className="text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1.5 rounded border border-zinc-600 transition-colors font-semibold"
            >
              RESET
            </button>
          </div>

          {rightTab === 'dro' ? (
            <>
              {/* Przełącznik Tokarka / Frezarka */}
              <div className="flex bg-zinc-950 rounded p-0.5 mb-2.5 border border-zinc-800">
                <button
                  onClick={() => machine.setMachineType('lathe')}
                  className={`flex-1 py-1 text-xs font-bold rounded transition-colors ${
                    machine.machineType === 'lathe'
                      ? 'bg-orange-600 text-white'
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  TOKARKA (G18)
                </button>
                <button
                  onClick={() => machine.setMachineType('mill')}
                  className={`flex-1 py-1 text-xs font-bold rounded transition-colors ${
                    machine.machineType === 'mill'
                      ? 'bg-blue-600 text-white'
                      : 'text-zinc-500 hover:text-white'
                  }`}
                >
                  FREZARKA (G17)
                </button>
              </div>

              {/* WYŚWIETLACZ DRO */}
              <div className="bg-black p-3 rounded-lg font-mono mb-2.5 shadow-inner border border-zinc-700">
                <div className="grid grid-cols-3 text-[10px] text-zinc-500 border-b border-zinc-800 pb-1 mb-1.5 uppercase font-bold">
                  <span>Oś</span>
                  <span className="text-right">Absolutne</span>
                  <span className="text-right text-amber-500">Dist To Go</span>
                </div>

                <div className="grid grid-cols-3 items-baseline text-lg mb-1">
                  <span className="text-blue-400 font-bold text-sm">
                    {machine.machineType === 'lathe' ? 'X (Ø)' : 'X'}
                  </span>
                  <span className="text-right text-blue-400 font-bold">
                    {formatPos(machine.currentPosition.x)}
                  </span>
                  <span className="text-right text-amber-400/90 text-sm">
                    {formatPos(distToGoX)}
                  </span>
                </div>

                {machine.machineType === 'mill' && (
                  <div className="grid grid-cols-3 items-baseline text-lg mb-1">
                    <span className="text-green-400 font-bold text-sm">Y</span>
                    <span className="text-right text-green-400 font-bold">
                      {formatPos(machine.currentPosition.y)}
                    </span>
                    <span className="text-right text-amber-400/90 text-sm">
                      {formatPos(distToGoY)}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-3 items-baseline text-lg">
                  <span className="text-red-400 font-bold text-sm">Z</span>
                  <span className="text-right text-red-400 font-bold">
                    {formatPos(machine.currentPosition.z)}
                  </span>
                  <span className="text-right text-amber-400/90 text-sm">
                    {formatPos(distToGoZ)}
                  </span>
                </div>
              </div>

              {/* STATUS WRZECIONA (Z OSTRZEŻENIEM KIERUNKU OBROTÓW M03 vs M04!) */}
              <div className="grid grid-cols-2 gap-1.5 mb-2.5 text-xs font-mono">
                <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-[10px]">
                      WRZECIONO ({machine.spindleMode})
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        machine.spindleDir === 'M04'
                          ? 'bg-red-600/30 text-red-400 border border-red-500/40'
                          : machine.spindleDir === 'M03'
                          ? 'bg-emerald-600/30 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {machine.spindleDir === 'M03'
                        ? 'M03 ↻'
                        : machine.spindleDir === 'M04'
                        ? 'M04 ↺'
                        : 'STOP'}
                    </span>
                  </div>
                  <span className="text-sm text-orange-400 font-bold block mt-0.5">
                    {machine.actualRpm || machine.spindleSpeed} RPM
                  </span>
                  <span className="block text-[10px] text-zinc-500">
                    {machine.spindleMode === 'G96'
                      ? `Vc=${machine.spindleSpeed} (Max ${machine.maxSpindleSpeed})`
                      : 'Stałe obroty G97'}
                  </span>
                </div>

                <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                  <span className="block text-zinc-500 text-[10px]">
                    POSUW ({machine.feedMode})
                  </span>
                  <span className="text-sm text-emerald-400 font-bold block mt-0.5">
                    F {machine.feedRate}
                  </span>
                  <span className="block text-[10px] text-zinc-500">
                    {machine.feedMode === 'G95' ? 'Na obrót (G99)' : 'Minutowy (G98)'}
                  </span>
                </div>

                <div className="bg-zinc-950 p-2 rounded border border-zinc-800 col-span-2 flex items-center justify-between">
                  <div>
                    <span className="block text-zinc-500 text-[10px]">AKTYWNE NARZĘDZIE W GŁOWICY</span>
                    <span className="text-xs text-white font-bold">
                      T0{machine.activeTool}0{machine.activeTool} — {currentToolCfg?.type} (
                      {currentToolCfg?.type === 'DRILL'
                        ? `Ø${currentToolCfg.diameter} / ${currentToolCfg.pointAngle}°`
                        : currentToolCfg?.type === 'GROOVE'
                        ? `Szer. ${currentToolCfg.width}`
                        : currentToolCfg?.name}
                      )
                    </span>
                  </div>
                  <span className="text-xs font-bold text-zinc-400 bg-zinc-900 px-2 py-1 rounded border border-zinc-700">
                    {machine.unitMode}
                  </span>
                </div>
              </div>

              {/* WIDOK MATERIAŁU I ŚCIEŻEK */}
              <div className="mb-2.5 p-2.5 bg-zinc-950 rounded-lg border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">
                    Widok Detalu
                  </span>
                  <button
                    type="button"
                    onClick={() => machine.setShowToolpath(!machine.showToolpath)}
                    className={`px-2 py-0.5 text-[10px] rounded font-bold border ${
                      machine.showToolpath
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-500'
                    }`}
                  >
                    {machine.showToolpath ? 'ŚCIEŻKI: ON' : 'ŚCIEŻKI: OFF'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1 bg-zinc-900 rounded p-0.5 border border-zinc-700 text-[10px]">
                  <button
                    type="button"
                    onClick={() => machine.setWorkpieceViewMode('solid')}
                    className={`py-1 rounded font-bold ${
                      machine.workpieceViewMode === 'solid'
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-400'
                    }`}
                  >
                    PEŁNY
                  </button>
                  <button
                    type="button"
                    onClick={() => machine.setWorkpieceViewMode('section')}
                    className={`py-1 rounded font-bold ${
                      machine.workpieceViewMode === 'section'
                        ? 'bg-amber-600 text-white'
                        : 'text-zinc-400'
                    }`}
                  >
                    PRZEKRÓJ 180°
                  </button>
                  <button
                    type="button"
                    onClick={() => machine.setWorkpieceViewMode('transparent')}
                    className={`py-1 rounded font-bold ${
                      machine.workpieceViewMode === 'transparent'
                        ? 'bg-cyan-600 text-white'
                        : 'text-zinc-400'
                    }`}
                  >
                    DUCH
                  </button>
                </div>
              </div>

              {/* WYMIARY PÓŁFABRYKATU */}
              <div className="p-2.5 bg-zinc-950 rounded-lg border border-zinc-800">
                <span className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase">
                  Półfabrykat (Średnica Ø / Wysięg L)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center bg-zinc-900 rounded border border-zinc-700 px-2 py-1">
                    <span className="text-xs text-zinc-500 mr-2">Ø</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      className="w-full bg-transparent text-white text-xs focus:outline-none font-mono"
                      value={machine.stockDiameter}
                      onChange={(e) =>
                        machine.setStockDimensions(
                          Number(e.target.value),
                          machine.stockLength
                        )
                      }
                    />
                  </div>
                  <div className="flex items-center bg-zinc-900 rounded border border-zinc-700 px-2 py-1">
                    <span className="text-xs text-zinc-500 mr-2">L</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      className="w-full bg-transparent text-white text-xs focus:outline-none font-mono"
                      value={machine.stockLength}
                      onChange={(e) =>
                        machine.setStockDimensions(
                          machine.stockDiameter,
                          Number(e.target.value)
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ================= ZAKŁADKA: KREATOR / BIBLIOTEKA NARZĘDZI (T01 - T07) ================= */
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <p className="text-[11px] text-zinc-400 mb-2">
                Przypisz geometrię noża lub wiertła do wybranego gniazda głowicy (zapisuje się automatycznie):
              </p>
              {[1, 2, 3, 4, 5, 6, 7].map((slot) => {
                const cfg = machine.toolLibrary[slot]
                return (
                  <div
                    key={slot}
                    className={`p-2 rounded border text-xs ${
                      machine.activeTool === slot
                        ? 'bg-blue-950/30 border-blue-500/60'
                        : 'bg-zinc-950 border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono font-bold text-amber-400">
                        T0{slot}0{slot}
                      </span>
                      <button
                        type="button"
                        onClick={() => machine.setModalState({ activeTool: slot })}
                        className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded"
                      >
                        Podgląd 3D
                      </button>
                    </div>

                    <select
                      value={cfg.type}
                      onChange={(e) =>
                        machine.updateToolConfig(slot, {
                          type: e.target.value as ToolGeometryType,
                        })
                      }
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white mb-1.5 focus:outline-none focus:border-blue-500"
                    >
                      {TOOL_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    {/* Dodatkowe parametry dla Wiertła (Średnica + Kąt 140°) lub Ucinaka (Szerokość) */}
                    {cfg.type === 'DRILL' && (
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div>
                          <label className="block text-[10px] text-zinc-500">Średnica Ø</label>
                          <input
                            type="number"
                            step="0.05"
                            min="0.1"
                            value={cfg.diameter}
                            onChange={(e) =>
                              machine.updateToolConfig(slot, {
                                diameter: Number(e.target.value),
                              })
                            }
                            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-500">Kąt wierzch. (°)</label>
                          <input
                            type="number"
                            step="5"
                            min="90"
                            max="180"
                            value={cfg.pointAngle}
                            onChange={(e) =>
                              machine.updateToolConfig(slot, {
                                pointAngle: Number(e.target.value),
                              })
                            }
                            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-white font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {cfg.type === 'GROOVE' && (
                      <div className="mt-1">
                        <label className="block text-[10px] text-zinc-500">
                          Szerokość płytki ucinaka
                        </label>
                        <input
                          type="number"
                          step="0.02"
                          min="0.03"
                          value={cfg.width}
                          onChange={(e) =>
                            machine.updateToolConfig(slot, {
                              width: Number(e.target.value),
                            })
                          }
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-white font-mono"
                        />
                      </div>
                    )}
                    {cfg.type === 'SCLCR' && (
                      <div className="mt-1">
                        <label className="block text-[10px] text-zinc-500 mb-1">
                          Średnica trzonka wytaczaka (S-SCLCR)
                        </label>
                        <div className="grid grid-cols-5 gap-1">
                          {([6, 8, 12, 16, 20] as const).map((mm) => (
                            <button
                              key={mm}
                              type="button"
                              onClick={() =>
                                machine.updateToolConfig(slot, { boringBarMM: mm })
                              }
                              className={`py-1 rounded text-[10px] font-mono font-bold border ${
                                (cfg.boringBarMM || 12) === mm
                                  ? 'bg-amber-600 border-amber-400 text-white'
                                  : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'
                              }`}
                            >
                              {mm}mm
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* DOLNY PASEK: MDI */}
        <form onSubmit={executeMdi} className="pt-2 border-t border-zinc-800">
          <label className="block text-[10px] uppercase text-zinc-400 mb-1 font-bold">
            Rozkaz MDI (np. T0404 lub M04)
          </label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={mdiCode}
              onChange={(e) => setMdiCode(e.target.value)}
              placeholder="G1 X1.2 Z-1.0 F0.01"
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors"
            >
              MDI
            </button>
          </div>
        </form>
      </div>
    </>
  )
}