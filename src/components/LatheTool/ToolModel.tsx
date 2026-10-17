import { useMemo } from 'react'
import * as THREE from 'three'

export type HolderHand = 'DCLNR' | 'DCLNL'

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

/**
 * Romb 80° (CNMG) ustawiony pod kątem przystawienia 95° (standard DCLNR / DCLNL)
 * Czubek skrawający spoczywa dokładnie w (0, 0).
 * Dla DCLNR (prawy nóż, posuw w -Z):
 * - Główna krawędź skrawająca (lewa): kąt 85° od poziomu (5° luzu od pionowego progu!)
 * - Pomocnicza krawędź skrawająca (prawa/dolna): kąt 5° od poziomu (5° luzu od średnicy!)
 * - Dwusieczna naroża 80° jest skierowana pod kątem 45° w górę i w prawo.
 */
function dclnRhombus(L: number, hand: HolderHand = 'DCLNR', scale = 1) {
  const s = L * scale
  const mirror = hand === 'DCLNR' ? 1 : -1

  // Kąty obu krawędzi wychodzących z czubka (0,0)
  const leadAngle = THREE.MathUtils.degToRad(85) // 95° przystawienia = 85° od osi +Z
  const trailAngle = THREE.MathUtils.degToRad(5) // 5° luzu od wytoczonej powierzchni

  const vLead = new THREE.Vector2(
    mirror * s * Math.cos(leadAngle),
    s * Math.sin(leadAngle)
  )
  const vTrail = new THREE.Vector2(
    mirror * s * Math.cos(trailAngle),
    s * Math.sin(trailAngle)
  )

  const tip = new THREE.Vector2(0, 0)
  const backCorner = vLead.clone().add(vTrail)

  // Dla zachowania poprawnej orientacji ścieżki (CCW/CW)
  return hand === 'DCLNR'
    ? [tip, vTrail, backCorner, vLead]
    : [tip, vLead, backCorner, vTrail]
}

function edgesOf(geo: THREE.BufferGeometry, angle = 30) {
  return new THREE.EdgesGeometry(geo, angle)
}

export function ToolModel({ hand = 'DCLNR' }: { hand?: HolderHand }) {
  const L = 0.38 // Długość krawędzi płytki CNMG 1204
  const mirror = hand === 'DCLNR' ? 1 : -1

  const {
    holderGeo,
    holderEdges,
    insertGeo,
    insertEdges,
    shimGeo,
    insertCenter,
  } = useMemo(() => {
    const pts = dclnRhombus(L, hand, 1)
    const center = pts[2].clone().multiplyScalar(0.5)

    // --- OPRAWKA DCLNR / DCLNL (z odsadzoną głowicą pod kątem 95°) ---
    const holderDepth = 0.5
    const holderShape = new THREE.Shape()

    if (hand === 'DCLNR') {
      // Lewa ścianka z podcięciem 95°, trzonek przesunięty w prawo, by nie ocierać o detal
      holderShape.moveTo(0.03, 0.08)
      holderShape.lineTo(0.06, 0.45)  // Krawędź natarcia oprawki (kąt 95°)
      holderShape.lineTo(-0.02, 0.85) // Przejście w trzonek 25x25
      holderShape.lineTo(-0.02, 3.2)  // Lewy bok trzonka
      holderShape.lineTo(0.58, 3.2)   // Góra trzonka
      holderShape.lineTo(0.58, 0.38)  // Prawy bok trzonka
      holderShape.lineTo(0.38, 0.06)  // Dolne podcięcie pod płytką (luz 5°)
    } else {
      holderShape.moveTo(-0.03, 0.08)
      holderShape.lineTo(-0.38, 0.06)
      holderShape.lineTo(-0.58, 0.38)
      holderShape.lineTo(-0.58, 3.2)
      holderShape.lineTo(0.02, 3.2)
      holderShape.lineTo(0.02, 0.85)
      holderShape.lineTo(-0.06, 0.45)
    }
    holderShape.closePath()

    const holderGeo = new THREE.ExtrudeGeometry(holderShape, {
      depth: holderDepth,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      bevelSegments: 1,
    })
    holderGeo.translate(0, 0, -holderDepth / 2)

    // --- PŁYTKA CNMG 80° ---
    const insertThickness = 0.12
    const insertShape = roundedPolygon(pts, [0.025, 0.03, 0.03, 0.03])
    const insertGeo = new THREE.ExtrudeGeometry(insertShape, {
      depth: insertThickness,
      bevelEnabled: true,
      bevelSize: 0.01,
      bevelThickness: 0.01,
      bevelOffset: -0.01,
      bevelSegments: 1,
    })

    // --- PODKŁADKA WĘGLIKOWA (SHIM) ---
    const shimPts = dclnRhombus(L, hand, 0.92).map((p) =>
      p.clone().add(new THREE.Vector2(mirror * 0.015, 0.015))
    )
    const shimShape = roundedPolygon(shimPts, 0.02)
    const shimGeo = new THREE.ExtrudeGeometry(shimShape, {
      depth: 0.03,
      bevelEnabled: false,
    })

    return {
      holderGeo,
      holderEdges: edgesOf(holderGeo),
      insertGeo,
      insertEdges: edgesOf(insertGeo, 25),
      shimGeo,
      insertCenter: center,
    }
  }, [hand, L, mirror])

  const topZ = 0.25

  return (
    <group>
      {/* Korpus oprawki DCLNR/L */}
      <mesh geometry={holderGeo}>
        <meshStandardMaterial color="#8b939e" metalness={0.85} roughness={0.35} />
      </mesh>
      <lineSegments geometry={holderEdges}>
        <lineBasicMaterial color="#374151" />
      </lineSegments>

      {/* Oznaczenie kolorystyczne na trzonku */}
      <mesh position={[mirror * 0.28, 2.55, topZ + 0.003]}>
        <boxGeometry args={[0.58, 0.45, 0.004]} />
        <meshStandardMaterial color="#0a3d91" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[mirror * 0.28, 2.25, topZ + 0.003]}>
        <boxGeometry args={[0.58, 0.06, 0.004]} />
        <meshStandardMaterial color="#f5b700" metalness={0.3} roughness={0.5} />
      </mesh>

      {/* Podkładka pod płytką */}
      <mesh geometry={shimGeo} position={[0, 0, topZ]}>
        <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.45} />
      </mesh>

      {/* Płytka skrawająca CNMG pod kątem 95° */}
      <mesh geometry={insertGeo} position={[0, 0, topZ + 0.03]}>
        <meshStandardMaterial color="#d4af37" metalness={0.65} roughness={0.25} />
      </mesh>
      <lineSegments geometry={insertEdges} position={[0, 0, topZ + 0.03]}>
        <lineBasicMaterial color="#6b5410" />
      </lineSegments>

      {/* Śruba centralna i docisk klinowy DCLN (łapa dociskowa od góry pod kątem 45°) */}
      <group
        position={[insertCenter.x, insertCenter.y, topZ + 0.03 + 0.12]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.065, 0.065, 0.04, 24]} />
          <meshStandardMaterial color="#111827" metalness={0.9} roughness={0.3} />
        </mesh>
      </group>

      {/* Charakterystyczna łapa dociskowa systemu D (DCLNR) */}
      <mesh
        position={[insertCenter.x + mirror * 0.14, insertCenter.y + 0.18, topZ + 0.11]}
        rotation={[0, 0, mirror * -Math.PI / 4]}
      >
        <boxGeometry args={[0.12, 0.28, 0.12]} />
        <meshStandardMaterial color="#4b5563" metalness={0.85} roughness={0.35} />
      </mesh>
    </group>
  )
}