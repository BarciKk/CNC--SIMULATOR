import { Canvas } from '@react-three/fiber'
import { ControlPanel, LatheTool, LatheWorkpiece, ToolHead, Workpiece } from './components'
import { Environment, Grid, OrbitControls } from '@react-three/drei'
import { useMachineStore } from './store'

export default function App() {
  const machineType = useMachineStore((state) => state.machineType)

  return (
    <div className="flex h-screen w-full bg-zinc-900 text-white overflow-hidden">
      <ControlPanel />

      {/* mr-[340px] rezerwuje miejsce dla prawego panelu DRO, dzięki czemu środek kamery 3D jest na środku wolnego miejsca */}
      <div className="flex-1 mr-[340px] cursor-move relative">
        <Canvas camera={{ position: [2, 4, 7], fov: 45 }}>
          <Environment preset="city" />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 15, 10]} intensity={1} castShadow />

          {machineType === 'mill' ? (
            <>
              <ToolHead />
              <Workpiece />
            </>
          ) : (
            <>
              <LatheTool />
              <LatheWorkpiece />
            </>
          )}
         <Grid
            position={[0, -2.8, 0]}
            infiniteGrid
            fadeDistance={25}
            sectionColor="#555"
            cellColor="#2a2a2a"
            sectionSize={1}
            cellSize={0.25}
          />
          <OrbitControls makeDefault target={machineType === 'mill' ? [2, 0, -2] : [-1.5, 0, 0]} />
        </Canvas>
      </div>
    </div>
  )
}