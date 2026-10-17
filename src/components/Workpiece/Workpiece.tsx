import { Geometry, Base, Subtraction } from '@react-three/csg'
import * as THREE from 'three'
import { useMachineStore } from '../../store'
import type { CutSegment } from '../../store/useMachineStore'

const TOOL_RADIUS = 0.25 

function CutGeometry({ segment }: { segment: CutSegment }) {
  const start = new THREE.Vector3(segment.start.x, segment.start.z, -segment.start.y)
  const end = new THREE.Vector3(segment.end.x, segment.end.z, -segment.end.y)
  const distance = start.distanceTo(end)

  if (distance < 0.0005) return null

  const midPoint = start.clone().lerp(end, 0.5)
  const direction = end.clone().sub(start).normalize()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction
  )

  return (
    <>
      {/* Główny kanał wycięty przez ruch frezu */}
      <Subtraction position={midPoint} quaternion={quaternion}>
        <cylinderGeometry args={[TOOL_RADIUS, TOOL_RADIUS, distance, 16]} />
        <meshStandardMaterial color="#b0b6c2" metalness={0.7} roughness={0.25} />
      </Subtraction>

      {/* Zaokrąglenie w punkcie końcowym (kształt frezu w miejscu zatrzymania) */}
      <Subtraction position={end}>
        <cylinderGeometry args={[TOOL_RADIUS, TOOL_RADIUS, 0.5, 16]} />
        <meshStandardMaterial color="#b0b6c2" metalness={0.7} roughness={0.25} />
      </Subtraction>
    </>
  )
}

export function Workpiece() {
  const completedCuts = useMachineStore((state) => state.completedCuts)
  const activeCut = useMachineStore((state) => state.activeCut)

  return (
    <group>
      <axesHelper args={[0.8]} position={[0, 0.01, 0]} />

      <mesh position={[0, 0, 0]}>
        <Geometry useGroups>
          <Base name="stock" position={[2, -0.5, -2]}>
            <boxGeometry args={[4, 1, 4]} />
            <meshStandardMaterial color="#6e7681" metalness={0.45} roughness={0.55} />
          </Base>

          {completedCuts.map((cut, index) => (
            <CutGeometry key={index} segment={cut} />
          ))}

          {activeCut && <CutGeometry segment={activeCut} />}
        </Geometry>
      </mesh>
    </group>
  )
}