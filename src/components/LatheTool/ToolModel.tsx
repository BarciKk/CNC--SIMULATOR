import { useMemo } from 'react'
import * as THREE from 'three'
import { useMachineStore } from '../../store'

function roundedPolygon(pts: THREE.Vector2[], r: number | number[]) {
  const shape = new THREE.Shape()
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const cur = pts[i]
    const next = pts[(i + 1) % n]
    const rad = Array.isArray(r) ? r[i] : r
    const a = cur.clone().sub(prev).normalize()
    const b = cur.clone().sub(next).normalize()
    const p1 = cur.clone().sub(a.multiplyScalar(rad))
    const p2 = cur.clone().sub(b.multiplyScalar(rad))
    if (i === 0) shape.moveTo(p1.x, p1.y)
    else shape.lineTo(p1.x, p1.y)
    shape.quadraticCurveTo(cur.x, cur.y, p2.x, p2.y)
  }
  shape.closePath()
  return shape
}

function createInsertRhombus(
  L: number,
  leadDeg: number,
  noseDeg: number,
  mirror: 1 | -1 = 1
) {
  const leadRad = THREE.MathUtils.degToRad(leadDeg)
  const trailRad = THREE.MathUtils.degToRad(leadDeg - noseDeg)

  const vLead = new THREE.Vector2(mirror * L * Math.cos(leadRad), L * Math.sin(leadRad))
  const vTrail = new THREE.Vector2(mirror * L * Math.cos(trailRad), L * Math.sin(trailRad))
  const tip = new THREE.Vector2(0, 0)
  const back = vLead.clone().add(vTrail)

  return mirror === 1 ? [tip, vTrail, back, vLead] : [tip, vLead, back, vTrail]
}

export function ToolModel({ toolNumber = 1 }: { toolNumber?: number }) {
  const toolConfig = useMachineStore(
    (state) => state.toolLibrary[toolNumber] || state.toolLibrary[1]
  )
  const type = toolConfig?.type || 'DCLNR'
  const topZ = 0.25

  const turningGeos = useMemo(() => {
    const buildTool = (
      L: number,
      leadDeg: number,
      noseDeg: number,
      mirror: 1 | -1
    ) => {
      const pts = createInsertRhombus(L, leadDeg, noseDeg, mirror)
      const insertShape = roundedPolygon(pts, [0.018, 0.025, 0.025, 0.025])
      const insertGeo = new THREE.ExtrudeGeometry(insertShape, {
        depth: 0.1,
        bevelEnabled: false,
      })

      const holderShape = new THREE.Shape()
      if (mirror === 1) {
        holderShape.moveTo(0.02, 0.08)
        holderShape.lineTo(0.08, 0.55)
        holderShape.lineTo(0.0, 0.95)
        holderShape.lineTo(0.0, 3.0)
        holderShape.lineTo(0.55, 3.0)
        holderShape.lineTo(0.55, 0.45)
        holderShape.lineTo(0.32, 0.08)
      } else {
        holderShape.moveTo(-0.02, 0.08)
        holderShape.lineTo(-0.32, 0.08)
        holderShape.lineTo(-0.55, 0.45)
        holderShape.lineTo(-0.55, 3.0)
        holderShape.lineTo(0.0, 3.0)
        holderShape.lineTo(0.0, 0.95)
        holderShape.lineTo(-0.08, 0.55)
      }
      holderShape.closePath()

      const holderGeo = new THREE.ExtrudeGeometry(holderShape, {
        depth: 0.46,
        bevelEnabled: false,
      })
      holderGeo.translate(0, 0, -0.23)

      return { holderGeo, insertGeo, center: pts[2].clone().multiplyScalar(0.5) }
    }

    return {
      DCLNR: buildTool(0.38, 85, 80, 1),
      SVJBR: buildTool(0.44, 87, 35, 1),
      SVJBL: buildTool(0.44, 87, 35, -1),
    }
  }, [])

  // --- 1. UCINAK LISTWA W OPRAWCE BLOKOWEJ (GROOVE) ---
  if (type === 'GROOVE') {
    const w = Math.max(0.03, Math.min(0.4, toolConfig.width || 0.10))
    return (
      <group position={[0, 0, topZ + 0.09]}>
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[w, 0.28, 0.14]} />
          <meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.65, -0.02]}>
          <boxGeometry args={[w * 0.9, 1.1, 0.12]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.85} roughness={0.3} />
        </mesh>
        <mesh position={[0.1, 1.95, -0.14]}>
          <boxGeometry args={[0.65, 1.8, 0.5]} />
          <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.4} />
        </mesh>
      </group>
    )
  }

  // --- 2. NÓŻ DO GWINTOWANIA 60° (THREAD) ---
  if (type === 'THREAD') {
    return (
      <group position={[0, 0, topZ + 0.09]}>
        <mesh position={[0, 0.16, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.18, 0.32, 3]} />
          <meshStandardMaterial color="#e5c158" metalness={0.75} roughness={0.2} />
        </mesh>
        <mesh position={[0.2, 1.65, -0.15]}>
          <boxGeometry args={[0.52, 2.7, 0.44]} />
          <meshStandardMaterial color="#4b5563" metalness={0.85} roughness={0.35} />
        </mesh>
      </group>
    )
  }

  // --- 3. WIERTŁO Z REGULOWANĄ ŚREDNICĄ I KĄTEM 140° (DRILL) ---
  if (type === 'DRILL') {
    const dia = Math.max(0.1, Math.min(3.0, toolConfig.diameter || 0.5))
    const r = dia / 2
    const angleRad = ((toolConfig.pointAngle || 140) * Math.PI) / 180
    const coneH = Math.max(0.04, r / Math.tan(angleRad / 2))

    return (
      <group position={[0, 0, topZ + 0.09]}>
        <mesh position={[coneH / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[r, coneH, 16]} />
          <meshStandardMaterial color="#d4af37" metalness={0.75} roughness={0.25} />
        </mesh>
        <mesh position={[coneH + 1.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[r, r, 2.5, 16]} />
          <meshStandardMaterial color="#374151" metalness={0.85} roughness={0.3} />
        </mesh>
        <mesh position={[coneH + 2.7, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[r + 0.22, r + 0.22, 0.7, 16]} />
          <meshStandardMaterial color="#111827" metalness={0.85} roughness={0.35} />
        </mesh>
      </group>
    )
  }

  // --- 4. WYTACZAK WEWNĘTRZNY S-SCLCR (6mm / 8mm / 12mm / 16mm / 20mm) ---
  if (type === 'SCLCR') {
    const barMM = toolConfig.boringBarMM || 12
    // Mapujemy 6..20 mm na wizualny promień trzonka 0.07..0.22 (niezależnie od wiertła!)
    const barRad = (barMM / 25.4) * 0.45
    const insertSize = Math.max(0.12, barRad * 1.35)

    return (
      <group position={[0, 0, topZ + 0.09]}>
        {/* Złota płytka skrawająca CCMT na czubku wytaczaka (ostrze w punkcie (0,0) skierowane w górę +X!) */}
        <mesh position={[insertSize * 0.45, -insertSize * 0.3, 0]} rotation={[0, 0, -Math.PI / 8]}>
          <boxGeometry args={[insertSize, insertSize * 0.75, 0.08]} />
          <meshStandardMaterial color="#d4af37" metalness={0.75} roughness={0.22} />
        </mesh>
        {/* Stalowy cylindryczny trzonek wytaczaka (S06 / S08 / S12 / S16 / S20) */}
        <mesh position={[1.35, -barRad * 0.85, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[barRad, barRad, 2.6, 16]} />
          <meshStandardMaterial color="#6b7280" metalness={0.9} roughness={0.25} />
        </mesh>
        {/* Tuleja redukcyjna i blok oprawki VDI */}
        <mesh position={[2.8, 0.1, 0]}>
          <boxGeometry args={[0.65, 1.05, 0.65]} />
          <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.4} />
        </mesh>
      </group>
    )
  }

  // --- 5. NOŻE TOKARSKIE ZEWNĘTRZNE: DCLNR / SVJBR / SVJBL ---
  const activeGeo =
    type === 'SVJBR'
      ? turningGeos.SVJBR
      : type === 'SVJBL'
      ? turningGeos.SVJBL
      : turningGeos.DCLNR

  return (
    <group>
      <mesh geometry={activeGeo.holderGeo}>
        <meshStandardMaterial color="#6b7280" metalness={0.85} roughness={0.35} />
      </mesh>
      <mesh geometry={activeGeo.insertGeo} position={[0, 0, topZ + 0.03]}>
        <meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh
        position={[activeGeo.center.x, activeGeo.center.y, topZ + 0.14]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.045, 0.045, 0.03, 12]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
    </group>
  )
}