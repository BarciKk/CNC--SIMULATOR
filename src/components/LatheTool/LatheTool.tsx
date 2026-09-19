import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMachineStore } from '../../store'
import { parseGCodeLine } from '../../parser'

export function LatheTool() {
  const meshRef = useRef<THREE.Group>(null)
  
  const targetPosition = useMachineStore((state) => state.targetPosition)
  const setCurrentPosition = useMachineStore((state) => state.setCurrentPosition)
  const feedRate = useMachineStore((state) => state.feedRate)
  const motionMode = useMachineStore((state) => state.motionMode)
  const carveLatheProfile = useMachineStore((state) => state.carveLatheProfile)
  
  const isPlaying = useMachineStore((state) => state.isPlaying)
  const gcodeLines = useMachineStore((state) => state.gcodeLines)
  const currentLineIndex = useMachineStore((state) => state.currentLineIndex)
  const advanceLine = useMachineStore((state) => state.advanceLine)
  const pauseProgram = useMachineStore((state) => state.pauseProgram)

  const targetVec = new THREE.Vector3()
  const lastPos = useRef(new THREE.Vector2(0, 0))
  const [arcProgress, setArcProgress] = useState(1) 
  const arcData = useRef<any>(null)

  useFrame((_, delta) => {
    if (!meshRef.current) return
    targetVec.set(targetPosition.z, targetPosition.x, 0)
    const currentVec = meshRef.current.position
    lastPos.current.set(currentVec.x, currentVec.y)
    let speed = feedRate > 0 ? feedRate / 60 : 10.0
    if (motionMode === 'G0') speed = 10.0 

    let isMoving = false

    if (motionMode === 'G0' || motionMode === 'G1') {
      const distance = currentVec.distanceTo(targetVec)
      if (distance > 0.0001) {
        isMoving = true
        const step = Math.min(speed * delta, distance)
        const dir = targetVec.clone().sub(currentVec).normalize()
        currentVec.add(dir.multiplyScalar(step))
      }
    } 
    else if (motionMode === 'G2' || motionMode === 'G3') {
      const distance = currentVec.distanceTo(targetVec)
      
      if (distance > 0.0001 && arcProgress >= 1) {
        setArcProgress(0) 
        isMoving = true

        
        const cx = currentVec.x + (targetPosition.k || 0) 
        const cy = currentVec.y + (targetPosition.i || 0) 
        
        const startAngle = Math.atan2(currentVec.y - cy, currentVec.x - cx)
        
        let endAngle = Math.atan2(targetVec.y - cy, targetVec.x - cx)

        const isClockwise = motionMode === 'G2'
        
        if (isClockwise) {
          while (endAngle > startAngle) endAngle -= Math.PI * 2
        } else {
          while (endAngle < startAngle) endAngle += Math.PI * 2
        }
        
        const totalAngle = endAngle - startAngle
        const radius = Math.sqrt(Math.pow(currentVec.x - cx, 2) + Math.pow(currentVec.y - cy, 2))
        const arcLength = Math.abs(totalAngle) * radius

        arcData.current = { cx, cy, startAngle, totalAngle, radius, arcLength }
      } 
      else if (arcProgress < 1 && arcData.current) {
        isMoving = true
        const { cx, cy, startAngle, totalAngle, arcLength, radius } = arcData.current
        
        const stepPercent = (speed * delta) / arcLength
        const newProgress = Math.min(arcProgress + stepPercent, 1)
        
        const currentAngle = startAngle + (totalAngle * newProgress)
        
        currentVec.x = cx + Math.cos(currentAngle) * radius
        currentVec.y = cy + Math.sin(currentAngle) * radius
        
        setArcProgress(newProgress)
      }
    }

    if (isMoving) {
     setCurrentPosition({ x: currentVec.y, y: 0, z: currentVec.x })
      
      if (motionMode === 'G1' || motionMode === 'G2' || motionMode === 'G3') {
        carveLatheProfile(currentVec.x, currentVec.y, lastPos.current.x, lastPos.current.y)
      }
    } 
    else {
      if (arcProgress < 1) setArcProgress(1) 

      if (isPlaying) {
        if (currentLineIndex < gcodeLines.length) {
          const nextLine = gcodeLines[currentLineIndex]
          parseGCodeLine(nextLine)
          advanceLine()
        } else {
          pauseProgram()
        }
      }
    }
  })
  return (
    <group ref={meshRef} position={[0, 0, 0]}>
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[0.5, 3, 0.5]} />
        <meshStandardMaterial color="#333" metalness={0.7} roughness={0.4} />
      </mesh>
      
      <mesh position={[0, -0.05, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.3, 0.3, 0.51]} />
        <meshStandardMaterial color="#eab308" metalness={0.5} roughness={0.5} />
      </mesh>

      <axesHelper args={[0.5]} />
    </group>
  )
}