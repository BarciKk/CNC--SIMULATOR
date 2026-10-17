import { useMachineStore, } from '../store/useMachineStore'
import type {ExecutionStep,FeedMode, MotionMode, Position, SpindleMode, UnitMode} from '../store/useMachineStore'
interface ParsedWords {
  N?: number
  G: number[]
  M: number[]
  X?: number
  Y?: number
  Z?: number
  U?: number
  W?: number
  I?: number
  J?: number
  K?: number
  R?: number
  F?: number
  S?: number
  T?: number
  P?: number
  Q?: number
}

export const tokenizeLine = (line: string): ParsedWords => {
  const cleanLine = line.replace(/\([^)]*\)/g, '').split(';')[0].trim().toUpperCase()
  const words: ParsedWords = { G: [], M: [] }
  if (!cleanLine) return words

  const tokens = cleanLine.match(/[A-Z]-?\d*(\.\d+)?/g)
  if (!tokens) return words

  tokens.forEach((token) => {
    const letter = token[0]
    const val = parseFloat(token.substring(1))
    if (isNaN(val)) return

    if (letter === 'G') words.G.push(val)
    else if (letter === 'M') words.M.push(val)
    else (words as any)[letter] = val
  })

  return words
}

export const compileGCodeProgram = (lines: string[]): ExecutionStep[] => {
  const store = useMachineStore.getState()
  const steps: ExecutionStep[] = []

  let pos: Position = { x: store.stockDiameter + 1.0, y: 0, z: 1.0 }
  let motionMode: MotionMode = 'G0'
  let unitMode: UnitMode = store.unitMode
  let posMode: 'G90' | 'G91' = 'G90'
  let spindleMode: SpindleMode = 'G96'
  let feedMode: FeedMode = 'G95'
  let feedRate = 0.2
  let spindleSpeed = 200
  let maxSpindleSpeed = 3000
  let toolNumber = 1
  let coolant = false

  const nBlockMap = new Map<number, number>()
  const parsedLines = lines.map((raw, idx) => {
    const w = tokenizeLine(raw)
    if (w.N !== undefined) nBlockMap.set(w.N, idx)
    return { raw, words: w, index: idx }
  })

  let g71DepthOfCut = 0.1
  let g71Retract = 0.05
  let g72StepZ = 0.1
  let g72Retract = 0.05
  let g73ReliefU = 0.2
  let g73ReliefW = 0.1
  let g73Passes = 3

  const pushStep = (
    lineIdx: number,
    mode: MotionMode,
    target: Position,
    arc?: { i?: number; j?: number; k?: number; r?: number }
  ) => {
    steps.push({
      lineNumber: lineIdx,
      rawLine: lines[lineIdx],
      motionMode: mode,
      unitMode,
      target: { ...target },
      arc,
      feedRate,
      spindleSpeed,
      spindleMode,
      maxSpindleSpeed,
      feedMode,
      toolNumber,
      coolant,
    })
    pos = { ...target }
  }

  for (let i = 0; i < parsedLines.length; i++) {
    const { words, index } = parsedLines[i]
    if (
      words.G.length === 0 &&
      words.M.length === 0 &&
      words.X === undefined &&
      words.Y === undefined &&
      words.Z === undefined &&
      words.U === undefined &&
      words.W === undefined &&
      words.S === undefined &&
      words.F === undefined &&
      words.T === undefined
    ) {
      continue
    }

    if (words.G.includes(20)) unitMode = 'G20'
    if (words.G.includes(21)) unitMode = 'G21'

    if (words.M.includes(8)) coolant = true
    if (words.M.includes(9)) coolant = false

    if (words.M.includes(5) || words.M.includes(30)) spindleSpeed = 0
    if (words.M.includes(30) || words.M.includes(2)) {
      spindleSpeed = 0
      coolant = false
      steps.push({
        lineNumber: index,
        rawLine: lines[index],
        motionMode: 'G0',
        unitMode,
        target: { ...pos },
        feedRate,
        spindleSpeed: 0,
        spindleMode,
        maxSpindleSpeed,
        feedMode,
        toolNumber,
        coolant: false,
        isProgramEnd: true,
      })
      continue
    }
    if (words.T !== undefined) {
      toolNumber = words.T >= 100 ? Math.floor(words.T / 100) : words.T
    }

    if (words.F !== undefined) feedRate = words.F

    // G50 S... (Limit maksymalnych obrotów wrzeciona dla G96)
    if (words.G.includes(50) && words.S !== undefined) {
      maxSpindleSpeed = words.S
      continue
    }

    if (words.G.includes(96)) spindleMode = 'G96'
    if (words.G.includes(97)) spindleMode = 'G97'
    if (words.G.includes(94) || words.G.includes(98)) feedMode = 'G94'
    if (words.G.includes(95) || words.G.includes(99)) feedMode = 'G95'
    if (words.G.includes(90)) posMode = 'G90'
    if (words.G.includes(91)) posMode = 'G91'

    if (words.S !== undefined) spindleSpeed = words.S

    if (words.G.includes(28)) {
      pushStep(index, 'G0', { x: store.stockDiameter + 1.0, y: 0, z: 1.0 })
      continue
    }

    // --- CYKL G71 (Toczenie zgrubne wzdłużne) ---
    if (words.G.includes(71)) {
      if (words.P === undefined && words.U !== undefined) {
        g71DepthOfCut = Math.abs(words.U)
        g71Retract = words.R !== undefined ? Math.abs(words.R) : 0.05
        continue
      }
      if (words.P !== undefined && words.Q !== undefined) {
        const startLine = nBlockMap.get(words.P)
        const endLine = nBlockMap.get(words.Q)
        const finishAllowanceX = words.U || 0
        const finishAllowanceZ = words.W || 0

        if (startLine !== undefined && endLine !== undefined && endLine >= startLine) {
          const startX = pos.x
          const startZ = pos.z

          const contour: Position[] = []
          let tempPos = { ...pos }
          for (let k = startLine; k <= endLine; k++) {
            const cw = parsedLines[k].words
            const nx = cw.X !== undefined ? cw.X + finishAllowanceX : tempPos.x
            const nz = cw.Z !== undefined ? cw.Z + finishAllowanceZ : tempPos.z
            tempPos = { x: nx, y: 0, z: nz }
            contour.push(tempPos)
          }

          const minContourX = Math.min(...contour.map((c) => c.x))
          const minContourZ = Math.min(...contour.map((c) => c.z))

          let currentCutX = startX
          const stepDia = g71DepthOfCut * 2

          while (currentCutX - stepDia > minContourX) {
            currentCutX -= stepDia
            let targetZ = minContourZ
            for (let c = 0; c < contour.length - 1; c++) {
              const p1 = contour[c]
              const p2 = contour[c + 1]
              if ((p1.x <= currentCutX && p2.x >= currentCutX) || (p1.x >= currentCutX && p2.x <= currentCutX)) {
                if (Math.abs(p2.x - p1.x) > 0.0001) {
                  const t = (currentCutX - p1.x) / (p2.x - p1.x)
                  targetZ = p1.z + t * (p2.z - p1.z)
                  break
                }
              }
            }

            pushStep(index, 'G0', { x: currentCutX, y: 0, z: startZ })
            pushStep(index, 'G1', { x: currentCutX, y: 0, z: targetZ })
            pushStep(index, 'G0', { x: currentCutX + g71Retract * 2, y: 0, z: targetZ + g71Retract })
            pushStep(index, 'G0', { x: currentCutX + g71Retract * 2, y: 0, z: startZ })
          }
          pushStep(index, 'G0', { x: startX, y: 0, z: startZ })
        }
        continue
      }
    }

    // --- CYKL G72 (Toczenie zgrubne poprzeczne) ---
    if (words.G.includes(72)) {
      if (words.P === undefined && words.W !== undefined) {
        g72StepZ = Math.abs(words.W)
        g72Retract = words.R !== undefined ? Math.abs(words.R) : 0.05
        continue
      }
      if (words.P !== undefined && words.Q !== undefined) {
        const startLine = nBlockMap.get(words.P)
        const endLine = nBlockMap.get(words.Q)
        const finishAllowanceX = words.U || 0
        const finishAllowanceZ = words.W || 0

        if (startLine !== undefined && endLine !== undefined && endLine >= startLine) {
          const startX = pos.x
          const startZ = pos.z

          const contour: Position[] = []
          let tempPos = { ...pos }
          for (let k = startLine; k <= endLine; k++) {
            const cw = parsedLines[k].words
            const nx = cw.X !== undefined ? cw.X + finishAllowanceX : tempPos.x
            const nz = cw.Z !== undefined ? cw.Z + finishAllowanceZ : tempPos.z
            tempPos = { x: nx, y: 0, z: nz }
            contour.push(tempPos)
          }

          const minContourZ = Math.min(...contour.map((c) => c.z))
          const minContourX = Math.min(...contour.map((c) => c.x))
          let currentCutZ = startZ

          while (currentCutZ - g72StepZ >= minContourZ - 0.0001) {
            currentCutZ -= g72StepZ
            let targetX = minContourX

            for (let c = 0; c < contour.length - 1; c++) {
              const p1 = contour[c]
              const p2 = contour[c + 1]
              if ((p1.z <= currentCutZ && p2.z >= currentCutZ) || (p1.z >= currentCutZ && p2.z <= currentCutZ)) {
                if (Math.abs(p2.z - p1.z) > 0.0001) {
                  const t = (currentCutZ - p1.z) / (p2.z - p1.z)
                  targetX = p1.x + t * (p2.x - p1.x)
                  break
                }
              }
            }

            pushStep(index, 'G0', { x: startX, y: 0, z: currentCutZ })
            pushStep(index, 'G1', { x: targetX, y: 0, z: currentCutZ })
            pushStep(index, 'G0', { x: targetX + g72Retract * 2, y: 0, z: currentCutZ + g72Retract })
            pushStep(index, 'G0', { x: startX, y: 0, z: currentCutZ + g72Retract })
          }
          pushStep(index, 'G0', { x: startX, y: 0, z: startZ })
        }
        continue
      }
    }

    // --- CYKL G73 (Powtarzanie konturu) ---
    if (words.G.includes(73)) {
      if (words.P === undefined) {
        g73ReliefU = words.U !== undefined ? Math.abs(words.U) : 0.2
        g73ReliefW = words.W !== undefined ? Math.abs(words.W) : 0.1
        g73Passes = words.R !== undefined ? Math.max(1, Math.round(words.R)) : 3
        continue
      }
      if (words.P !== undefined && words.Q !== undefined) {
        const startLine = nBlockMap.get(words.P)
        const endLine = nBlockMap.get(words.Q)
        const finishU = words.U || 0
        const finishW = words.W || 0

        if (startLine !== undefined && endLine !== undefined && endLine >= startLine) {
          const savedPos = { ...pos }
          for (let pass = g73Passes - 1; pass >= 0; pass--) {
            const ratio = g73Passes > 1 ? pass / (g73Passes - 1) : 0
            const offsetDia = finishU + ratio * g73ReliefU * 2
            const offsetZ = finishW + ratio * g73ReliefW

            for (let k = startLine; k <= endLine; k++) {
              const cw = parsedLines[k].words
              let mMode: MotionMode = motionMode
              if (cw.G.includes(0)) mMode = 'G0'
              if (cw.G.includes(1)) mMode = 'G1'
              if (cw.G.includes(2)) mMode = 'G2'
              if (cw.G.includes(3)) mMode = 'G3'
              motionMode = mMode

              const nx = cw.X !== undefined ? cw.X + offsetDia : pos.x
              const nz = cw.Z !== undefined ? cw.Z + offsetZ : pos.z
              pushStep(k, mMode, { x: nx, y: 0, z: nz }, { i: cw.I, k: cw.K, r: cw.R })
            }
            pushStep(index, 'G0', savedPos)
          }
        }
        continue
      }
    }

    // --- CYKL G70 (Wykańczanie P... Q...) ---
    if (words.G.includes(70) && words.P !== undefined && words.Q !== undefined) {
      const startLine = nBlockMap.get(words.P)
      const endLine = nBlockMap.get(words.Q)
      if (startLine !== undefined && endLine !== undefined) {
        const savedPos = { ...pos }
        for (let k = startLine; k <= endLine; k++) {
          const cw = parsedLines[k].words
          let mMode: MotionMode = motionMode
          if (cw.G.includes(0)) mMode = 'G0'
          if (cw.G.includes(1)) mMode = 'G1'
          if (cw.G.includes(2)) mMode = 'G2'
          if (cw.G.includes(3)) mMode = 'G3'
          motionMode = mMode

          const nx = cw.X !== undefined ? cw.X : pos.x
          const nz = cw.Z !== undefined ? cw.Z : pos.z
          pushStep(k, mMode, { x: nx, y: 0, z: nz }, { i: cw.I, k: cw.K, r: cw.R })
        }
        pushStep(index, 'G0', savedPos)
      }
      continue
    }

    // --- CYKL G75 (Rowkowanie poprzeczne X) ---
    if (words.G.includes(75) && words.X !== undefined) {
      const startX = pos.x
      const targetX = words.X
      const peckStepDia = words.P ? (words.P > 10 ? (words.P / 1000) * 2 : words.P * 2) : Math.abs(startX - targetX)
      let curX = startX

      while (curX > targetX) {
        curX = Math.max(targetX, curX - peckStepDia)
        pushStep(index, 'G1', { x: curX, y: 0, z: pos.z })
        if (curX > targetX) {
          pushStep(index, 'G0', { x: curX + 0.05, y: 0, z: pos.z })
          pushStep(index, 'G0', { x: curX, y: 0, z: pos.z })
        }
      }
      pushStep(index, 'G0', { x: startX, y: 0, z: pos.z })
      continue
    }

    // --- CYKL G76 (Wieloprzebiegowy cykl gwintowania Fanuc z nacinaniem zarysu) ---
    if (words.G.includes(76)) {
      if (words.X === undefined && words.Z === undefined) {
        // Blok 1: G76 P010060 Q100 R0.05
        continue
      }
      if (words.X !== undefined && words.Z !== undefined) {
        const clearanceX = pos.x
        const startZ = pos.z
        const minorDia = words.X // Średnica rdzenia gwintu
        const endZ = words.Z
        const pitch = words.F || feedRate || 0.08 // Skok gwintu (F)

        // Wysokość zęba P (w mikronach np. P600 lub bezpośrednio)
        const threadDepthRad = words.P
          ? words.P > 10
            ? words.P / 1000
            : words.P
          : Math.max(0.04, (clearanceX - minorDia) / 2)
        const majorDia = minorDia + threadDepthRad * 2

        const passes = 4
        // Kolejne przejścia gwintowania (z malejącym przyrostem ap = sqrt(pass))
        for (let p = 1; p <= passes; p++) {
          const factor = Math.sqrt(p / passes)
          const passDia = majorDia - (majorDia - minorDia) * factor

          // Wjazd na głębokość przejścia
          pushStep(index, 'G0', { x: passDia, y: 0, z: startZ })

          if (p < passes) {
            // Przejście robocze zsynchronizowane ze skokiem
            pushStep(index, 'G1', { x: passDia, y: 0, z: endZ })
          } else {
            // Ostatnie przejście: fizyczne odwzorowanie zębów gwintu o skoku F na modelu 3D!
            let zCur = startZ
            const zDir = endZ < startZ ? -1 : 1
            const halfPitch = Math.max(0.03, pitch / 2)
            while ((zDir < 0 && zCur > endZ) || (zDir > 0 && zCur < endZ)) {
              const zMid = zCur + zDir * halfPitch
              const zNext = Math.min(startZ, Math.max(endZ, zCur + zDir * pitch))
              pushStep(index, 'G1', { x: minorDia, y: 0, z: zMid })
              pushStep(index, 'G1', { x: majorDia, y: 0, z: zNext })
              zCur += zDir * pitch
            }
          }

          // Szybkie wycofanie w X i powrót na start Z
          pushStep(index, 'G0', { x: clearanceX, y: 0, z: endZ })
          pushStep(index, 'G0', { x: clearanceX, y: 0, z: startZ })
        }
        continue
      }
    }

    // --- CYKLE WIERTARSKIE G81 / G83 (Wiercenie głębokie z wycofaniem) ---
    if ((words.G.includes(81) || words.G.includes(83)) && words.Z !== undefined) {
      const retractZ = words.R !== undefined ? words.R : pos.z
      const targetZ = words.Z
      // Obsługa Q w mikronach (np. Q500 -> 0.5) lub bezpośrednio (np. Q0.4)
      const rawQ = words.Q !== undefined && words.G.includes(83) ? Math.abs(words.Q) : Math.abs(retractZ - targetZ)
      const peck = rawQ > 10 ? rawQ / 1000 : rawQ

      pushStep(index, 'G0', { x: words.X ?? pos.x, y: words.Y ?? pos.y, z: retractZ })
      let curZ = retractZ
      while (curZ > targetZ + 0.0001) {
        curZ = Math.max(targetZ, curZ - peck)
        pushStep(index, 'G1', { x: pos.x, y: pos.y, z: curZ })
        pushStep(index, 'G0', { x: pos.x, y: pos.y, z: retractZ })
        if (curZ > targetZ + 0.0001) {
          pushStep(index, 'G0', { x: pos.x, y: pos.y, z: curZ + 0.04 })
        }
      }
      continue
    }

    if (words.G.includes(0)) motionMode = 'G0'
    if (words.G.includes(1)) motionMode = 'G1'
    if (words.G.includes(2)) motionMode = 'G2'
    if (words.G.includes(3)) motionMode = 'G3'

    const nextPos = { ...pos }
    let hasMove = false

    if (words.X !== undefined) {
      nextPos.x = posMode === 'G90' ? words.X : nextPos.x + words.X
      hasMove = true
    }
    if (words.U !== undefined) {
      nextPos.x += words.U
      hasMove = true
    }
    if (words.Y !== undefined) {
      nextPos.y = posMode === 'G90' ? words.Y : nextPos.y + words.Y
      hasMove = true
    }
    if (words.Z !== undefined) {
      nextPos.z = posMode === 'G90' ? words.Z : nextPos.z + words.Z
      hasMove = true
    }
    if (words.W !== undefined) {
      nextPos.z += words.W
      hasMove = true
    }

    if (hasMove) {
      pushStep(index, motionMode, nextPos, {
        i: words.I,
        j: words.J,
        k: words.K,
        r: words.R,
      })
    }
  }

  return steps
}