import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useMachineStore } from '../../store'

export function LatheWorkpiece() {
  const spindleGroupRef = useRef<THREE.Group>(null)

  const stockDiameter = useMachineStore((state) => state.stockDiameter)
  const stockLength = useMachineStore((state) => state.stockLength)
  const latheProfile = useMachineStore((state) => state.latheProfile)
  const innerProfile = useMachineStore((state) => state.innerProfile)
  const isPlaying = useMachineStore((state) => state.isPlaying)
  const spindleSpeed = useMachineStore((state) => state.spindleSpeed)
  const viewMode = useMachineStore((state) => state.workpieceViewMode)

  const geometry = useMemo(() => {
    const points: THREE.Vector2[] = []
    const steps = latheProfile.length

    // 1. Profil zewnętrzny (od uchwytu Z=0 do czoła Z=stockLength)
    points.push(new THREE.Vector2(innerProfile[0], 0))
    for (let i = 0; i < steps; i++) {
      const zPos = (i / (steps - 1)) * stockLength
      const radius = Math.max(innerProfile[i], latheProfile[i])
      points.push(new THREE.Vector2(radius, zPos))
    }

    // 2. Powrót profilem wewnętrznym (od czoła Z=stockLength do uchwytu Z=0)
    // Tworzy fizyczny otwór w środku wałka podczas wiercenia G83!
    for (let i = steps - 1; i >= 0; i--) {
      const zPos = (i / (steps - 1)) * stockLength
      const inRadius = Math.max(0, innerProfile[i])
      points.push(new THREE.Vector2(inRadius, zPos))
    }

    const phiStart = viewMode === 'section' ? Math.PI : 0
    const phiLength = viewMode === 'section' ? Math.PI : Math.PI * 2

    const geo = new THREE.LatheGeometry(points, 64, phiStart, phiLength)
    geo.computeVertexNormals()
    return geo
  }, [latheProfile, innerProfile, stockLength, viewMode])

  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  useFrame((_, delta) => {
    if (spindleGroupRef.current && isPlaying && spindleSpeed > 0) {
      spindleGroupRef.current.rotation.x += delta * 15
    }
  })

  const jawRadius = stockDiameter / 2 + 0.35

  return (
    <group>
      {/* UCHWYT TOKARSKI */}
      <group ref={spindleGroupRef} position={[-stockLength, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <mesh position={[0, -0.8, 0]}>
          <cylinderGeometry args={[2.5, 2.5, 1.2, 32]} />
          <meshStandardMaterial color="#222222" metalness={0.7} roughness={0.5} />
        </mesh>

        {[0, 1, 2].map((i) => {
          const angle = (i * Math.PI * 2) / 3
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * jawRadius, -0.2, Math.sin(angle) * jawRadius]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[0.6, 1.4, 0.8]} />
              <meshStandardMaterial color="#111111" metalness={0.8} roughness={0.4} />
            </mesh>
          )
        })}
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