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

  const stockRadius = stockDiameter / 2

  return (
    <group>
      {/* PRZEMYSŁOWY UCHWYT 3-SZCZĘKOWY SAMOCENTRUJĄCY (BISON / SCHUNK) */}
      <group ref={spindleGroupRef} position={[-stockLength, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        {/* Główny stalowy korpus uchwytu */}
        <mesh position={[0, -0.85, 0]}>
          <cylinderGeometry args={[2.45, 2.55, 1.3, 48]} />
          <meshStandardMaterial color="#3b4048" metalness={0.85} roughness={0.3} />
        </mesh>

        {/* Tarcza zabierakowa wrzeciona z tyłu */}
        <mesh position={[0, -1.6, 0]}>
          <cylinderGeometry args={[2.1, 2.1, 0.3, 32]} />
          <meshStandardMaterial color="#1f2328" metalness={0.8} roughness={0.5} />
        </mesh>

        {/* Czołowy pierścień osłonowy i otwór przelotowy wrzeciona */}
        <mesh position={[0, -0.19, 0]}>
          <cylinderGeometry args={[2.35, 2.45, 0.04, 48]} />
          <meshStandardMaterial color="#252930" metalness={0.9} roughness={0.35} />
        </mesh>

        {/* 3 Szczęki stopniowane (rozstawione co 120 stopni) */}
        {[0, 1, 2].map((i) => {
          const angle = (i * Math.PI * 2) / 3
          return (
            <group key={i} rotation={[0, -angle, 0]}>
              {/* Rowek prowadzący w korpusie uchwytu */}
              <mesh position={[1.25, -0.18, 0]}>
                <boxGeometry args={[2.2, 0.08, 0.52]} />
                <meshStandardMaterial color="#111317" metalness={0.7} roughness={0.6} />
              </mesh>

              {/* Zespół szczęki stopniowanej dociśniętej dokładnie do promienia materiału */}
              <group position={[stockRadius, 0, 0]}>
                {/* Stopień 1 (Baza szczęki wchodząca w prowadnicę + styk z materiałem) */}
                <mesh position={[0.65, 0.05, 0]}>
                  <boxGeometry args={[1.3, 0.55, 0.46]} />
                  <meshStandardMaterial color="#1e2229" metalness={0.88} roughness={0.32} />
                </mesh>

                {/* Stopień 2 (Środkowy schodek szczęki) */}
                <mesh position={[0.45, 0.48, 0]}>
                  <boxGeometry args={[0.9, 0.35, 0.44]} />
                  <meshStandardMaterial color="#282d35" metalness={0.88} roughness={0.3} />
                </mesh>

                {/* Stopień 3 (Wewnętrzny nosek zaciskający detal) */}
                <mesh position={[0.25, 0.75, 0]}>
                  <boxGeometry args={[0.5, 0.25, 0.4]} />
                  <meshStandardMaterial color="#323842" metalness={0.9} roughness={0.25} />
                </mesh>

                {/* Jasna ząbkowana wkładka hartowana na styku z wałkiem */}
                <mesh position={[0.02, 0.42, 0]}>
                  <boxGeometry args={[0.05, 0.85, 0.36]} />
                  <meshStandardMaterial color="#6b7280" metalness={0.9} roughness={0.4} />
                </mesh>

                {/* Śruby mocujące szczękę (2 gniazda imbusowe) */}
                <mesh position={[0.85, 0.33, 0]}>
                  <cylinderGeometry args={[0.09, 0.09, 0.04, 16]} />
                  <meshStandardMaterial color="#090a0c" />
                </mesh>
                <mesh position={[1.12, 0.33, 0]}>
                  <cylinderGeometry args={[0.09, 0.09, 0.04, 16]} />
                  <meshStandardMaterial color="#090a0c" />
                </mesh>
              </group>
            </group>
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