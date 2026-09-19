import { create } from 'zustand'

export type MachineType = 'lathe' | 'mill'
export type MotionMode = 'G0' | 'G1' | 'G2' | 'G3' | null
export type PositioningMode = 'G90' | 'G91'
export type UnitMode = 'G20' | 'G21'

export interface CutSegment {
  start: Position
  end: Position
}
export interface Position {
  x: number
  y: number
  z: number
  i?: number 
  j?: number 
  k?: number 
  r?: number 
}

interface MachineState {
  machineType: MachineType
  setMachineType: (type: MachineType) => void
  latheProfile: number[]
  carveLatheProfile: (z: number, radius: number, prevZ: number, prevR: number) => void
  currentPosition: Position
  setCurrentPosition: (pos: Position) => void
  gcodeLines: string[]
currentLineIndex: number
isPlaying: boolean
loadProgram: (lines: string[]) => void
playProgram: () => void
pauseProgram: () => void
advanceLine: () => void
  unitMode: UnitMode
  
  targetPosition: Position
  updatePosition: (pos: Partial<Position>) => void
  
 completedCuts: CutSegment[]
 activeCut: CutSegment | null
 setActiveCut: (cut: CutSegment | null) => void
 addCompletedCut: (cut: CutSegment) => void
 clearCuts: () => void

  motionMode: MotionMode
  positioningMode: PositioningMode
  feedRate: number
  spindleSpeed: number
  setModalState: (state: Partial<Pick<MachineState, 'motionMode' | 'positioningMode' | 'feedRate' | 'spindleSpeed'>>) => void
  
  resetMachine: () => void
}

const initialPosition: Position = { x: 0, y: 0, z: 0 }
const LATHE_STOCK_LENGTH = 6;
const LATHE_STOCK_RADIUS = 1.5;
const Z_STEPS = 120;
const initialLatheProfile = Array(Z_STEPS).fill(LATHE_STOCK_RADIUS);

export const useMachineStore = create<MachineState>((set) => ({
  machineType: 'mill', 
  setMachineType: (type) => set({ machineType: type }),
  latheProfile: [...initialLatheProfile],
  unitMode: 'G20',
  gcodeLines: [],
currentLineIndex: 0,
isPlaying: false,

loadProgram: (lines) => set({ 
  gcodeLines: lines, 
  currentLineIndex: 0, 
  isPlaying: false 
}),
playProgram: () => set({ isPlaying: true }),
pauseProgram: () => set({ isPlaying: false }),
advanceLine: () => set((state) => ({ currentLineIndex: state.currentLineIndex + 1 })),
  currentPosition: { ...initialPosition },
  setCurrentPosition: (pos) => set({ currentPosition: pos }),
  
  targetPosition: { ...initialPosition },
  updatePosition: (pos) => 
    set((state) => ({
      targetPosition: { ...state.targetPosition, ...pos }
    })),

  completedCuts: [],
  activeCut: null,
  setActiveCut: (cut) => set({ activeCut: cut }),
  addCompletedCut: (cut) => set((state) => ({ completedCuts: [...state.completedCuts, cut] })),
  clearCuts: () => set({ completedCuts: [], activeCut: null }),
  motionMode: null,
  positioningMode: 'G90',
  feedRate: 0,
  spindleSpeed: 0,
  
  setModalState: (newState) => 
    set((state) => ({ ...state, ...newState })),
 carveLatheProfile: (z, r, prevZ, prevR) => set((state) => {
  const newProfile = [...state.latheProfile]
  // Zamiana pozycji osiowej Z na indeksy w naszej 120-punktowej tablicy
  const i1 = Math.floor((prevZ / LATHE_STOCK_LENGTH) * Z_STEPS)
  const i2 = Math.floor((z / LATHE_STOCK_LENGTH) * Z_STEPS)

  const minIdx = Math.max(0, Math.min(i1, i2) - 1)
  const maxIdx = Math.min(Z_STEPS - 1, Math.max(i1, i2) + 1)

  // Wycinamy "pas" materiału od punktu A do B, a nie tylko pojedynczą kropkę
  for (let i = minIdx; i <= maxIdx; i++) {
    let currentR = r
    if (i1 !== i2) {
      // Interpolacja liniowa promienia w trakcie ruchu (kluczowe przy łukach!)
      const t = (i - i1) / (i2 - i1)
      currentR = prevR + t * (r - prevR)
    }
    if (newProfile[i] > currentR) newProfile[i] = currentR
  }
  return { latheProfile: newProfile }
}),
  resetMachine: () => set({
    currentPosition: { ...initialPosition },
    targetPosition: { ...initialPosition },
    motionMode: null,
    positioningMode: 'G90',
    feedRate: 0,
    latheProfile: [...initialLatheProfile],
    spindleSpeed: 0
  })
}))