import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useMachineStore } from '../../store'

export function LatheWorkpiece() {
  const spindleGroupRef = useRef<THREE.Group>(null)

  const stockDiameter = useMachineStore((state) => state.stockDiameter)
  const stockLength = useMachineStore((state) => state.stockLength)
  const latheProfile = useMachineStore((state) => state.latheProfile)
  const innerProfile = useMachineStore((state) => state.innerProfile)
  const isPlaying = useMachineStore((state) => state.isPlaying)
  const spindleSpeed = useMachineStore((state) => state.spindleSpeed)
  const spindleDir = useMachineStore((state) => state.spindleDir)
  const viewMode = useMachineStore((state) => state.workpieceViewMode)

  // Pojedyncza, lekka geometria szczęki schodkowej (wyliczana tylko 1 raz w pamięci!)
  const steppedJawGeo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.lineTo(1.2, 0)
    s.lineTo(1.2, 0.45)
    s.lineTo(0.8, 0.45)
    s.lineTo(0.8, 0.72)
    s.lineTo(0.42, 0.72)
    s.lineTo(0.42, 0.95)
    s.lineTo(0, 0.95)
    s.closePath()

    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.38, bevelEnabled: false })
    geo.translate(0, 0, -0.19)
    return geo
  }, [])

  // Geometria wałka z mniejszą liczbą segmentów obwodowych (36 zamiast 64 = 2x szybciej na słabszym GPU!)
  const geometry = useMemo(() => {
    const points: THREE.Vector2[] = []
    const steps = latheProfile.length

    points.push(new THREE.Vector2(innerProfile[0], 0))
    for (let i = 0; i < steps; i++) {
      const zPos = (i / (steps - 1)) * stockLength
      const radius = Math.max(innerProfile[i], latheProfile[i])
      points.push(new THREE.Vector2(radius, zPos))
    }

    for (let i = steps - 1; i >= 0; i--) {
      const zPos = (i / (steps - 1)) * stockLength
      const inRadius = Math.max(0, innerProfile[i])
      points.push(new THREE.Vector2(inRadius, zPos))
    }

    const phiStart = viewMode === 'section' ? Math.PI : 0
    const phiLength = viewMode === 'section' ? Math.PI : Math.PI * 2

    const geo = new THREE.LatheGeometry(points, 36, phiStart, phiLength)
    geo.computeVertexNormals()
    return geo
  }, [latheProfile, innerProfile, stockLength, viewMode])

  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  // Obrót uchwytu z uwzględnieniem kierunku M03 (CW) vs M04 (CCW)
  useFrame((_, delta) => {
    if (spindleGroupRef.current && isPlaying && spindleSpeed > 0 && spindleDir !== 'M05') {
      const dirSign = spindleDir === 'M03' ? -1 : 1
      spindleGroupRef.current.rotation.x += dirSign * delta * 14
    }
  })

  const stockRadius = stockDiameter / 2
  const isM04 = spindleDir === 'M04'

  return (
    <group>
      {/* PRZERYWANA LINIA OSI SYMETRII WRZECIONA */}
      <Line
        points={[
          [-stockLength - 1.5, 0, 0],
          [1.5, 0, 0],
        ]}
        color="#ef4444"
        lineWidth={1.5}
        dashed
        dashSize={0.2}
        gapSize={0.12}
      />

      {/* LEKKI UCHWYT 3-SZCZĘKOWY + ODWRÓCONA STRZAŁKA OBROTÓW M03 / M04 */}
      <group ref={spindleGroupRef} position={[-stockLength, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <mesh position={[0, -0.75, 0]}>
          <cylinderGeometry args={[2.3, 2.3, 1.2, 24]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.35} />
        </mesh>

        {[0, 1, 2].map((i) => {
          const angle = (i * Math.PI * 2) / 3
          return (
            <mesh
              key={i}
              geometry={steppedJawGeo}
              position={[Math.cos(angle) * stockRadius, -0.15, Math.sin(angle) * stockRadius]}
              rotation={[0, -angle, 0]}
            >
              <meshStandardMaterial color="#18181b" metalness={0.85} roughness={0.35} />
            </mesh>
          )
        })}

        {/* WIZUALNY PIERŚCIEŃ KIERUNKU OBROTÓW WRZECIONA (Skorygowany grot strzałki!) */}
        {spindleDir !== 'M05' && (
          <group position={[0, -0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh>
              <ringGeometry args={[2.0, 2.18, 24, 1, 0, Math.PI * 1.35]} />
              <meshBasicMaterial
                color={isM04 ? '#ef4444' : '#10b981'}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Grot strzałki na początku łuku (dla M03 wskazuje obrót przodu uchwytu w dół do operatora) */}
            <mesh
              position={[2.09, 0.15, 0]}
              rotation={[0, 0, isM04 ? Math.PI : 0]}
            >
              <coneGeometry args={[0.22, 0.42, 3]} />
              <meshBasicMaterial color={isM04 ? '#ef4444' : '#10b981'} />
            </mesh>
          </group>
        )}
      </group>

      {/* MATERIAŁ SKRAWANY */}
      <mesh position={[-stockLength, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <primitive object={geometry} attach="geometry" />
        <meshStandardMaterial
          color="#a0a5b0"
          metalness={0.6}
          roughness={0.28}
          transparent={viewMode === 'transparent'}
          opacity={viewMode === 'transparent' ? 0.38 : 1.0}
          depthWrite={viewMode !== 'transparent'}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}