import { useMachineStore } from "../store"

export const parseGCodeLine = (line: string) => {
  const cleanLine = line.replace(/\([^)]*\)/g, '').trim().toUpperCase()
  if (!cleanLine) return

  const tokens = cleanLine.match(/[A-Z]-?\d+(\.\d+)?/g)
  if (!tokens) return

  const store = useMachineStore.getState()
  
  const newPos: Partial<{ x: number, y: number, z: number, i: number, j:number,k:number,r:number}> = {}
  const newModalState: any = {}

  tokens.forEach(token => {
    const letter = token[0]
    const value = parseFloat(token.substring(1))

    switch (letter) {
      case 'G':
        if ([0, 1, 2, 3].includes(value)) newModalState.motionMode = `G${value}`
        if ([20, 21].includes(value)) newModalState.unitMode = `G${value}`
        if ([90, 91].includes(value)) newModalState.positioningMode = `G${value}`
        break
      // Ścisłe przypisywanie osi (brakującej nie nadpisuje)
      case 'X':
        newPos.x = value
        break
      case 'Y':
        newPos.y = value
        break
      case 'Z':
        newPos.z = value
        break
      case 'I':
        newPos.i = value
        break
      case 'J':
        newPos.j = value
        break
      case 'K':
        newPos.k = value
        break
      case 'R':
        newPos.r = value
        break
      case 'F':
        newModalState.feedRate = value
        break
      case 'S':
        newModalState.spindleSpeed = value
        break
    }
  })

  if (Object.keys(newModalState).length > 0) {
    store.setModalState(newModalState)
  }
  
  if (Object.keys(newPos).length > 0) {
    store.updatePosition(newPos)
  }
}