import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMachineStore } from '../../store'
import type { CutSegment } from '../../store/useMachineStore'

const STOCK_SIZE_X = 4.0
const STOCK_SIZE_Y = 4.0
const STOCK_HEIGHT = 1.0
const GRID_RES = 160 // Rozdzielczość siatki 160x160 = 25 600 punktów pomiarowych
const TOOL_RADIUS = 0.25 // Promień frezu Ø0.5

// Oblicza minimalną odległość punktu (px, py) w płaszczyźnie XY od odcinka ruchu frezu (x1,y1)->(x2,y2)
// oraz zwraca interpolowaną głębokość Z frezu w tym punkcie
function getCutDepthAtPoint(
  px: number,
  py: number,
  seg: CutSegment
): number | null {
  const x1 = seg.start.x
  const y1 = seg.start.y
  const z1 = seg.start.z
  const x2 = seg.end.x
  const y2 = seg.end.y
  const z2 = seg.end.z

  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy

  let t = 0
  if (lenSq > 0.000001) {
    t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  }

  const nearX = x1 + t * dx
  const nearY = y1 + t * dy
  const distSq = (px - nearX) * (px - nearX) + (py - nearY) * (py - nearY)

  if (distSq <= TOOL_RADIUS * TOOL_RADIUS) {
    // Interpolowana wysokość dna frezu wzdłuż ścieżki (obsługuje też rampy 3D!)
    return z1 + t * (z2 - z1)
  }
  return null
}

export function Workpiece() {
  const topMeshRef = useRef<THREE.Mesh>(null)
  const processedCountRef = useRef<number>(0)

  const viewMode = useMachineStore((state) => state.workpieceViewMode)
  const completedCuts = useMachineStore((state) => state.completedCuts)

  // Tworzymy geometrię górnej powierzchni roboczej z buforem kolorów (surowy vs skrawany metal)
  const topGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(STOCK_SIZE_X, STOCK_SIZE_Y, GRID_RES, GRID_RES)
    // Obracamy do poziomu stołu XY i przesuwamy tak, by narożnik (0,0,0) był bazą G54
    geo.rotateX(-Math.PI / 2)
    geo.translate(STOCK_SIZE_X / 2, 0, -STOCK_SIZE_Y / 2)

    const count = geo.attributes.position.count
    const colors = new Float32Array(count * 3)
    const rawColor = new THREE.Color('#7a828e')

    for (let i = 0; i < count; i++) {
      colors[i * 3] = rawColor.r
      colors[i * 3 + 1] = rawColor.g
      colors[i * 3 + 2] = rawColor.b
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [])

  useEffect(() => {
    return () => {
      topGeometry.dispose()
    }
  }, [topGeometry])

  const applySegmentToGrid = (seg: CutSegment) => {
    if (seg.start.z >= 0 && seg.end.z >= 0) return false

    const posAttr = topGeometry.attributes.position as THREE.BufferAttribute
    const colAttr = topGeometry.attributes.color as THREE.BufferAttribute

    const minX = Math.min(seg.start.x, seg.end.x) - TOOL_RADIUS - 0.05
    const maxX = Math.max(seg.start.x, seg.end.x) + TOOL_RADIUS + 0.05
    const minY = Math.min(seg.start.y, seg.end.y) - TOOL_RADIUS - 0.05
    const maxY = Math.max(seg.start.y, seg.end.y) + TOOL_RADIUS + 0.05

    // Szybki odrzut poza obrysem kostki
    if (maxX < 0 || minX > STOCK_SIZE_X || maxY < 0 || minY > STOCK_SIZE_Y) return false

    // Wyliczamy tylko indeksy siatki w otoczeniu frezu (zamiast pętli po wszystkich 25 600 punktach!)
    const colStart = Math.max(0, Math.floor((minX / STOCK_SIZE_X) * GRID_RES))
    const colEnd = Math.min(GRID_RES, Math.ceil((maxX / STOCK_SIZE_X) * GRID_RES))

    // W PlaneGeometry po rotateX(-PI/2) wiersz 0 to Z = -STOCK_SIZE_Y (czyli maszynowe Y = +4),
    // a wiersz GRID_RES to Z = 0 (maszynowe Y = 0)
    const rowStart = Math.max(0, Math.floor(((STOCK_SIZE_Y - maxY) / STOCK_SIZE_Y) * GRID_RES))
    const rowEnd = Math.min(GRID_RES, Math.ceil(((STOCK_SIZE_Y - minY) / STOCK_SIZE_Y) * GRID_RES))

    const stride = GRID_RES + 1
    let modified = false

    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        const idx = r * stride + c
        const vx = posAttr.getX(idx)
        const vy = posAttr.getY(idx) // Aktualna wysokość Z materiału w tym punkcie
        const vz = posAttr.getZ(idx)
        const machY = -vz

        const cutZ = getCutDepthAtPoint(vx, machY, seg)
        if (cutZ !== null) {
          const clampedZ = Math.max(-STOCK_HEIGHT, cutZ)
          if (clampedZ < vy - 0.0005) {
            posAttr.setY(idx, clampedZ)
            // Nadajemy wyfrezowanej powierzchni jasny, metaliczny połysk
            colAttr.setXYZ(idx, 0.78, 0.83, 0.89)
            modified = true
          }
        }
      }
    }

    return modified
  }

  // Obsługa RESETU detalu (gdy wyczyszczono completedCuts)
  useEffect(() => {
    if (completedCuts.length === 0 && processedCountRef.current > 0) {
      const posAttr = topGeometry.attributes.position as THREE.BufferAttribute
      const colAttr = topGeometry.attributes.color as THREE.BufferAttribute
      const rawColor = new THREE.Color('#7a828e')

      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setY(i, 0)
        colAttr.setXYZ(i, rawColor.r, rawColor.g, rawColor.b)
      }
      posAttr.needsUpdate = true
      colAttr.needsUpdate = true
      topGeometry.computeVertexNormals()
      processedCountRef.current = 0
    }
  }, [completedCuts.length, topGeometry])

  // Pętla skrawania 60 FPS (aktualizuje wyłącznie miejsce pod frezem!)
  useFrame(() => {
    const state = useMachineStore.getState()
    let needsNormalsUpdate = false

    // 1. Przetwarzamy nowe zakończone odcinki
    while (processedCountRef.current < state.completedCuts.length) {
      const cut = state.completedCuts[processedCountRef.current]
      if (applySegmentToGrid(cut)) needsNormalsUpdate = true
      processedCountRef.current++
    }

    // 2. Przetwarzamy aktualnie trwający ruch frezu na żywo
    if (state.activeCut) {
      if (applySegmentToGrid(state.activeCut)) needsNormalsUpdate = true
    }

    if (needsNormalsUpdate) {
      topGeometry.attributes.position.needsUpdate = true
      topGeometry.attributes.color.needsUpdate = true
      topGeometry.computeVertexNormals()
    }
  })

  const isGhost = viewMode !== 'solid'

  return (
    <group>
      {/* Punkt zerowy detalu G54 (X=0, Y=0, Z=0) */}
      <axesHelper args={[0.8]} position={[0, 0.01, 0]} />

      {/* Górna, dynamicznie frezowana powierzchnia 2.5D */}
      <mesh ref={topMeshRef} geometry={topGeometry}>
        <meshStandardMaterial
          vertexColors
          metalness={0.55}
          roughness={0.35}
          transparent={isGhost}
          opacity={isGhost ? 0.45 : 1.0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Korpus boczny i podstawa kostki półfabrykatu */}
      <mesh position={[STOCK_SIZE_X / 2, -STOCK_HEIGHT / 2 - 0.002, -STOCK_SIZE_Y / 2]}>
        <boxGeometry args={[STOCK_SIZE_X - 0.01, STOCK_HEIGHT, STOCK_SIZE_Y - 0.01]} />
        <meshStandardMaterial
          color="#586069"
          metalness={0.45}
          roughness={0.6}
          transparent={isGhost}
          opacity={isGhost ? 0.35 : 1.0}
        />
      </mesh>
    </group>
  )
}