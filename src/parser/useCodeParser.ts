import { useMachineStore } from '../store/useMachineStore'
import type { ExecutionStep, MotionMode, Position, SpindleMode, SpindleDir, FeedMode, UnitMode} from '../store/useMachineStore'

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
  let spindleDir: SpindleDir = 'M03'
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
    arc?: { i?: number; j?: number; k?: number; r?: number },
    extra?: { threadPitch?: number; threadMajorRadius?: number }
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
      spindleDir,
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

    if (words.M.includes(3)) spindleDir = 'M03'
    if (words.M.includes(4)) spindleDir = 'M04'
    if (words.M.includes(5)) {
      spindleDir = 'M05'
      spindleSpeed = 0
    }
    if (words.M.includes(8)) coolant = true
    if (words.M.includes(9)) coolant = false

    if (words.M.includes(30) || words.M.includes(2)) {
      spindleSpeed = 0
      spindleDir = 'M05'
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
        spindleDir: 'M05',
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

    // --- CYKL G71 ---
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

    // --- CYKL G72 ---
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

    // --- CYKL G73 ---
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

    // --- CYKL G70 ---
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

    // --- CYKL G75 ---
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

    // --- CYKL G76 (Prawdziwe wieloprzebiegowe nacinanie gwintu bez szarpania!) ---
  if (words.G.includes(76)) {
      if (words.X === undefined && words.Z === undefined) {
        continue
      }
      if (words.X !== undefined && words.Z !== undefined) {
        const clearanceX = pos.x
        const startZ = pos.z
        const minorDia = words.X // Średnica rdzenia gwintu (dno bruzdy)
        const endZ = words.Z
        const pitch = Math.max(0.04, words.F || feedRate || 0.1) // Skok gwintu F

        const threadDepthRad = words.P
          ? words.P > 10
            ? words.P / 1000
            : words.P
          : Math.max(0.06, (clearanceX - minorDia) / 2)
        const majorDia = Math.min(clearanceX, minorDia + threadDepthRad * 2) // Średnica zewnętrzna zębów

        // 1. Trzy szybkie przejścia wstępne po wierzchołkach (nie ścinają czubków zębów na gładko!)
        for (let p = 1; p <= 2; p++) {
          pushStep(index, 'G0', { x: majorDia, y: 0, z: startZ })
          pushStep(index, 'G1', { x: majorDia, y: 0, z: endZ })
          pushStep(index, 'G0', { x: clearanceX, y: 0, z: endZ })
          pushStep(index, 'G0', { x: clearanceX, y: 0, z: startZ })
        }

        // 2. Przejście profilujące zwoje gwintu (wycina trójkątne bruzdy o skoku F aż do średnicy X!)
        pushStep(index, 'G0', { x: majorDia, y: 0, z: startZ })
        let zCur = startZ
        const zDir = endZ < startZ ? -1 : 1
        const halfPitch = pitch / 2

        while ((zDir < 0 && zCur > endZ + 0.001) || (zDir > 0 && zCur < endZ - 0.001)) {
          const zValley = zCur + zDir * halfPitch
          const zCrest = zDir < 0 ? Math.max(endZ, zCur - pitch) : Math.min(endZ, zCur + pitch)
          // Wcięcie w dno bruzdy gwintu (minorDia) i wyjście na wierzchołek zęba (majorDia)
          pushStep(index, 'G1', { x: minorDia, y: 0, z: zValley })
          pushStep(index, 'G1', { x: majorDia, y: 0, z: zCrest })
          zCur += zDir * pitch
        }

        pushStep(index, 'G0', { x: clearanceX, y: 0, z: endZ })
        pushStep(index, 'G0', { x: clearanceX, y: 0, z: startZ })
        continue
      }
    }

    // --- CYKLE WIERTARSKIE G81 / G83 ---
    if ((words.G.includes(81) || words.G.includes(83)) && words.Z !== undefined) {
      const retractZ = words.R !== undefined ? words.R : pos.z
      const targetZ = words.Z
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

export const parseGCodeLine = (line: string) => {
  const words = tokenizeLine(line)
  const store = useMachineStore.getState()

  const newModalState: any = {}

  if (words.G.includes(0)) newModalState.motionMode = 'G0'
  if (words.G.includes(1)) newModalState.motionMode = 'G1'
  if (words.G.includes(2)) newModalState.motionMode = 'G2'
  if (words.G.includes(3)) newModalState.motionMode = 'G3'
  if (words.G.includes(20)) newModalState.unitMode = 'G20'
  if (words.G.includes(21)) newModalState.unitMode = 'G21'
  if (words.G.includes(90)) newModalState.positioningMode = 'G90'
  if (words.G.includes(91)) newModalState.positioningMode = 'G91'
  if (words.G.includes(96)) newModalState.spindleMode = 'G96'
  if (words.G.includes(97)) newModalState.spindleMode = 'G97'

  if (words.M.includes(3)) newModalState.spindleDir = 'M03'
  if (words.M.includes(4)) newModalState.spindleDir = 'M04'
  if (words.M.includes(5)) newModalState.spindleDir = 'M05'

  if (words.F !== undefined) newModalState.feedRate = words.F
  if (words.S !== undefined) {
    if (words.G.includes(50)) newModalState.maxSpindleSpeed = words.S
    else newModalState.spindleSpeed = words.S
  }
  if (words.T !== undefined) {
    newModalState.activeTool = words.T >= 100 ? Math.floor(words.T / 100) : words.T
  }

  if (Object.keys(newModalState).length > 0) {
    store.setModalState(newModalState)
  }

  const isIncremental = (newModalState.positioningMode || store.positioningMode) === 'G91'
  const newPos: Partial<Position> = {}

  if (words.X !== undefined) newPos.x = isIncremental ? store.targetPosition.x + words.X : words.X
  if (words.U !== undefined) newPos.x = (newPos.x ?? store.targetPosition.x) + words.U

  if (words.Y !== undefined) newPos.y = isIncremental ? store.targetPosition.y + words.Y : words.Y

  if (words.Z !== undefined) newPos.z = isIncremental ? store.targetPosition.z + words.Z : words.Z
  if (words.W !== undefined) newPos.z = (newPos.z ?? store.targetPosition.z) + words.W

  if (words.G.includes(28)) {
    newPos.x = store.stockDiameter + 1.0
    newPos.y = 0
    newPos.z = 1.0
  }

  if (Object.keys(newPos).length > 0) {
    store.updatePosition(newPos, {
      i: words.I,
      j: words.J,
      k: words.K,
      r: words.R,
    })
  }
}