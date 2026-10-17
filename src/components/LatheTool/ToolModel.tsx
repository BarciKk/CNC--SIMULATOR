import { useMemo } from 'react'
import * as THREE from 'three'

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

function dclnRhombus(L: number, scale = 1) {
  const s = L * scale
  const leadAngle = THREE.MathUtils.degToRad(85)
  const trailAngle = THREE.MathUtils.degToRad(5)

  const vLead = new THREE.Vector2(s * Math.cos(leadAngle), s * Math.sin(leadAngle))
  const vTrail = new THREE.Vector2(s * Math.cos(trailAngle), s * Math.sin(trailAngle))
  const tip = new THREE.Vector2(0, 0)
  const backCorner = vLead.clone().add(vTrail)

  return [tip, vTrail, backCorner, vLead]
}

function edgesOf(geo: THREE.BufferGeometry, angle = 30) {
  return new THREE.EdgesGeometry(geo, angle)
}

export function ToolModel({ toolNumber = 1 }: { toolNumber?: number }) {
  const topZ = 0.25

  // Geometria dla T0101 (DCLNR 95°)
  const dclnrData = useMemo(() => {
    const L = 0.38
    const pts = dclnRhombus(L, 1)
    const center = pts[2].clone().multiplyScalar(0.5)

    const holderDepth = 0.5
    const holderShape = new THREE.Shape()
    holderShape.moveTo(0.03, 0.08)
    holderShape.lineTo(0.06, 0.45)
    holderShape.lineTo(-0.02, 0.85)
    holderShape.lineTo(-0.02, 3.2)
    holderShape.lineTo(0.58, 3.2)
    holderShape.lineTo(0.58, 0.38)
    holderShape.lineTo(0.38, 0.06)
    holderShape.closePath()

    const holderGeo = new THREE.ExtrudeGeometry(holderShape, {
      depth: holderDepth,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      bevelSegments: 1,
    })
    holderGeo.translate(0, 0, -holderDepth / 2)

    const insertShape = roundedPolygon(pts, [0.025, 0.03, 0.03, 0.03])
    const insertGeo = new THREE.ExtrudeGeometry(insertShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelSize: 0.01,
      bevelThickness: 0.01,
      bevelOffset: -0.01,
      bevelSegments: 1,
    })

    return {
      holderGeo,
      holderEdges: edgesOf(holderGeo),
      insertGeo,
      insertEdges: edgesOf(insertGeo, 25),
      insertCenter: center,
    }
  }, [])

  // --- T0202: NÓŻ ROWKUJĄCY / PRZECINAK (MGEHR) ---
  if (toolNumber === 2) {
    return (
      <group position={[0, 0, topZ + 0.09]}>
        {/* Trzonek oprawki rowkującej */}
        <mesh position={[0.15, 1.8, -0.15]}>
          <boxGeometry args={[0.5, 2.8, 0.45]} />
          <meshStandardMaterial color="#4b5563" metalness={0.85} roughness={0.35} />
        </mesh>
        {/* Pióro podtrzymujące płytkę */}
        <mesh position={[0, 0.35, -0.05]}>
          <boxGeometry args={[0.1, 0.65, 0.25]} />
          <meshStandardMaterial color="#374151" metalness={0.9} roughness={0.3} />
        </mesh>
        {/* Wąska złota płytka rowkująca MGMN (krawędź skrawająca w Y=0) */}
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[0.12, 0.28, 0.16]} />
          <meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.25} />
        </mesh>
      </group>
    )
  }

  // --- T0303: NÓŻ DO GWINTOWANIA ZEWNĘTRZNEGO 60° (SER / ER16) ---
  if (toolNumber === 3) {
    return (
      <group position={[0, 0, topZ + 0.09]}>
        {/* Trzonek noża gwintującego */}
        <mesh position={[0.2, 1.7, -0.15]}>
          <boxGeometry args={[0.55, 2.8, 0.45]} />
          <meshStandardMaterial color="#6b7280" metalness={0.85} roughness={0.35} />
        </mesh>
        {/* Trójkątna płytka gwintująca 60° skierowana czubkiem w (0,0) */}
        <mesh position={[0, 0.16, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.18, 0.32, 3]} />
          <meshStandardMaterial color="#e5c158" metalness={0.75} roughness={0.2} />
        </mesh>
      </group>
    )
  }

  // --- T0404: WIERTŁO OSIOWE (U-DRILL / WIERTŁO KRĘTE WZDŁUŻ OSI Z) ---
  if (toolNumber === 4) {
    return (
      <group position={[0, 0, topZ + 0.09]}>
        {/* Stożkowy czubek wiertła w punkcie (0,0) skierowany w -X (czyli w głąb wałka -Z!) */}
        <mesh position={[0.12, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.24, 0.24, 24]} />
          <meshStandardMaterial color="#d4af37" metalness={0.75} roughness={0.2} />
        </mesh>
        {/* Korpus roboczy wiertła z rowkami wiórowymi */}
        <mesh position={[1.45, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.24, 0.24, 2.5, 24]} />
          <meshStandardMaterial color="#374151" metalness={0.85} roughness={0.3} />
        </mesh>
        {/* Oprawka wiertarska VDI/BMT z tyłu */}
        <mesh position={[2.9, 0.3, 0]}>
          <boxGeometry args={[0.7, 1.2, 0.7]} />
          <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.4} />
        </mesh>
      </group>
    )
  }

  // --- T0505: WYTACZAK DO OBRÓBKI WEWNĘTRZNEJ (S-SCLCR) ---
  if (toolNumber === 5) {
    return (
      <group position={[0, 0, topZ + 0.09]}>
        {/* Płytka CCMT na końcu wytaczaka skierowana czubkiem w górę (+X) do roztaczania otworu */}
        <mesh position={[0.08, -0.06, 0]} rotation={[0, 0, -Math.PI / 6]}>
          <boxGeometry args={[0.22, 0.14, 0.1]} />
          <meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.25} />
        </mesh>
        {/* Cylindryczny trzonek wytaczaka wchodzący poziomo do otworu */}
        <mesh position={[1.4, -0.14, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.14, 0.16, 2.6, 24]} />
          <meshStandardMaterial color="#4b5563" metalness={0.9} roughness={0.25} />
        </mesh>
        {/* Tuleja mocująca wytaczak */}
        <mesh position={[2.8, 0.2, 0]}>
          <boxGeometry args={[0.6, 1.1, 0.6]} />
          <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.4} />
        </mesh>
      </group>
    )
  }

  // --- DOMYŚLNIE (T0101): NÓŻ ZEWNĘTRZNY DCLNR 95° ---
  return (
    <group>
      <mesh geometry={dclnrData.holderGeo}>
        <meshStandardMaterial color="#8b939e" metalness={0.85} roughness={0.35} />
      </mesh>
      <lineSegments geometry={dclnrData.holderEdges}>
        <lineBasicMaterial color="#374151" />
      </lineSegments>

      <mesh position={[0.28, 2.55, topZ + 0.003]}>
        <boxGeometry args={[0.58, 0.45, 0.004]} />
        <meshStandardMaterial color="#0a3d91" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0.28, 2.25, topZ + 0.003]}>
        <boxGeometry args={[0.58, 0.06, 0.004]} />
        <meshStandardMaterial color="#f5b700" metalness={0.3} roughness={0.5} />
      </mesh>

      <mesh geometry={dclnrData.insertGeo} position={[0, 0, topZ + 0.03]}>
        <meshStandardMaterial color="#d4af37" metalness={0.65} roughness={0.25} />
      </mesh>
      <lineSegments geometry={dclnrData.insertEdges} position={[0, 0, topZ + 0.03]}>
        <lineBasicMaterial color="#6b5410" />
      </lineSegments>

      <mesh
        position={[
          dclnrData.insertCenter.x + 0.14,
          dclnrData.insertCenter.y + 0.18,
          topZ + 0.11,
        ]}
        rotation={[0, 0, -Math.PI / 4]}
      >
        <boxGeometry args={[0.12, 0.28, 0.12]} />
        <meshStandardMaterial color="#4b5563" metalness={0.85} roughness={0.35} />
      </mesh>
    </group>
  )
}