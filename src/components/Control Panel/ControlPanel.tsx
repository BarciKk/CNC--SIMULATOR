import { useState, type FormEvent,  } from 'react'
import { useMachineStore } from '../../store'
import { parseGCodeLine } from '../../parser'


export function ControlPanel() {
  const [gcode, setGcode] = useState('')
  const machine = useMachineStore()
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (event) => {
    const text = event.target?.result as string
    // Rozbijamy plik na tablicę linii i czyścimy puste
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    machine.loadProgram(lines)
  }
  reader.readAsText(file)
}
  const executeCommand = (e: FormEvent) => {
    e.preventDefault()
    if (gcode.trim() === '') return

    parseGCodeLine(gcode)
    
    setGcode('')
  }

    const formatPos = (val: number) => {
    const decimals = machine.unitMode === 'G20' ? 4 : 3
    return val.toFixed(decimals)
    }

  return (
    <div className="w-96 bg-zinc-800 border-r border-zinc-700 flex flex-col p-4 z-10 shadow-xl">
      <h2 className="text-xl font-bold text-zinc-300 mb-6 uppercase tracking-wider">Status Maszyny</h2>
<div className="flex bg-zinc-900 rounded-lg p-1 mb-6 border border-zinc-700">
  <button 
    onClick={() => machine.setMachineType('mill')}
    className={`flex-1 py-2 text-sm font-bold rounded ${machine.machineType === 'mill' ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-white'}`}
  >
    FREZARKA 3-OŚ
  </button>
  <button 
    onClick={() => machine.setMachineType('lathe')}
    className={`flex-1 py-2 text-sm font-bold rounded ${machine.machineType === 'lathe' ? 'bg-orange-600 text-white' : 'text-zinc-500 hover:text-white'}`}
  >
    TOKARKA
  </button>
</div>
      {/* DRO - Wyświetlacz Pozycji */}
      <div className="bg-zinc-950 p-4 rounded-lg font-mono text-2xl mb-6 shadow-inner border border-zinc-700">
        <div className="flex justify-between text-blue-400 mb-2">
          <span>X</span>
          <span>{formatPos(machine.targetPosition.x)}</span>
        </div>
        <div className="flex justify-between text-green-400 mb-2">
          <span>Y</span>
          <span>{formatPos(machine.targetPosition.y)}</span>
        </div>
        <div className="flex justify-between text-red-400">
          <span>Z</span>
          <span>{formatPos(machine.targetPosition.z)}</span>
        </div>
        
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm font-mono text-zinc-400">
        <div className="bg-zinc-900 p-3 rounded border border-zinc-700">
          <span className="block text-zinc-500 mb-1">Ruch</span>
          <span className="text-lg text-white">{machine.motionMode || 'Brak'}</span>
        </div>
        <div className="bg-zinc-900 p-3 rounded border border-zinc-700">
          <span className="block text-zinc-500 mb-1">Układ</span>
          <span className="text-lg text-white">{machine.positioningMode}</span>
        </div>
        <div className="bg-zinc-900 p-3 rounded border border-zinc-700">
          <span className="block text-zinc-500 mb-1">Posuw (F)</span>
          <span className="text-lg text-white">{machine.feedRate}</span>
        </div>
        <div className="bg-zinc-900 p-3 rounded border border-zinc-700">
          <span className="block text-zinc-500 mb-1">Obr./min (S)</span>
          <span className="text-lg text-white">{machine.spindleSpeed}</span>
        </div>
        <div className="bg-zinc-900 p-3 rounded border border-zinc-700">
    <span className="block text-zinc-500 mb-1">Jednostki</span>
    <span className="text-lg text-white">{machine.unitMode}</span>
  </div>
      </div>

      <form onSubmit={executeCommand} className="mt-auto">
        <label className="block text-xs uppercase text-zinc-500 mb-2 font-bold">Wprowadź blok (MDI)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={gcode}
            onChange={(e) => setGcode(e.target.value.toUpperCase())}
            placeholder="np. G1 X100 Y50 F250"
            className="flex-1 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-white font-mono uppercase focus:outline-none focus:border-blue-500"
          />
          <button 
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded transition-colors"
          >
            START
          </button>
        </div>
      </form>
      <div className="mt-6 pt-4 border-t border-zinc-700">
  <h3 className="text-xs uppercase text-zinc-500 mb-2 font-bold">Wczytaj Program (.nc)</h3>
  
  <input 
    type="file" 
    accept=".txt,.nc,.gcode"
    onChange={handleFileUpload}
    className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 mb-4"
  />

  <div className="flex gap-2 mb-2">
    <button 
      onClick={machine.playProgram}
      disabled={machine.isPlaying || machine.gcodeLines.length === 0}
      className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-bold py-2 rounded transition-colors"
    >
      AUTO START
    </button>
    <button 
      onClick={machine.pauseProgram}
      disabled={!machine.isPlaying}
      className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-bold py-2 rounded transition-colors"
    >
      STOP
    </button>
  </div>
  
  <div className="bg-zinc-950 p-2 rounded border border-zinc-700 h-24 overflow-y-auto font-mono text-xs text-zinc-400">
    {machine.gcodeLines.length > 0 ? (
      machine.gcodeLines.map((line, index) => (
        <div key={index} className={index === machine.currentLineIndex ? "bg-blue-900 text-white font-bold" : ""}>
          N{index} {line}
        </div>
      ))
    ) : (
      <span>Brak załadowanego programu...</span>
    )}
  </div>
</div>
    </div>
  )
}