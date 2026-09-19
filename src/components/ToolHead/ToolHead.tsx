import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMachineStore } from '../../store'
import { parseGCodeLine } from '../../parser'

export function ToolHead() {
  const meshRef = useRef<THREE.Group>(null)
  const lastTargetVec = useRef(new THREE.Vector3())
  const targetVec = new THREE.Vector3()

  useFrame((_, delta) => {
    if (!meshRef.current) return

    // Pobieranie świeżego stanu w każdej klatce (omija opóźnienia Reacta)
    const state = useMachineStore.getState()

    targetVec.set(state.targetPosition.x, state.targetPosition.z, -state.targetPosition.y)
    const currentVec = meshRef.current.position

    // Wykrywanie nowego bloku kodu
    if (!lastTargetVec.current.equals(targetVec)) {
      if (state.activeCut) {
        state.addCompletedCut(state.activeCut)
      }

      if (state.motionMode === 'G1' || state.motionMode === 'G2' || state.motionMode === 'G3') {
        state.setActiveCut({
          start: { x: currentVec.x, y: -currentVec.z, z: currentVec.y },
          end: { x: currentVec.x, y: -currentVec.z, z: currentVec.y }
        })
      } else {
        state.setActiveCut(null)
      }
      lastTargetVec.current.copy(targetVec)
    }

    const distance = currentVec.distanceTo(targetVec)

    if (distance > 0.0001) {
      let speed = 10.0 
      if (state.motionMode === 'G1' && state.feedRate > 0) speed = state.feedRate / 60

      const step = Math.min(speed * delta, distance)
      const dir = targetVec.clone().sub(currentVec).normalize()
      currentVec.add(dir.multiplyScalar(step))

      state.setCurrentPosition({ x: currentVec.x, y: -currentVec.z, z: currentVec.y })

      // Ponowne pobranie stanu po zmianie współrzędnych, aby zaktualizować koniec wióra
      const freshState = useMachineStore.getState()
      if (freshState.motionMode === 'G1' && freshState.activeCut) {
        freshState.setActiveCut({
          start: freshState.activeCut.start,
          end: { x: currentVec.x, y: -currentVec.z, z: currentVec.y }
        })
      }
    } else {
      // Pobieranie kolejnej linii z pliku
      if (state.isPlaying) {
        if (state.currentLineIndex < state.gcodeLines.length) {
          const nextLine = state.gcodeLines[state.currentLineIndex]
          parseGCodeLine(nextLine)
          state.advanceLine()
        } else {
          state.pauseProgram()
        }
      }
    }
  })

  return (
    <group ref={meshRef} position={[0, 0, 0]}>
      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[0.3, 0.6, 0.5, 32]} />
        <meshStandardMaterial color="#444" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.5, 32]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.2} />
      </mesh>
      <axesHelper args={[0.5]} />
    </group>
  )
}