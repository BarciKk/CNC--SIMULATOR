import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMachineStore } from '../../store'

interface MillArcState {
  active: boolean
  cx: number
  cy: number
  startZ: number
  endZ: number
  startAngle: number
  totalAngle: number
  radius: number
  arcLength: number
  progress: number
}

// Geometria łuku w płaszczyźnie G17 (XY) dla frezarki
function computeMillArcXY(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  isClockwise: boolean, // G02 = CW, G03 = CCW (patrząc z góry +Z na stół XY)
  arc?: { i?: number; j?: number; r?: number }
) {
  let cx = x1
  let cy = y1

  if (arc?.r !== undefined && arc.r !== 0) {
    const r = Math.abs(arc.r)
    const dx = x2 - x1
    const dy = y2 - y1
    const d = Math.hypot(dx, dy)
    const radius = Math.max(r, d / 2)
    const h = Math.sqrt(Math.max(0, radius * radius - (d * d) / 4))
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2

    // Dla G02 (CW) w standardowym układzie kartezjańskim XY środek okręgu (R > 0)
    // leży po PRAWEJ stronie wektora ruchu (+dy, -dx)
    const sign = (isClockwise ? 1 : -1) * (arc.r > 0 ? 1 : -1)
    cx = mx + (sign * h * dy) / (d || 1)
    cy = my - (sign * h * dx) / (d || 1)
  } else {
    cx = x1 + (arc?.i || 0)
    cy = y1 + (arc?.j || 0)
  }

  const radius = Math.hypot(x1 - cx, y1 - cy)
  const startAngle = Math.atan2(y1 - cy, x1 - cx)
  let endAngle = Math.atan2(y2 - cy, x2 - cx)

  if (Math.hypot(x2 - x1, y2 - y1) < 0.0001 && (arc?.i || arc?.j)) {
    endAngle = startAngle + (isClockwise ? -Math.PI * 2 : Math.PI * 2)
  } else {
    if (isClockwise) {
      while (endAngle >= startAngle - 0.0001) endAngle -= Math.PI * 2
    } else {
      while (endAngle <= startAngle + 0.0001) endAngle += Math.PI * 2
    }
  }

  const totalAngle = endAngle - startAngle
  const arcLength = Math.max(0.001, Math.abs(totalAngle) * radius)

  return { cx, cy, startAngle, totalAngle, radius, arcLength }
}

export function ToolHead() {
  const meshRef = useRef<THREE.Group>(null)
  const cutterRef = useRef<THREE.Group>(null)

  const targetPosition = useMachineStore((state) => state.targetPosition)
  const arcParams = useMachineStore((state) => state.arcParams)
  const motionMode = useMachineStore((state) => state.motionMode)
  const compiledSteps = useMachineStore((state) => state.compiledSteps)
  const showToolpath = useMachineStore((state) => state.showToolpath)

  const targetVec = useRef(new THREE.Vector3())
  const prevMachPos = useRef({ x: 0, y: 0, z: 1.0 })
  const arcRef = useRef<MillArcState>({
    active: false,
    cx: 0,
    cy: 0,
    startZ: 0,
    endZ: 0,
    startAngle: 0,
    totalAngle: 0,
    radius: 0,
    arcLength: 0,
    progress: 1,
  })

  // --- GENEROWANIE LINII ŚCIEŻKI 3D DLA FREZARKI (BACKPLOT) ---
  const { rapidGeo, cutGeo } = useMemo(() => {
    const rapidPts: THREE.Vector3[] = []
    const cutPts: THREE.Vector3[] = []

    const to3D = (x: number, y: number, z: number) => new THREE.Vector3(x, z + 0.015, -y)

    let curX = 0
    let curY = 0
    let curZ = 1.0

    for (const step of compiledSteps) {
      const nx = step.target.x
      const ny = step.target.y
      const nz = step.target.z

      if (step.motionMode === 'G0') {
        rapidPts.push(to3D(curX, curY, curZ), to3D(nx, ny, nz))
      } else if (step.motionMode === 'G1') {
        cutPts.push(to3D(curX, curY, curZ), to3D(nx, ny, nz))
      } else if (step.motionMode === 'G2' || step.motionMode === 'G3') {
        const isCW = step.motionMode === 'G2'
        const { cx, cy, startAngle, totalAngle, radius } = computeMillArcXY(
          curX,
          curY,
          nx,
          ny,
          isCW,
          step.arc
        )
        const segments = 28
        let prevPt = to3D(curX, curY, curZ)
        for (let s = 1; s <= segments; s++) {
          const t = s / segments
          const ang = startAngle + totalAngle * t
          const az = curZ + (nz - curZ) * t
          const pt = to3D(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius, az)
          cutPts.push(prevPt, pt)
          prevPt = pt
        }
      }

      curX = nx
      curY = ny
      curZ = nz
    }

    return {
      rapidGeo: new THREE.BufferGeometry().setFromPoints(rapidPts),
      cutGeo: new THREE.BufferGeometry().setFromPoints(cutPts),
    }
  }, [compiledSteps])

  useEffect(() => {
    return () => {
      rapidGeo.dispose()
      cutGeo.dispose()
    }
  }, [rapidGeo, cutGeo])

  useEffect(() => {
    arcRef.current.active = false
    arcRef.current.progress = 0
  }, [targetPosition, arcParams, motionMode])

  useFrame((_, delta) => {
    if (!meshRef.current) return

    const state = useMachineStore.getState()

    if (cutterRef.current && state.isPlaying && state.spindleSpeed > 0) {
      cutterRef.current.rotation.y -= delta * 25
    }

    targetVec.current.set(
      state.targetPosition.x,
      state.targetPosition.z,
      -state.targetPosition.y
    )
    const currentVec = meshRef.current.position

    // Zapisujemy pozycję sprzed klatki
    prevMachPos.current = {
      x: currentVec.x,
      y: -currentVec.z,
      z: currentVec.y,
    }

    let speed = 6.0
    if (state.motionMode !== 'G0') {
      speed = state.feedRate > 0 ? Math.max(0.8, state.feedRate / 60) : 2.5
    }

    const distance = currentVec.distanceTo(targetVec.current)
    let isMoving = false

    // --- RUCH LINIOWY G00 / G01 ---
    if (state.motionMode === 'G0' || state.motionMode === 'G1') {
      if (distance > 0.0001) {
        isMoving = true
        const step = Math.min(speed * delta, distance)
        const dir = targetVec.current.clone().sub(currentVec).normalize()
        currentVec.add(dir.multiplyScalar(step))
      }
    }
    // --- RUCH KOŁOWY G02 / G03 W PŁASZCZYŹNIE XY (G17) ---
    else if (state.motionMode === 'G2' || state.motionMode === 'G3') {
      const curMachX = currentVec.x
      const curMachY = -currentVec.z
      const curMachZ = currentVec.y

      if (!arcRef.current.active && arcRef.current.progress < 1) {
        const isCW = state.motionMode === 'G2'
        const geom = computeMillArcXY(
          curMachX,
          curMachY,
          state.targetPosition.x,
          state.targetPosition.y,
          isCW,
          state.arcParams
        )
        arcRef.current = {
          active: true,
          ...geom,
          startZ: curMachZ,
          endZ: state.targetPosition.z,
          progress: 0,
        }
        isMoving = true
      }

      if (arcRef.current.active && arcRef.current.progress < 1) {
        isMoving = true
        const arc = arcRef.current
        const stepPercent = (speed * delta) / arc.arcLength
        arc.progress = Math.min(1, arc.progress + stepPercent)

        const currentAngle = arc.startAngle + arc.totalAngle * arc.progress
        const nextMachX = arc.cx + Math.cos(currentAngle) * arc.radius
        const nextMachY = arc.cy + Math.sin(currentAngle) * arc.radius
        const nextMachZ = arc.startZ + (arc.endZ - arc.startZ) * arc.progress

        currentVec.set(nextMachX, nextMachZ, -nextMachY)

        if (arc.progress >= 1) {
          arc.active = false
        }
      }
    }

    if (isMoving) {
      const newMachPos = {
        x: currentVec.x,
        y: -currentVec.z,
        z: currentVec.y,
      }
      state.setCurrentPosition(newMachPos)

      // Przekazujemy wyłącznie mikro-odcinek z bieżącej klatki do szybkiej siatki Heightmap!
      if (state.motionMode === 'G1' || state.motionMode === 'G2' || state.motionMode === 'G3') {
        state.setActiveCut({
          start: prevMachPos.current,
          end: newMachPos,
        })
      } else {
        state.setActiveCut(null)
      }
    } else {
      if (state.activeCut) {
        state.setActiveCut(null)
      }

      if (state.isPlaying) {
        if (state.currentStepIndex < state.compiledSteps.length - 1) {
          state.advanceStep()
        } else {
          state.pauseProgram()
        }
      }
    }
  })

  return (
    <>
      {showToolpath && (
        <group>
          <lineSegments geometry={rapidGeo}>
            <lineBasicMaterial color="#f59e0b" transparent opacity={0.6} />
          </lineSegments>
          <lineSegments geometry={cutGeo}>
            <lineBasicMaterial color="#10b981" transparent opacity={0.95} />
          </lineSegments>
        </group>
      )}

      <group ref={meshRef} position={[0, 1, 0]}>
        <group ref={cutterRef}>
          <mesh position={[0, 0.85, 0]}>
            <cylinderGeometry args={[0.32, 0.55, 0.5, 32]} />
            <meshStandardMaterial color="#27272a" metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.12, 6]} />
            <meshStandardMaterial color="#18181b" metalness={0.9} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.25, 0.25, 0.5, 24]} />
            <meshStandardMaterial color="#d4af37" metalness={0.75} roughness={0.2} />
          </mesh>
        </group>
        <axesHelper args={[0.5]} />
      </group>
    </>
  )
}