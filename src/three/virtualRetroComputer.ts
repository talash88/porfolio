import * as THREE from 'three'
import type {
  RetroComputerAction,
  RetroComputerMode,
  RetroComputerStatus,
  SceneRuntime,
} from './playgroundScene'

interface VirtualRetroComputerOptions {
  canvas: HTMLCanvasElement
  camera: THREE.PerspectiveCamera
  onStatus: (status: RetroComputerStatus) => void
  invalidate: () => void
  reducedMotion: boolean
}

interface GameState {
  playerX: number
  score: number
  frame: number
  enemies: Array<{ x: number; y: number; alive: boolean }>
  bullets: Array<{ x: number; y: number }>
}

const KEY_ROWS = [
  ['ESC', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'BKSP'],
  ['TAB', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['CTRL', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'ENTER'],
  ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'SHIFT'],
  ['CTRL', 'ALT', 'SPACE', 'ALT', '←', '↓', '↑', '→'],
]

const screenWidth = 768
const screenHeight = 460
const columns = 41
const visibleRows = 11

function roundedBox(width: number, height: number, depth: number, radius: number) {
  const shape = new THREE.Shape()
  shape.moveTo(-width / 2 + radius, -height / 2)
  shape.lineTo(width / 2 - radius, -height / 2)
  shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + radius)
  shape.lineTo(width / 2, height / 2 - radius)
  shape.quadraticCurveTo(width / 2, height / 2, width / 2 - radius, height / 2)
  shape.lineTo(-width / 2 + radius, height / 2)
  shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - radius)
  shape.lineTo(-width / 2, -height / 2 + radius)
  shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2)

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: radius * 0.35,
    bevelThickness: radius * 0.35,
    curveSegments: 4,
  })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

function makeWoodTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) return null

  context.fillStyle = '#514338'
  context.fillRect(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < 80; i++) {
    const y = Math.random() * canvas.height
    context.strokeStyle = `rgba(${i % 3 === 0 ? '210, 170, 125' : '25, 20, 17'}, ${0.025 + Math.random() * 0.055})`
    context.lineWidth = 1 + Math.random() * 3
    context.beginPath()
    context.moveTo(0, y)
    context.bezierCurveTo(150, y - 10, 340, y + 12, canvas.width, y + Math.random() * 8)
    context.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 1)
  return texture
}

function makeKeyboardAtlas() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) return null

  context.clearRect(0, 0, canvas.width, canvas.height)
  KEY_ROWS.flat().forEach((label, index) => {
    const column = index % 8
    const row = Math.floor(index / 8)
    context.fillStyle = '#e2d9c7'
    context.font = label.length > 4 ? 'bold 15px monospace' : 'bold 19px monospace'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(label, column * 64 + 32, row * 64 + 32, 58)
  })
  return new THREE.CanvasTexture(canvas)
}

function normalizeKey(label: string) {
  if (label === 'BKSP') return 'Backspace'
  if (label === 'SPACE') return ' '
  if (label === 'ENTER') return 'Enter'
  if (label === 'ESC') return 'Escape'
  if (label === '←') return 'ArrowLeft'
  if (label === '→') return 'ArrowRight'
  if (label === '↑') return 'ArrowUp'
  if (label === '↓') return 'ArrowDown'
  if (['CTRL', 'ALT', 'SHIFT', 'TAB'].includes(label)) return ''
  return label
}

export function createVirtualRetroComputer({
  canvas,
  camera,
  onStatus,
  invalidate,
  reducedMotion,
}: VirtualRetroComputerOptions): SceneRuntime {
  const group = new THREE.Group()
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#b8aa8e', roughness: 0.76, metalness: 0.08 })
  const trimMaterial = new THREE.MeshStandardMaterial({ color: '#746c5d', roughness: 0.62, metalness: 0.12 })
  const darkMaterial = new THREE.MeshStandardMaterial({ color: '#171a16', roughness: 0.34, metalness: 0.1 })
  const screenCanvas = document.createElement('canvas')
  screenCanvas.width = screenWidth
  screenCanvas.height = screenHeight
  const screenContext = screenCanvas.getContext('2d')
  const screenTexture = new THREE.CanvasTexture(screenCanvas)
  screenTexture.colorSpace = THREE.SRGBColorSpace
  screenTexture.minFilter = THREE.NearestFilter
  screenTexture.magFilter = THREE.NearestFilter

  const screenMaterial = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    map: screenTexture,
    toneMapped: false,
  })

  const deskMaterial = new THREE.MeshStandardMaterial({ color: '#a27a55', roughness: 0.82 })
  const woodTexture = makeWoodTexture()
  if (woodTexture) {
    deskMaterial.map = woodTexture
    deskMaterial.color.set('#d6c1a0')
  }

  const desk = new THREE.Mesh(new THREE.BoxGeometry(10, 0.22, 5.6), deskMaterial)
  desk.position.set(0, -1.03, -0.1)
  desk.receiveShadow = true
  group.add(desk)

  const body = new THREE.Mesh(roundedBox(4.9, 0.38, 1.9, 0.12), bodyMaterial)
  body.position.set(0, -0.77, 0.2)
  group.add(body)

  const monitorStand = new THREE.Mesh(roundedBox(1.05, 0.42, 0.72, 0.08), trimMaterial)
  monitorStand.position.set(0, -0.32, -0.3)
  group.add(monitorStand)
  const standFoot = new THREE.Mesh(roundedBox(1.85, 0.12, 0.85, 0.055), darkMaterial)
  standFoot.position.set(0, -0.51, -0.15)
  group.add(standFoot)

  const monitor = new THREE.Mesh(roundedBox(3.75, 2.42, 0.52, 0.19), bodyMaterial)
  monitor.position.set(0, 0.91, -0.58)
  group.add(monitor)

  const bezel = new THREE.Mesh(roundedBox(3.12, 1.83, 0.035, 0.08), darkMaterial)
  bezel.position.set(-0.02, 1.04, -0.142)
  group.add(bezel)

  const crt = new THREE.Mesh(new THREE.PlaneGeometry(2.84, 1.57), screenMaterial)
  crt.position.set(-0.02, 1.06, -0.08)
  group.add(crt)

  const crtGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.84, 1.57),
    new THREE.MeshBasicMaterial({
      color: '#d8ffdc',
      transparent: true,
      opacity: 0.035,
      depthWrite: false,
    }),
  )
  crtGlass.position.set(-0.02, 1.06, -0.077)
  group.add(crtGlass)

  const brandPlate = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.055, 0.025), trimMaterial)
  brandPlate.position.set(-0.96, 0.04, -0.13)
  group.add(brandPlate)

  const ledMaterial = new THREE.MeshStandardMaterial({
    color: '#18351c',
    emissive: '#3cff6e',
    emissiveIntensity: 0,
    roughness: 0.25,
  })
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), ledMaterial)
  led.position.set(1.18, 0.04, -0.12)
  group.add(led)
  const ledLight = new THREE.PointLight('#3cff6e', 0, 1, 2)
  ledLight.position.set(1.18, 0.1, 0.08)
  group.add(ledLight)

  const powerButton = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.12, 0.055, 20), trimMaterial)
  powerButton.rotation.x = Math.PI / 2
  powerButton.position.set(1.48, 0.04, -0.105)
  powerButton.userData.action = 'power' satisfies RetroComputerAction
  group.add(powerButton)

  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.045, 0.035), darkMaterial)
  slot.position.set(0.95, -0.06, -0.108)
  group.add(slot)
  const driveFrame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.055), trimMaterial)
  driveFrame.position.set(0.95, -0.055, -0.095)
  group.add(driveFrame)
  const driveSlot = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.045, 0.02), darkMaterial)
  driveSlot.position.set(0.95, -0.055, -0.058)
  driveSlot.userData.action = 'drive' satisfies RetroComputerAction
  group.add(driveSlot)

  const doorPivot = new THREE.Group()
  doorPivot.position.set(0.95, -0.16, -0.045)
  const driveDoor = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.045), bodyMaterial)
  driveDoor.position.set(0, 0.06, 0.015)
  doorPivot.add(driveDoor)
  group.add(doorPivot)

  const diskGroup = new THREE.Group()
  const diskBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.29, 0.045), new THREE.MeshStandardMaterial({
    color: '#3c3b38',
    roughness: 0.58,
  }))
  const diskLabel = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.105, 0.008), new THREE.MeshStandardMaterial({
    color: '#d8d1bc',
    roughness: 0.8,
  }))
  diskLabel.position.set(0, 0.045, 0.027)
  const diskShutter = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.025, 0.009), new THREE.MeshStandardMaterial({
    color: '#9e9c92',
    metalness: 0.6,
    roughness: 0.32,
  }))
  diskShutter.position.set(0, -0.1, 0.027)
  diskGroup.add(diskBody, diskLabel, diskShutter)
  diskGroup.position.set(0.95, -0.055, 0.25)
  diskGroup.visible = false
  diskGroup.userData.action = 'disk' satisfies RetroComputerAction
  group.add(diskGroup)

  const keyboardGroup = new THREE.Group()
  keyboardGroup.position.set(0, -0.75, 0.66)
  keyboardGroup.rotation.x = 0.2
  const keyboard = new THREE.Mesh(roundedBox(4.16, 0.2, 1.18, 0.1), trimMaterial)
  keyboard.position.y = 0.035
  keyboardGroup.add(keyboard)
  const keyboardDeck = new THREE.Mesh(new THREE.BoxGeometry(3.98, 0.055, 1.02), bodyMaterial)
  keyboardDeck.position.set(0, 0.16, 0)
  keyboardGroup.add(keyboardDeck)

  const legendAtlas = makeKeyboardAtlas()
  const legendMaterial = new THREE.MeshBasicMaterial({
    map: legendAtlas,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const keyGeometry = new THREE.BoxGeometry(0.255, 0.11, 0.18)
  const legendGeometry = new THREE.PlaneGeometry(0.19, 0.15)
  const keyMaterial = new THREE.MeshStandardMaterial({ color: '#d1c6ae', roughness: 0.43, metalness: 0.04 })
  const modifierMaterial = new THREE.MeshStandardMaterial({ color: '#8f897c', roughness: 0.5 })
  const keyMeshes: THREE.Mesh[] = []
  let atlasIndex = 0

  KEY_ROWS.forEach((row, rowIndex) => {
    const spacing = 0.285
    row.forEach((label, index) => {
      const wide = label === 'SPACE' ? 1.9 : label.length >= 4 ? 1.25 : 1
      const positionX = (index - (row.length - 1) / 2) * spacing + (wide - 1) * 0.14
      const positionZ = (rowIndex - 2) * 0.22
      const key = new THREE.Mesh(keyGeometry, ['CTRL', 'ALT', 'SHIFT', 'TAB', 'ESC'].includes(label) ? modifierMaterial : keyMaterial)
      key.scale.x = wide
      key.position.set(positionX, 0.215, positionZ)
      key.userData.key = normalizeKey(label)
      key.userData.label = label
      keyboardGroup.add(key)
      keyMeshes.push(key)

      const legend = new THREE.Mesh(legendGeometry, legendMaterial)
      const atlasColumn = atlasIndex % 8
      const atlasRow = Math.floor(atlasIndex / 8)
      const u0 = atlasColumn / 8
      const u1 = (atlasColumn + 1) / 8
      const v0 = 1 - (atlasRow + 1) / 8
      const v1 = 1 - atlasRow / 8
      legend.geometry = legendGeometry.clone()
      legend.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
        u0, v0, u1, v0, u0, v1, u1, v1,
      ], 2))
      legend.rotation.x = -Math.PI / 2
      legend.position.set(positionX, 0.272, positionZ)
      keyboardGroup.add(legend)
      atlasIndex++
    })
  })
  group.add(keyboardGroup)

  const castShadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.55, 48),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.24, depthWrite: false }),
  )
  castShadow.rotation.x = -Math.PI / 2
  castShadow.scale.set(1.6, 0.72, 1)
  castShadow.position.set(0, -0.91, 0.2)
  group.add(castShadow)

  const keyLight = new THREE.DirectionalLight('#fff0d6', 2.1)
  keyLight.position.set(-4, 7, 5)
  group.add(keyLight)
  const fillLight = new THREE.PointLight('#8c9f78', 18, 14, 2)
  fillLight.position.set(4, 3, 2)
  group.add(fillLight)
  const screenGlow = new THREE.PointLight('#4dff76', 0, 3.8, 2)
  screenGlow.position.set(-0.02, 0.95, 0.25)
  group.add(screenGlow)

  camera.fov = 38
  camera.position.set(0, 2.05, 9.5)
  camera.lookAt(0, 0.02, 0)
  camera.updateProjectionMatrix()

  group.rotation.set(-0.035, -0.12, 0)

  let powered = false
  let driveOpen = false
  let diskInserted = false
  let mode: RetroComputerMode = 'terminal'
  let bootStartedAt = 0
  let screenRefreshAt = 0
  let dragPointer = -1
  let dragX = 0
  let dragY = 0
  let dragging = false
  let currentInput = ''
  let cursorVisible = true
  let cursorTimer = 0
  let redraw = () => invalidate()
  const history: string[] = []
  const initialGameState = (): GameState => ({
    playerX: screenWidth / 2,
    score: 0,
    frame: 0,
    enemies: Array.from({ length: 5 }, (_, i) => ({ x: 130 + i * 120, y: 120 + (i % 2) * 36, alive: true })),
    bullets: [],
  })
  let game = initialGameState()
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const clickable = [powerButton, driveSlot, diskGroup, ...keyMeshes]

  const publishStatus = () => {
    onStatus({ powered, driveOpen, diskInserted, mode })
    invalidate()
  }
  const log = (line: string) => {
    history.push(line)
    if (history.length > 80) history.splice(0, history.length - 80)
  }
  const startBoot = () => {
    powered = true
    bootStartedAt = performance.now() / 1000
    mode = 'terminal'
    currentInput = ''
    history.length = 0
    game = initialGameState()
    publishStatus()
  }

  const processCommand = (input: string) => {
    const command = input.trim().toUpperCase()
    log(`> ${input}`)
    if (!command) return

    switch (command) {
      case 'HELP':
        log('COMMANDS: HELP ABOUT CLEAR LIST GAMES')
        log('RUN SPACE / RUN RACE / RUN EXPLORE')
        break
      case 'ABOUT':
        log('MOS-80: ORIGINAL RETRO COMPUTER SIM')
        log('A SIMULATED TERMINAL, NOT AN EMULATOR.')
        break
      case 'CLEAR':
        history.length = 0
        break
      case 'LIST':
        log('DISK: ' + (diskInserted ? 'RETRO-DATA.SSD' : 'NO DISK INSERTED'))
        log('FILES: README.TXT  STARLOG.DAT  GAMES/')
        break
      case 'GAMES':
        mode = 'games'
        publishStatus()
        break
      case 'RUN SPACE':
        mode = 'shooter'
        game = initialGameState()
        publishStatus()
        break
      case 'RUN RACE':
        mode = 'racing'
        game = initialGameState()
        publishStatus()
        break
      case 'RUN EXPLORE':
        mode = 'explorer'
        game = initialGameState()
        publishStatus()
        break
      default:
        log(`BAD COMMAND: ${command}`)
        log('TYPE HELP FOR AVAILABLE COMMANDS.')
    }
  }

  const handleTerminalKey = (key: string) => {
    if (key === 'Escape') {
      mode = 'terminal'
      publishStatus()
      return
    }
    if (key === 'Backspace') {
      currentInput = currentInput.slice(0, -1)
      return
    }
    if (key === 'Enter') {
      processCommand(currentInput)
      currentInput = ''
      return
    }
    if (key.length === 1 && key >= ' ' && key <= '~' && currentInput.length < columns - 4) {
      currentInput += key
    }
  }

  const handleGameKey = (key: string) => {
    if (mode === 'games') {
      const choices: Record<string, RetroComputerMode> = { '1': 'shooter', '2': 'racing', '3': 'explorer' }
      const nextMode = choices[key]
      if (nextMode) {
        mode = nextMode
        game = initialGameState()
        publishStatus()
      } else if (key === 'Escape') {
        mode = 'terminal'
        publishStatus()
      }
      return
    }
    if (key === 'Escape') {
      mode = 'games'
      publishStatus()
      return
    }
    if (mode === 'shooter') {
      if (key === 'ArrowLeft' || key.toLowerCase() === 'a') game.playerX = Math.max(50, game.playerX - 28)
      if (key === 'ArrowRight' || key.toLowerCase() === 'd') game.playerX = Math.min(screenWidth - 50, game.playerX + 28)
      if (key === ' ') game.bullets.push({ x: game.playerX, y: screenHeight - 92 })
    } else if (mode === 'racing') {
      if (key === 'ArrowLeft' || key.toLowerCase() === 'a') game.playerX = Math.max(255, game.playerX - 36)
      if (key === 'ArrowRight' || key.toLowerCase() === 'd') game.playerX = Math.min(515, game.playerX + 36)
    } else if (mode === 'explorer') {
      if (key === 'ArrowLeft' || key.toLowerCase() === 'a') game.playerX -= 1
      if (key === 'ArrowRight' || key.toLowerCase() === 'd') game.playerX += 1
      if (key === 'ArrowUp' || key.toLowerCase() === 'w') game.score += 1
      if (key === 'ArrowDown' || key.toLowerCase() === 's') game.score -= 1
      if (key === ' ') log(`SCAN COMPLETE: SECTOR ${String(Math.abs(game.playerX)).padStart(2, '0')}`)
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!powered || event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))) return
    if (mode === 'terminal') {
      if (event.key.length === 1 || ['Enter', 'Backspace'].includes(event.key)) event.preventDefault()
      handleTerminalKey(event.key)
    } else {
      if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault()
      handleGameKey(event.key)
    }
    redraw()
  }

  window.addEventListener('keydown', onKeyDown)

  const drawText = (text: string, x: number, y: number, color = '#65ff78') => {
    if (!screenContext) return
    screenContext.fillStyle = color
    screenContext.fillText(text, x, y)
  }

  const drawTerminal = (now: number) => {
    if (!screenContext) return
    screenContext.font = '28px monospace'
    screenContext.textBaseline = 'top'
    const bootElapsed = now - bootStartedAt
    if (bootElapsed < 2.25) {
      const bootLines = [
        'MOS-80 SYSTEM ROM 1.4',
        'MEMORY CHECK ........ 64K OK',
        'VIDEO INTERFACE ..... READY',
        'DISK CONTROLLER ..... READY',
        '',
        'STARTING MOS-80 BASIC',
      ]
      const linesToShow = Math.min(bootLines.length, Math.floor(bootElapsed * 3.3) + 1)
      bootLines.slice(0, linesToShow).forEach((line, index) => drawText(line, 34, 46 + index * 40))
      return
    }

    drawText('MOS-80  PERSONAL COMPUTER   64K RAM', 34, 24, '#aaffad')
    drawText('--------------------------------------', 34, 58, '#3da64d')
    const start = Math.max(0, history.length - visibleRows)
    const visibleHistory = history.slice(start)
    visibleHistory.forEach((line, index) => drawText(line.slice(0, columns), 34, 88 + index * 30))
    const promptY = Math.min(screenHeight - 42, 88 + visibleHistory.length * 30)
    drawText(`> ${currentInput}${cursorVisible ? '_' : ' '}`, 34, promptY, '#b8ffbd')
    if (diskInserted) drawText('DISK READY', screenWidth - 155, screenHeight - 34, '#80ce89')
  }

  const drawGamesMenu = () => {
    if (!screenContext) return
    screenContext.font = '23px monospace'
    screenContext.textBaseline = 'top'
    drawText('MOS-80 ARCADE', 34, 28, '#aaffad')
    drawText('--------------------------------------', 34, 58, '#3da64d')
    drawText('[1] ORBIT DEFENDER  - SPACE SHOOTER', 34, 105)
    drawText('[2] NIGHT DRIVE    - RETRO RACING', 34, 155)
    drawText('[3] STAR CHARTER   - SPACE EXPLORER', 34, 205)
    drawText('PRESS 1, 2 OR 3 TO PLAY', 34, 285, '#b8ffbd')
    drawText('ESC RETURNS TO THE TERMINAL', 34, 320, '#80ce89')
  }

  const drawShooter = (now: number) => {
    if (!screenContext) return
    screenContext.font = '20px monospace'
    screenContext.textBaseline = 'top'
    game.frame++
    if (game.frame % 28 === 0) game.enemies.push({ x: 60 + Math.random() * (screenWidth - 120), y: -10, alive: true })
    game.enemies.forEach((enemy) => {
      enemy.y += 0.7
      if (enemy.y > screenHeight - 85) enemy.y = -10
    })
    game.bullets.forEach((bullet) => { bullet.y -= 9 })
    game.bullets = game.bullets.filter((bullet) => bullet.y > 0)
    game.bullets.forEach((bullet) => {
      for (const enemy of game.enemies) {
        if (enemy.alive && Math.abs(enemy.x - bullet.x) < 22 && Math.abs(enemy.y - bullet.y) < 20) {
          enemy.alive = false
          bullet.y = -20
          game.score += 10
        }
      }
    })
    if (game.enemies.every((enemy) => !enemy.alive)) game.enemies = initialGameState().enemies
    screenContext.fillStyle = '#65ff78'
    for (let i = 0; i < 32; i++) {
      const x = (i * 193 + Math.floor(now * 28)) % screenWidth
      const y = (i * 71) % screenHeight
      screenContext.fillRect(x, y, 2, 2)
    }
    drawText(`ORBIT DEFENDER   SCORE ${String(game.score).padStart(4, '0')}`, 28, 20, '#aaffad')
    game.enemies.forEach((enemy) => {
      if (!enemy.alive) return
      screenContext.fillRect(enemy.x - 12, enemy.y, 24, 16)
      screenContext.fillRect(enemy.x - 6, enemy.y - 5, 12, 5)
    })
    game.bullets.forEach((bullet) => screenContext.fillRect(bullet.x - 2, bullet.y, 4, 14))
    screenContext.beginPath()
    screenContext.moveTo(game.playerX, screenHeight - 60)
    screenContext.lineTo(game.playerX - 22, screenHeight - 25)
    screenContext.lineTo(game.playerX + 22, screenHeight - 25)
    screenContext.closePath()
    screenContext.fill()
    drawText('A/D OR ARROWS MOVE  SPACE FIRE  ESC MENU', 22, screenHeight - 23, '#80ce89')
  }

  const drawRacing = (now: number) => {
    if (!screenContext) return
    screenContext.font = '20px monospace'
    screenContext.textBaseline = 'top'
    game.frame++
    game.score += 1
    screenContext.fillStyle = '#16261b'
    screenContext.fillRect(0, 0, screenWidth, screenHeight)
    screenContext.fillStyle = '#456f37'
    screenContext.fillRect(0, 0, screenWidth, screenHeight * 0.42)
    screenContext.fillStyle = '#a4a391'
    screenContext.beginPath()
    screenContext.moveTo(265, 150)
    screenContext.lineTo(503, 150)
    screenContext.lineTo(690, screenHeight)
    screenContext.lineTo(78, screenHeight)
    screenContext.closePath()
    screenContext.fill()
    screenContext.fillStyle = '#d4cda5'
    for (let i = 0; i < 7; i++) {
      const y = ((i * 74 + (now * 95) % 74) % 520) + 100
      screenContext.fillRect(screenWidth / 2 - 5, y, 10, 34)
    }
    const obstacleY = 250 + (game.frame * 5) % 165
    const obstacleX = 275 + ((Math.floor(game.frame / 37) * 73) % 220)
    screenContext.fillStyle = '#a9bd73'
    screenContext.fillRect(obstacleX, obstacleY, 34, 48)
    screenContext.fillStyle = '#d6d3bc'
    screenContext.fillRect(game.playerX - 22, screenHeight - 100, 44, 64)
    screenContext.fillStyle = '#262a21'
    screenContext.fillRect(game.playerX - 16, screenHeight - 94, 32, 16)
    drawText(`NIGHT DRIVE  DIST ${String(game.score).padStart(5, '0')}`, 22, 18, '#b8ffbd')
    drawText('A/D OR ARROWS STEER  ESC MENU', 22, screenHeight - 24, '#b8ffbd')
  }

  const drawExplorer = () => {
    if (!screenContext) return
    screenContext.font = '20px monospace'
    screenContext.textBaseline = 'top'
    screenContext.fillStyle = '#65ff78'
    for (let i = 0; i < 70; i++) {
      const x = (i * 113) % screenWidth
      const y = (i * 61) % screenHeight
      screenContext.fillRect(x, y, 2, 2)
    }
    screenContext.beginPath()
    screenContext.arc(screenWidth / 2, screenHeight / 2 + 5, 26, 0, Math.PI * 2)
    screenContext.fillStyle = '#d4e5a0'
    screenContext.fill()
    const x = screenWidth / 2 + Math.cos(game.playerX * 0.25) * 132
    const y = screenHeight / 2 + Math.sin(game.playerX * 0.25) * 82
    screenContext.beginPath()
    screenContext.moveTo(x, y - 16)
    screenContext.lineTo(x - 11, y + 12)
    screenContext.lineTo(x + 11, y + 12)
    screenContext.closePath()
    screenContext.fillStyle = '#aaffad'
    screenContext.fill()
    drawText('STAR CHARTER  -  OPEN SPACE', 22, 20, '#b8ffbd')
    drawText(`SECTOR ${String(Math.abs(game.playerX)).padStart(2, '0')} / SURVEYS ${game.score}`, 22, 50, '#80ce89')
    drawText('A/D STEER  W/S CHANGE ORBIT  SPACE SCAN', 22, screenHeight - 28, '#b8ffbd')
  }

  const refreshScreen = (now: number) => {
    if (!screenContext) return
    screenContext.fillStyle = powered ? '#041006' : '#030503'
    screenContext.fillRect(0, 0, screenWidth, screenHeight)

    if (!powered) {
      screenContext.font = 'bold 24px monospace'
      screenContext.textAlign = 'center'
      screenContext.textBaseline = 'middle'
      screenContext.fillStyle = '#18351c'
      screenContext.fillText('SYSTEM OFF', screenWidth / 2, screenHeight / 2)
      screenContext.textAlign = 'left'
    } else if (now - bootStartedAt < 2.25) {
      drawTerminal(now)
    } else if (mode === 'terminal') {
      drawTerminal(now)
    } else if (mode === 'games') {
      drawGamesMenu()
    } else if (mode === 'shooter') {
      drawShooter(now)
    } else if (mode === 'racing') {
      drawRacing(now)
    } else {
      drawExplorer()
    }

    if (powered) {
      screenContext.globalAlpha = 0.13
      screenContext.fillStyle = '#000000'
      for (let y = 1; y < screenHeight; y += 4) screenContext.fillRect(0, y, screenWidth, 1)
      screenContext.globalAlpha = 1
      screenContext.fillStyle = `rgba(150, 255, 160, ${Math.random() * 0.025})`
      screenContext.fillRect(0, 0, screenWidth, screenHeight)
    }

    screenTexture.needsUpdate = true
    screenMaterial.color.setScalar(powered ? 0.96 + Math.random() * 0.04 : 1)
  }

  redraw = () => {
    const now = performance.now() / 1000
    refreshScreen(now)
    screenRefreshAt = now
    invalidate()
  }

  const pointerNdc = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  const pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    canvas.focus({ preventScroll: true })
    pointerNdc(event)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects(clickable, false)[0]?.object
    if (hit) {
      const key = hit.userData.key as string | undefined
      const targetAction = hit.userData.action as RetroComputerAction | undefined
      if (key) onKeyDown(new KeyboardEvent('keydown', { key, bubbles: true }))
      if (targetAction) action(targetAction)
      else redraw()
      event.preventDefault()
      return
    }

    dragging = true
    dragPointer = event.pointerId
    dragX = event.clientX
    dragY = event.clientY
    canvas.setPointerCapture(event.pointerId)
    invalidate()
  }

  const pointerMove = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== dragPointer) return
    const deltaX = event.clientX - dragX
    const deltaY = event.clientY - dragY
    dragX = event.clientX
    dragY = event.clientY
    group.rotation.y += deltaX * 0.006
    group.rotation.x = THREE.MathUtils.clamp(group.rotation.x + deltaY * 0.004, -0.42, 0.34)
    invalidate()
  }

  const pointerUp = (event: PointerEvent) => {
    if (event.pointerId === dragPointer) {
      dragging = false
      dragPointer = -1
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
  }

  const action = (name: RetroComputerAction) => {
    if (name === 'power') {
      if (powered) {
        powered = false
        publishStatus()
      } else {
        startBoot()
      }
    } else if (name === 'reset') {
      startBoot()
    } else if (name === 'drive') {
      driveOpen = !driveOpen
      publishStatus()
    } else if (name === 'disk' && driveOpen) {
      diskInserted = !diskInserted
      diskGroup.visible = diskInserted
      diskGroup.position.z = diskInserted ? 0.09 : 0.25
      if (powered && mode === 'terminal') log(diskInserted ? 'DISK INSERTED: RETRO-DATA.SSD' : 'DISK EJECTED')
      publishStatus()
    } else if (name === 'games' && powered) {
      mode = 'games'
      publishStatus()
    } else if (name === 'terminal' && powered) {
      mode = 'terminal'
      publishStatus()
    }
    if (reducedMotion) {
    doorPivot.rotation.x = driveOpen ? -0.72 : 0
    screenGlow.intensity = powered ? 2.4 : 0
    ledMaterial.emissiveIntensity = powered ? 2 : 0
    ledLight.intensity = powered ? 1.6 : 0
    }
    redraw()
  }

  publishStatus()
  refreshScreen(0)

  return {
    group,
    interactive: true,
    update: (_t, dt) => {
      const now = performance.now() / 1000
      cursorTimer += dt
      if (cursorTimer >= 0.48) {
        cursorTimer = 0
        cursorVisible = !cursorVisible
      }
      doorPivot.rotation.x = THREE.MathUtils.damp(doorPivot.rotation.x, driveOpen ? -0.72 : 0, 9, dt)
      const glowTarget = powered ? 2.4 : 0
      screenGlow.intensity = THREE.MathUtils.damp(screenGlow.intensity, glowTarget, 5, dt)
      ledLight.intensity = THREE.MathUtils.damp(ledLight.intensity, powered ? 1.6 : 0, 7, dt)
      if (powered && now - screenRefreshAt > 0.09) {
        refreshScreen(now)
        screenRefreshAt = now
      }
    },
    pointerDown,
    pointerMove,
    pointerUp,
    wheel: (event) => {
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + Math.sign(event.deltaY) * 0.48, 7.4, 14)
      camera.updateProjectionMatrix()
    },
    action,
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown)
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const material = object.material
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else material.dispose()
      })
      if (legendAtlas) legendAtlas.dispose()
      legendGeometry.dispose()
      keyGeometry.dispose()
      screenTexture.dispose()
      woodTexture?.dispose()
    },
  }
}
