import { Canvas } from "@react-three/fiber";
import { ControlPanel, LatheTool, LatheWorkpiece, ToolHead, Workpiece } from "./components";
import { Environment, Grid, OrbitControls } from "@react-three/drei";
import { useMachineStore } from "./store";

export default function App() {
  const machineType = useMachineStore((state) => state.machineType)

  return (
    <div className="flex h-screen w-full bg-zinc-900 text-white overflow-hidden">
      <ControlPanel />

      <div className="flex-1 cursor-move relative">
        <Canvas camera={{ position: [0, 5, 10], fov: 45 }}>
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
            infiniteGrid 
            fadeDistance={25} 
            sectionColor="#555" 
            cellColor="#2a2a2a" 
            sectionSize={1} 
            cellSize={0.25} 
          />
          <OrbitControls makeDefault />
        </Canvas>
      </div>
    </div>
  )
}