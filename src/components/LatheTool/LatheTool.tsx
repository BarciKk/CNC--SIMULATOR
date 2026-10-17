import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMachineStore } from '../../store'
import { ToolModel } from './ToolModel'

interface ArcState {
  active: boolean
  cx: number
  cy: number
  startAngle: number
  totalAngle: number
  radius: number
  arcLength: number
  progress: number
}

// Pomocnicza funkcja wyliczająca parametry łuku dla animacji ORAZ dla rysowania ścieżki 3D
function computeArcGeometry(
  x1: number, // Start Z
  y1: number, // Start Promień (X/2)
  x2: number, // Koniec Z
  y2: number, // Koniec Promień (X/2)
  isClockwise: boolean, // G02 = true, G03 = false
  arc?: { i?: number; k?: number; r?: number }
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


   const sign = (isClockwise ? -1 : 1) * (arc.r > 0 ? 1 : -1)
    cx = mx - (sign * h * dy) / (d || 1)
    cy = my + (sign * h * dx) / (d || 1)
  } else {
    cx = x1 + (arc?.k || 0)
    cy = y1 + (arc?.i || 0)
  }

  const radius = Math.hypot(x1 - cx, y1 - cy)
  const startAngle = Math.atan2(y1 - cy, x1 - cx)
  let endAngle = Math.atan2(y2 - cy, x2 - cx)

  // Obliczamy różnicę kątową i wymuszamy właściwy kierunek obrotu
  let totalAngle = endAngle - startAngle
  if (isClockwise) {
    // G02 w układzie (Z=X_3D, R=Y_3D) dla tylnego imaka i R>0: wybieramy krótszy łuk (< PI)
    while (totalAngle <= -Math.PI) totalAngle += Math.PI * 2
    while (totalAngle > Math.PI) totalAngle -= Math.PI * 2
  } else {
    while (totalAngle <= -Math.PI) totalAngle += Math.PI * 2
    while (totalAngle > Math.PI) totalAngle -= Math.PI * 2
  }

  const arcLength = Math.max(0.001, Math.abs(totalAngle) * radius)

  return { cx, cy, startAngle, totalAngle, radius, arcLength }
}

export function LatheTool() {
  const meshRef = useRef<THREE.Group>(null)
  const activeTool = useMachineStore((state) => state.activeTool)
  const targetPosition = useMachineStore((state) => state.targetPosition)
  const arcParams = useMachineStore((state) => state.arcParams)
  const setCurrentPosition = useMachineStore((state) => state.setCurrentPosition)
  const feedRate = useMachineStore((state) => state.feedRate)
  const feedMode = useMachineStore((state) => state.feedMode)
  const actualRpm = useMachineStore((state) => state.actualRpm)
  const spindleSpeed = useMachineStore((state) => state.spindleSpeed)
  const motionMode = useMachineStore((state) => state.motionMode)
  const carveLatheProfile = useMachineStore((state) => state.carveLatheProfile)

  const isPlaying = useMachineStore((state) => state.isPlaying)
  const compiledSteps = useMachineStore((state) => state.compiledSteps)
  const currentStepIndex = useMachineStore((state) => state.currentStepIndex)
  const advanceStep = useMachineStore((state) => state.advanceStep)
  const pauseProgram = useMachineStore((state) => state.pauseProgram)

  const stockDiameter = useMachineStore((state) => state.stockDiameter)
  const showToolpath = useMachineStore((state) => state.showToolpath)

  const targetVec = useRef(new THREE.Vector3())
  const lastPos = useRef(new THREE.Vector2(1.0, 1.5))
  const arcRef = useRef<ArcState>({
    active: false,
    cx: 0,
    cy: 0,
    startAngle: 0,
    totalAngle: 0,
    radius: 0,
    arcLength: 0,
    progress: 1,
  })

  // --- GENEROWANIE LINII PODGLĄDU ŚCIEŻKI NARZĘDZIA (BACKPLOT) ---
  const { rapidGeo, cutGeo } = useMemo(() => {
    const rapidPts: THREE.Vector3[] = []
    const cutPts: THREE.Vector3[] = []

    let curZ = 1.0
    let curR = (stockDiameter + 1.0) / 2

    for (const step of compiledSteps) {
      const nextZ = step.target.z
      const nextR = step.target.x / 2

      if (step.motionMode === 'G0') {
        rapidPts.push(new THREE.Vector3(curZ, curR, 0.02))
        rapidPts.push(new THREE.Vector3(nextZ, nextR, 0.02))
      } else if (step.motionMode === 'G1') {
        cutPts.push(new THREE.Vector3(curZ, curR, 0.03))
        cutPts.push(new THREE.Vector3(nextZ, nextR, 0.03))
      } else if (step.motionMode === 'G2' || step.motionMode === 'G3') {
        const isCW = step.motionMode === 'G2'
        const { cx, cy, startAngle, totalAngle, radius } = computeArcGeometry(
          curZ,
          curR,
          nextZ,
          nextR,
          isCW,
          step.arc
        )
        const segments = 24
        let prevArcPt = new THREE.Vector3(curZ, curR, 0.03)
        for (let s = 1; s <= segments; s++) {
          const ang = startAngle + totalAngle * (s / segments)
          const pt = new THREE.Vector3(
            cx + Math.cos(ang) * radius,
            cy + Math.sin(ang) * radius,
            0.03
          )
          cutPts.push(prevArcPt, pt)
          prevArcPt = pt
        }
      }

      curZ = nextZ
      curR = nextR
    }

    return {
      rapidGeo: new THREE.BufferGeometry().setFromPoints(rapidPts),
      cutGeo: new THREE.BufferGeometry().setFromPoints(cutPts),
    }
  }, [compiledSteps, stockDiameter])

  useEffect(() => {
    return () => {
      rapidGeo.dispose()
      cutGeo.dispose()
    }
  }, [rapidGeo, cutGeo])

  useEffect(() => {
    if (meshRef.current) {
      const state = useMachineStore.getState()
      meshRef.current.position.set(state.currentPosition.z, state.currentPosition.x / 2, 0)
      lastPos.current.set(state.currentPosition.z, state.currentPosition.x / 2)
    }
  }, [])

  useEffect(() => {
    arcRef.current.active = false
    arcRef.current.progress = 0
  }, [targetPosition, arcParams, motionMode])

  useFrame((_, delta) => {
    if (!meshRef.current) return

    const targetZ = targetPosition.z
    const targetRadius = targetPosition.x / 2
    targetVec.current.set(targetZ, targetRadius, 0)

    const currentVec = meshRef.current.position
    lastPos.current.set(currentVec.x, currentVec.y)

    const rpm = actualRpm > 0 ? actualRpm : spindleSpeed > 0 ? spindleSpeed : 1000
    let speed = 5.0

    if (motionMode !== 'G0') {
      if (feedMode === 'G95') {
        const f = feedRate > 0 ? feedRate : 0.01
        speed = Math.max(0.2, (rpm * f) / 60)
      } else {
        const f = feedRate > 0 ? feedRate : 10
        speed = Math.max(0.2, f / 60)
      }
    }

    const distance = currentVec.distanceTo(targetVec.current)
    let isMoving = false

    if (motionMode === 'G0' || motionMode === 'G1' || !motionMode) {
      if (distance > 0.0001) {
        isMoving = true
        const step = Math.min(speed * delta, distance)
        const dir = targetVec.current.clone().sub(currentVec).normalize()
        currentVec.add(dir.multiplyScalar(step))
      }
    } else if (motionMode === 'G2' || motionMode === 'G3') {
      if (distance > 0.0001 && !arcRef.current.active && arcRef.current.progress < 1) {
        const isClockwise = motionMode === 'G2'
        const geom = computeArcGeometry(
          currentVec.x,
          currentVec.y,
          targetZ,
          targetRadius,
          isClockwise,
          arcParams
        )
        arcRef.current = {
          active: true,
          ...geom,
          progress: 0,
        }
        isMoving = true
      }

      if (arcRef.current.active && arcRef.current.progress < 1) {
        isMoving = true
        const arc = arcRef.current
        const stepPercent = (speed * delta) / arc.arcLength
        arc.progress = Math.min(1, arc.progress + stepPercent)

        if (arc.progress >= 1) {
          currentVec.set(targetZ, targetRadius, 0)
          arc.active = false
        } else {
          const currentAngle = arc.startAngle + arc.totalAngle * arc.progress
          currentVec.x = arc.cx + Math.cos(currentAngle) * arc.radius
          currentVec.y = arc.cy + Math.sin(currentAngle) * arc.radius
        }
      }
    }

    if (isMoving) {
      setCurrentPosition({
        x: currentVec.y * 2,
        y: 0,
        z: currentVec.x,
      })

      if (motionMode === 'G1' || motionMode === 'G2' || motionMode === 'G3') {
        carveLatheProfile(currentVec.x, currentVec.y, lastPos.current.x, lastPos.current.y)
      }
    } else {
      if (isPlaying) {
        if (currentStepIndex < compiledSteps.length - 1) {
          advanceStep()
        } else {
          pauseProgram()
        }
      }
    }
  })

  return (
    <>
      {/* WIZUALIZACJA LINII ŚCIEŻKI (G0 - pomarańczowy, G1/G2/G3 - zielony) */}
      {showToolpath && (
        <group>
          <lineSegments geometry={rapidGeo}>
            <lineBasicMaterial color="#f59e0b" transparent opacity={0.55} />
          </lineSegments>
          <lineSegments geometry={cutGeo}>
            <lineBasicMaterial color="#10b981" transparent opacity={0.95} />
          </lineSegments>
        </group>
      )}

      {/* NÓŻ TOKARSKI DCLNR / DCLNL */}
    <group ref={meshRef}>
        <group position={[0, 0, -0.34]}>
          <ToolModel toolNumber={activeTool}/>
        </group>
        <axesHelper args={[0.25]} />
      </group>
    </>
  )
}