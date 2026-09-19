import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMachineStore } from '../../store'

export function LatheWorkpiece() {
  const spindleSpeed = useMachineStore((state) => state.spindleSpeed)
  const latheProfile = useMachineStore((state) => state.latheProfile)
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (groupRef.current && spindleSpeed > 0) {
      const rps = spindleSpeed / 60
      groupRef.current.rotation.x += (rps * Math.PI * 2) * delta
    }
  })

  const profilePoints = useMemo(() => {
    const pts = []
    const Z_LENGTH = 6
    const Z_STEPS = 120

    pts.push(new THREE.Vector2(0, 0))
    
    for (let i = 0; i < Z_STEPS; i++) {
      const z = (i / Z_STEPS) * Z_LENGTH
      const radius = latheProfile[i]
      pts.push(new THREE.Vector2(radius, z))
    }
    
    // Punkt centralny zamknięcia bryły przy uchwycie
    pts.push(new THREE.Vector2(0, Z_LENGTH))
    
    return pts
  }, [latheProfile])

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <mesh position={[-0.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[2, 2, 1, 32]} />
        <meshStandardMaterial color="#222" metalness={0.8} roughness={0.5} />
      </mesh>
      <mesh 
        position={[0, 0, 0]} 
        rotation={[0, 0, -Math.PI / 2]} 
      >
        <latheGeometry args={[profilePoints, 64]} />
        <meshStandardMaterial color="#a0a5b0" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  )
}