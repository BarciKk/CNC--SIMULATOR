import { create } from 'zustand'

export type MachineType = 'lathe' | 'mill'
export type MotionMode = 'G0' | 'G1' | 'G2' | 'G3'
export type PositioningMode = 'G90' | 'G91'
export type UnitMode = 'G20' | 'G21'
export type SpindleMode = 'G96' | 'G97'
export type FeedMode = 'G94' | 'G95'
export type WorkpieceViewMode = 'solid' | 'transparent' | 'section'

export interface Position {
  x: number
  y: number
  z: number
}

export interface ArcParams {
  i?: number
  j?: number
  k?: number
  r?: number
}

export interface CutSegment {
  start: Position
  end: Position
}

export interface ExecutionStep {
  lineNumber: number
  rawLine: string
  motionMode: MotionMode
  unitMode: UnitMode
  target: Position
  arc?: ArcParams
  feedRate: number
  spindleSpeed: number
  spindleMode: SpindleMode
  maxSpindleSpeed: number
  feedMode: FeedMode
  toolNumber: number
  coolant: boolean
  isProgramEnd?: boolean // Flaga dla M30 / M02
}

interface MachineState {
  machineType: MachineType
  setMachineType: (type: MachineType) => void

  workpieceViewMode: WorkpieceViewMode
  setWorkpieceViewMode: (mode: WorkpieceViewMode) => void
  showToolpath: boolean
  setShowToolpath: (show: boolean) => void

  stockDiameter: number
  stockLength: number
  setStockDimensions: (diameter: number, length: number) => void

  latheProfile: number[]
  innerProfile: number[]
  carveLatheProfile: (z: number, radius: number, prevZ: number, prevR: number) => void

  currentPosition: Position
  setCurrentPosition: (pos: Position) => void
  targetPosition: Position
  arcParams: ArcParams
  updatePosition: (pos: Partial<Position>, arc?: ArcParams) => void

  motionMode: MotionMode
  positioningMode: PositioningMode
  unitMode: UnitMode
  spindleMode: SpindleMode
  feedMode: FeedMode
  feedRate: number
  spindleSpeed: number
  actualRpm: number
  maxSpindleSpeed: number
  activeTool: number
  coolant: boolean
  setModalState: (state: Partial<MachineState>) => void

  gcodeLines: string[]
  compiledSteps: ExecutionStep[]
  currentStepIndex: number
  currentLineIndex: number
  isPlaying: boolean
  loadProgram: (lines: string[], steps?: ExecutionStep[]) => void
  playProgram: () => void
  pauseProgram: () => void
  advanceStep: () => void
  advanceLine: () => void

  completedCuts: CutSegment[]
  activeCut: CutSegment | null
  setActiveCut: (cut: CutSegment | null) => void
  addCompletedCut: (cut: CutSegment) => void
  clearCuts: () => void

  resetMachine: () => void
}

export const Z_STEPS = 600
const DEFAULT_DIA = 2.0
const DEFAULT_LEN = 4.0

export const useMachineStore = create<MachineState>((set) => ({
  machineType: 'lathe',
  setMachineType: (type) => set({ machineType: type }),

  workpieceViewMode: 'solid',
  setWorkpieceViewMode: (mode) => set({ workpieceViewMode: mode }),
  showToolpath: true,
  setShowToolpath: (show) => set({ showToolpath: show }),

  stockDiameter: DEFAULT_DIA,
  stockLength: DEFAULT_LEN,
  setStockDimensions: (diameter, length) =>
    set(() => ({
      stockDiameter: diameter,
      stockLength: length,
      latheProfile: Array(Z_STEPS).fill(diameter / 2),
      innerProfile: Array(Z_STEPS).fill(0),
    })),

  latheProfile: Array(Z_STEPS).fill(DEFAULT_DIA / 2),
  innerProfile: Array(Z_STEPS).fill(0),

  carveLatheProfile: (z, r, prevZ, prevR) =>
    set((state) => {
      const len = state.stockLength
      if (Math.min(prevZ, z) > 0.01 || Math.max(prevZ, z) < -len - 0.01) {
        return state
      }

      const dz = z - prevZ
      const dr = r - prevR

      // 1. Wewnętrzne wiercenie w osi (T0404 lub ruch po X=0)
      if ((state.activeTool === 4 || (Math.abs(r) < 0.005 && Math.abs(prevR) < 0.005)) && z < prevZ) {
        const minZ = Math.min(prevZ, z)
        const maxZ = Math.max(prevZ, z)
        const startIndex = Math.max(0, Math.floor(((minZ + len) / len) * (Z_STEPS - 1)) - 1)
        const endIndex = Math.min(Z_STEPS - 1, Math.ceil(((maxZ + len) / len) * (Z_STEPS - 1)) + 1)

        const newInner = [...state.innerProfile]
        const drillRadius = 0.25 // Promień wiertła T0404 (średnica Ø0.50)
        let innerMod = false
        for (let i = startIndex; i <= endIndex; i++) {
          const pointZ = -len + (i / (Z_STEPS - 1)) * len
          if (pointZ >= minZ - 0.005 && pointZ <= maxZ + 0.005) {
            if (newInner[i] < drillRadius) {
              newInner[i] = Math.min(state.latheProfile[i] - 0.02, drillRadius)
              innerMod = true
            }
          }
        }
        return innerMod ? { innerProfile: newInner } : state
      }

      // 2. Wytaczanie wewnętrzne wytaczakiem T0505 (roztaczanie otworu na większą średnicę!)
      if (state.activeTool === 5) {
        const minZ = Math.min(prevZ, z)
        const maxZ = Math.max(prevZ, z)
        const startIndex = Math.max(0, Math.floor(((minZ + len) / len) * (Z_STEPS - 1)) - 1)
        const endIndex = Math.min(Z_STEPS - 1, Math.ceil(((maxZ + len) / len) * (Z_STEPS - 1)) + 1)

        const newInner = [...state.innerProfile]
        let innerMod = false
        for (let i = startIndex; i <= endIndex; i++) {
          const pointZ = -len + (i / (Z_STEPS - 1)) * len
          if (pointZ >= minZ - 0.005 && pointZ <= maxZ + 0.005) {
            let currentR = r
            if (Math.abs(dz) > 0.00001) {
              const t = Math.max(0, Math.min(1, (pointZ - prevZ) / dz))
              currentR = prevR + t * dr
            } else {
              currentR = Math.max(prevR, r)
            }
            if (currentR > newInner[i] && currentR < state.latheProfile[i] - 0.02) {
              newInner[i] = currentR
              innerMod = true
            }
          }
        }
        return innerMod ? { innerProfile: newInner } : state
      }

      // 3. Toczenie zewnętrzne (T0101), Rowkowanie/Podcięcie (T0202) i Gwintowanie (T0303)
      // Jeśli to nóż rowkujący T0202 lub czysty wjazd poprzeczny w głąb materiału, uwzględniamy szerokość płytki!
      const isPlungeCut = Math.abs(dz) < 0.0005 && r < prevR && z < -0.02
      const grooveHalfWidth = state.activeTool === 2 ? 0.06 : isPlungeCut ? 0.045 : 0.004

      const minZ = Math.min(prevZ, z) - grooveHalfWidth
      const maxZ = Math.max(prevZ, z) + grooveHalfWidth

      const startIndex = Math.max(0, Math.floor(((minZ + len) / len) * (Z_STEPS - 1)) - 1)
      const endIndex = Math.min(Z_STEPS - 1, Math.ceil(((maxZ + len) / len) * (Z_STEPS - 1)) + 1)

      const newProfile = [...state.latheProfile]
      let modified = false

      for (let i = startIndex; i <= endIndex; i++) {
        const pointZ = -len + (i / (Z_STEPS - 1)) * len

        if (pointZ >= minZ && pointZ <= maxZ) {
          let currentR = r
          if (Math.abs(dz) > 0.0005) {
            const t = Math.max(0, Math.min(1, (pointZ - prevZ) / dz))
            currentR = prevR + t * dr
          } else {
            currentR = Math.min(prevR, r)
          }

          const clampedR = Math.max(state.innerProfile[i], currentR)
          if (newProfile[i] > clampedR) {
            newProfile[i] = clampedR
            modified = true
          }
        }
      }

      return modified ? { latheProfile: newProfile } : state
    }),

  currentPosition: { x: DEFAULT_DIA + 1.0, y: 0, z: 1.0 },
  setCurrentPosition: (pos) =>
    set((state) => {
      let rpm = state.spindleSpeed
      if (state.machineType === 'lathe' && state.spindleMode === 'G96' && state.spindleSpeed > 0) {
        const currentDia = Math.max(0.05, Math.abs(pos.x))
        const factor = state.unitMode === 'G21' ? 1000 : 12
        rpm = Math.min(
          state.maxSpindleSpeed,
          Math.round((factor * state.spindleSpeed) / (Math.PI * currentDia))
        )
      }
      return { currentPosition: pos, actualRpm: rpm }
    }),

  targetPosition: { x: DEFAULT_DIA + 1.0, y: 0, z: 1.0 },
  arcParams: {},
  updatePosition: (pos, arc = {}) =>
    set((state) => ({
      targetPosition: { ...state.targetPosition, ...pos },
      arcParams: arc,
    })),

  motionMode: 'G0',
  positioningMode: 'G90',
  unitMode: 'G21',
  spindleMode: 'G96',
  feedMode: 'G95',
  feedRate: 0.2,
  spindleSpeed: 200,
  actualRpm: 0,
  maxSpindleSpeed: 3000,
  activeTool: 1,
  coolant: false,
  setModalState: (newState) => set((state) => ({ ...state, ...newState })),

  gcodeLines: [],
  compiledSteps: [],
  currentStepIndex: 0,
  currentLineIndex: 0,
  isPlaying: false,

  loadProgram: (lines, steps = []) =>
    set({
      gcodeLines: lines,
      compiledSteps: steps,
      currentStepIndex: 0,
      currentLineIndex: 0,
      isPlaying: false,
    }),

  playProgram: () =>
    set((state) => {
      // Jeśli program skończył się na M30 i klikamy ponownie CYCLE START, startujemy od kroku 0
      if (state.currentStepIndex >= state.compiledSteps.length - 1 && state.compiledSteps.length > 0) {
        const first = state.compiledSteps[0]
        return {
          isPlaying: true,
          currentStepIndex: 0,
          currentLineIndex: first.lineNumber,
          motionMode: first.motionMode,
          unitMode: first.unitMode,
          targetPosition: first.target,
          arcParams: first.arc || {},
          feedRate: first.feedRate,
          spindleSpeed: first.spindleSpeed,
          spindleMode: first.spindleMode,
          maxSpindleSpeed: first.maxSpindleSpeed,
          feedMode: first.feedMode,
          activeTool: first.toolNumber,
          coolant: first.coolant,
        }
      }
      return { isPlaying: true }
    }),

  pauseProgram: () => set({ isPlaying: false }),

  advanceStep: () =>
    set((state) => {
      const nextStepIdx = state.currentStepIndex + 1
      if (nextStepIdx >= state.compiledSteps.length) {
        // Koniec programu (M30): przewijamy wskaźnik linii na początek (linia 0) i zatrzymujemy wrzeciono!
        return {
          isPlaying: false,
          currentStepIndex: 0,
          currentLineIndex: 0,
          spindleSpeed: 0,
          actualRpm: 0,
          coolant: false,
        }
      }
      const nextStep = state.compiledSteps[nextStepIdx]
      if (nextStep.isProgramEnd) {
        return {
          isPlaying: false,
          currentStepIndex: 0,
          currentLineIndex: 0,
          spindleSpeed: 0,
          actualRpm: 0,
          coolant: false,
        }
      }
      return {
        currentStepIndex: nextStepIdx,
        currentLineIndex: nextStep.lineNumber,
        motionMode: nextStep.motionMode,
        unitMode: nextStep.unitMode,
        targetPosition: nextStep.target,
        arcParams: nextStep.arc || {},
        feedRate: nextStep.feedRate,
        spindleSpeed: nextStep.spindleSpeed,
        spindleMode: nextStep.spindleMode,
        maxSpindleSpeed: nextStep.maxSpindleSpeed,
        feedMode: nextStep.feedMode,
        activeTool: nextStep.toolNumber,
        coolant: nextStep.coolant,
      }
    }),

  advanceLine: () =>
    set((state) => ({ currentLineIndex: state.currentLineIndex + 1 })),

  completedCuts: [],
  activeCut: null,
  setActiveCut: (cut) => set({ activeCut: cut }),
  addCompletedCut: (cut) =>
    set((state) => ({ completedCuts: [...state.completedCuts, cut] })),
  clearCuts: () => set({ completedCuts: [], activeCut: null }),

  resetMachine: () =>
    set((state) => ({
      currentPosition: { x: state.stockDiameter + 1.0, y: 0, z: 1.0 },
      targetPosition: { x: state.stockDiameter + 1.0, y: 0, z: 1.0 },
      arcParams: {},
      motionMode: 'G0',
      positioningMode: 'G90',
      spindleMode: 'G96',
      feedRate: 0.2,
      spindleSpeed: 0,
      actualRpm: 0,
      activeTool: 1,
      coolant: false,
      latheProfile: Array(Z_STEPS).fill(state.stockDiameter / 2),
      innerProfile: Array(Z_STEPS).fill(0),
      completedCuts: [],
      activeCut: null,
      currentStepIndex: 0,
      currentLineIndex: 0,
      isPlaying: false,
    })),
}))