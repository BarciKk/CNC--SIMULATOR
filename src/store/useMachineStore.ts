import { create } from 'zustand'

export type MachineType = 'lathe' | 'mill'
export type MotionMode = 'G0' | 'G1' | 'G2' | 'G3'
export type PositioningMode = 'G90' | 'G91'
export type UnitMode = 'G20' | 'G21'
export type SpindleMode = 'G96' | 'G97'
export type SpindleDir = 'M03' | 'M04' | 'M05'
export type FeedMode = 'G94' | 'G95'
export type WorkpieceViewMode = 'solid' | 'transparent' | 'section'

export type ToolGeometryType =
  | 'DCLNR'   // Zgrubny zewnętrzny 95° (CNMG 80°)
  | 'SVJBR'   // Wykańczający zewnętrzny prawy (VCMT 35°)
  | 'SVJBL'   // Wykańczający zewnętrzny lewy / reverse (VCMT 35°)
  | 'GROOVE'  // Ucinak / listwa rowkująca w oprawce
  | 'THREAD'  // Nóż do gwintowania zewnętrznego 60°
  | 'SCLCR'   // Wytaczak wewnętrzny (6/8/12/16/20 mm)
  | 'DRILL'   // Wiertło płytkowe / kręte z kątem 140°
  | 'ENDMILL' // Frez palcowy (dla frezarki)

export type BoringBarSizeMM = 6 | 8 | 12 | 16 | 20

export interface ToolConfig {
  slot: number
  type: ToolGeometryType
  name: string
  diameter: number            // Średnica wiertła
  width: number               // Szerokość płytki ucinaka (domyślnie 0.10)
  pointAngle: number          // Kąt wierzchołkowy wiertła (140°)
  boringBarMM: BoringBarSizeMM // Rozmiar wytaczaka: 6, 8, 12, 16 lub 20 mm
}

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
  spindleDir: SpindleDir
  maxSpindleSpeed: number
  feedMode: FeedMode
  toolNumber: number
  coolant: boolean
  isProgramEnd?: boolean
}

const STORAGE_KEY = 'cnc_sim_light_state_v2'

export const DEFAULT_TOOLS: Record<number, ToolConfig> = {
  1: { slot: 1, type: 'DCLNR', name: 'DCLNR 2525M12 (Zgrubny 95°)', diameter: 0.5, width: 0.04, pointAngle: 80, boringBarMM: 12 },
  2: { slot: 2, type: 'GROOVE', name: 'Listwa Ucinak 3mm (0.10")', diameter: 0.5, width: 0.10, pointAngle: 90, boringBarMM: 12 },
  3: { slot: 3, type: 'SVJBR', name: 'SVJBR 2525M16 (Finisz 35°)', diameter: 0.5, width: 0.02, pointAngle: 35, boringBarMM: 12 },
  4: { slot: 4, type: 'SVJBL', name: 'SVJBL 2525M16 (Reverse 35°)', diameter: 0.5, width: 0.02, pointAngle: 35, boringBarMM: 12 },
  5: { slot: 5, type: 'THREAD', name: 'SER 2525M16 (Gwint 60°)', diameter: 0.5, width: 0.08, pointAngle: 60, boringBarMM: 12 },
  6: { slot: 6, type: 'DRILL', name: 'Wiertło VHM 140°', diameter: 0.5, width: 0.10, pointAngle: 140, boringBarMM: 12 },
  7: { slot: 7, type: 'SCLCR', name: 'Wytaczak S-SCLCR', diameter: 0.5, width: 0.10, pointAngle: 80, boringBarMM: 12 },
  8: { slot: 8, type: 'ENDMILL', name: 'Frez Palcowy VHM', diameter: 0.5, width: 0.5, pointAngle: 180, boringBarMM: 12 },
}

// Domyślne, czyste parametry przy przełączeniu typu narzędzia w slocie (żeby nie zaciągało danych z wiertła!)
export function getCleanDefaultsForType(type: ToolGeometryType): Partial<ToolConfig> {
  switch (type) {
    case 'DCLNR':
      return { type, name: 'DCLNR 2525M12 (Zgrubny 95°)', width: 0.04 }
    case 'SVJBR':
      return { type, name: 'SVJBR 2525M16 (Finisz 35°)', width: 0.02 }
    case 'SVJBL':
      return { type, name: 'SVJBL 2525M16 (Reverse 35°)', width: 0.02 }
    case 'GROOVE':
      return { type, name: 'Listwa Ucinak (3mm / 0.10")', width: 0.10 }
    case 'THREAD':
      return { type, name: 'SER 2525M16 (Gwint 60°)', width: 0.06 }
    case 'DRILL':
      return { type, name: 'Wiertło VHM 140°', diameter: 0.5, pointAngle: 140 }
    case 'SCLCR':
      return { type, name: 'Wytaczak S-SCLCR', boringBarMM: 12 }
    default:
      return { type, name: 'Frez Palcowy VHM', diameter: 0.5 }
  }
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveLightState(data: {
  gcodeText?: string
  stockDiameter?: number
  stockLength?: number
  toolLibrary?: Record<number, ToolConfig>
}) {
  try {
    const current = loadSavedState() || {}
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...data }))
  } catch {
    // Ignorujemy błędy quota
  }
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

  toolLibrary: Record<number, ToolConfig>
  updateToolConfig: (slot: number, config: Partial<ToolConfig>) => void

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
  spindleDir: SpindleDir
  feedMode: FeedMode
  feedRate: number
  spindleSpeed: number
  actualRpm: number
  maxSpindleSpeed: number
  activeTool: number
  coolant: boolean
  setModalState: (state: Partial<MachineState>) => void

  gcodeLines: string[]
  savedGcodeText: string
  compiledSteps: ExecutionStep[]
  currentStepIndex: number
  currentLineIndex: number
  isPlaying: boolean
  loadProgram: (lines: string[], steps?: ExecutionStep[], rawText?: string) => void
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
const saved = loadSavedState()
const INITIAL_DIA = saved?.stockDiameter ?? 2.0
const INITIAL_LEN = saved?.stockLength ?? 4.0
const INITIAL_TOOLS: Record<number, ToolConfig> = saved?.toolLibrary ?? DEFAULT_TOOLS

export const useMachineStore = create<MachineState>((set) => ({
  machineType: 'lathe',
  setMachineType: (type) => set({ machineType: type }),

  workpieceViewMode: 'solid',
  setWorkpieceViewMode: (mode) => set({ workpieceViewMode: mode }),
  showToolpath: true,
  setShowToolpath: (show) => set({ showToolpath: show }),

  stockDiameter: INITIAL_DIA,
  stockLength: INITIAL_LEN,
  setStockDimensions: (diameter, length) =>
    set(() => {
      saveLightState({ stockDiameter: diameter, stockLength: length })
      return {
        stockDiameter: diameter,
        stockLength: length,
        latheProfile: Array(Z_STEPS).fill(diameter / 2),
        innerProfile: Array(Z_STEPS).fill(0),
      }
    }),

  toolLibrary: INITIAL_TOOLS,
  updateToolConfig: (slot, partial) =>
    set((state) => {
      const currentSlot = state.toolLibrary[slot] || DEFAULT_TOOLS[slot]
      // Jeśli użytkownik zmienia typ narzędzia, nadpisujemy czyste wartości domyślne dla nowego typu!
      const cleanDefaults =
        partial.type && partial.type !== currentSlot.type
          ? getCleanDefaultsForType(partial.type)
          : {}

      const updated = {
        ...state.toolLibrary,
        [slot]: { ...currentSlot, ...cleanDefaults, ...partial },
      }
      saveLightState({ toolLibrary: updated })
      return { toolLibrary: updated }
    }),

  latheProfile: Array(Z_STEPS).fill(INITIAL_DIA / 2),
  innerProfile: Array(Z_STEPS).fill(0),

  carveLatheProfile: (z, r, prevZ, prevR) =>
    set((state) => {
      const len = state.stockLength
      if (Math.min(prevZ, z) > 0.02 || Math.max(prevZ, z) < -len - 0.02) {
        return state
      }

      const tool = state.toolLibrary[state.activeTool] || DEFAULT_TOOLS[1]
      const dz = z - prevZ
      const dr = r - prevR

      // 1. WIERCENIE OSIOWE Z KĄTEM WIERZCHOŁKOWYM (140°)
      if (tool.type === 'DRILL' || (Math.abs(r) < 0.005 && Math.abs(prevR) < 0.005 && z < prevZ)) {
        const drillRad = (tool.type === 'DRILL' ? tool.diameter : 0.5) / 2
        const angleRad = ((tool.pointAngle || 140) * Math.PI) / 180
        const coneLength = drillRad / Math.tan(angleRad / 2)

        const tipZ = Math.min(prevZ, z)
        const maxZ = Math.max(prevZ, z) + coneLength
        const startIndex = Math.max(0, Math.floor(((tipZ + len) / len) * (Z_STEPS - 1)) - 2)
        const endIndex = Math.min(Z_STEPS - 1, Math.ceil(((maxZ + len) / len) * (Z_STEPS - 1)) + 2)

        const newInner = [...state.innerProfile]
        let innerMod = false

        for (let i = startIndex; i <= endIndex; i++) {
          const pointZ = -len + (i / (Z_STEPS - 1)) * len
          if (pointZ >= tipZ && pointZ <= 0.001) {
            let targetInnerR = drillRad
            if (pointZ < tipZ + coneLength) {
              const distFromTip = Math.max(0, pointZ - tipZ)
              targetInnerR = (distFromTip / coneLength) * drillRad
            }
            if (newInner[i] < targetInnerR) {
              newInner[i] = Math.min(state.latheProfile[i] - 0.015, targetInnerR)
              innerMod = true
            }
          }
        }
        return innerMod ? { innerProfile: newInner } : state
      }

      // 2. WYTACZAK WEWNĘTRZNY (SCLCR)
      if (tool.type === 'SCLCR') {
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
            if (currentR > newInner[i] && currentR < state.latheProfile[i] - 0.015) {
              newInner[i] = currentR
              innerMod = true
            }
          }
        }
        return innerMod ? { innerProfile: newInner } : state
      }

      // 3. TOCZENIE ZEWNĘTRZNE (DCLNR, SVJBR, SVJBL), GWINTOWANIE (THREAD) ORAZ UCINAK (GROOVE)
      const grooveHalfWidth =
        tool.type === 'GROOVE'
          ? (tool.width || 0.10) / 2
          : Math.abs(dz) < 0.0005 && r < prevR && z < -0.02
          ? 0.025
          : 0.003

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

  currentPosition: { x: INITIAL_DIA + 1.0, y: 0, z: 1.0 },
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

  targetPosition: { x: INITIAL_DIA + 1.0, y: 0, z: 1.0 },
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
  spindleDir: 'M03',
  feedMode: 'G95',
  feedRate: 0.2,
  spindleSpeed: 200,
  actualRpm: 0,
  maxSpindleSpeed: 3000,
  activeTool: 1,
  coolant: false,
  setModalState: (newState) => set((state) => ({ ...state, ...newState })),

  gcodeLines: [],
  savedGcodeText: saved?.gcodeText ?? '',
  compiledSteps: [],
  currentStepIndex: 0,
  currentLineIndex: 0,
  isPlaying: false,

  loadProgram: (lines, steps = [], rawText) =>
    set((state) => {
      if (rawText !== undefined) {
        saveLightState({ gcodeText: rawText })
      }
      return {
        gcodeLines: lines,
        savedGcodeText: rawText ?? state.savedGcodeText,
        compiledSteps: steps,
        currentStepIndex: 0,
        currentLineIndex: 0,
        isPlaying: false,
      }
    }),

  playProgram: () =>
    set((state) => {
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
          spindleDir: first.spindleDir,
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
        return {
          isPlaying: false,
          currentStepIndex: 0,
          currentLineIndex: 0,
          spindleSpeed: 0,
          actualRpm: 0,
          spindleDir: 'M05',
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
          spindleDir: 'M05',
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
        spindleDir: nextStep.spindleDir,
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
      spindleDir: 'M03',
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