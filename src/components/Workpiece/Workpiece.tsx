import { Geometry, Base, Subtraction } from '@react-three/csg'
import * as THREE from 'three'
import { useMachineStore } from '../../store'
import type { CutSegment } from '../../store/useMachineStore'

function CutGeometry({ segment }: { segment: CutSegment }) {
  const start = new THREE.Vector3(segment.start.x, segment.start.z, -segment.start.y)
  const end = new THREE.Vector3(segment.end.x, segment.end.z, -segment.end.y)
  const distance = start.distanceTo(end)

  if (distance < 0.001) return null

  const midPoint = start.clone().lerp(end, 0.5)
  const direction = end.clone().sub(start).normalize()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction
  )

  return (
    <Subtraction position={midPoint} quaternion={quaternion}>
      <cylinderGeometry args={[0.25, 0.25, distance, 12]} />
      {/* Dodany materiał dla wyciętej powierzchni (symulacja lśniącego, sfrezowanego metalu) */}
      <meshStandardMaterial color="#a0a5b0" metalness={0.6} roughness={0.3} />
    </Subtraction>
  )
}

export function Workpiece() {
  const completedCuts = useMachineStore((state) => state.completedCuts)
  const activeCut = useMachineStore((state) => state.activeCut)

  return (
    <mesh position={[0, 0, 0]}>
      <Geometry useGroups>
       <Base name="stock" position={[2, -0.5, -2]}>
    <boxGeometry args={[4, 1, 4]} />
    <meshStandardMaterial color="#8a919c" metalness={0.4} roughness={0.6} />
  </Base>
        {completedCuts.map((cut, index) => (
          <CutGeometry key={index} segment={cut} />
        ))}
        
        {activeCut && <CutGeometry segment={activeCut} />}
      </Geometry>
    </mesh>
  )
}