import * as THREE from 'three'

export type PlaygroundPresetId = 'geometry' | 'particles' | 'torus' | 'network' | 'grid' | 'shapes' | 'retro-computer'

export type RetroComputerAction = 'power' | 'reset' | 'disk' | 'drive' | 'games' | 'terminal'
export type RetroComputerMode = 'terminal' | 'games' | 'shooter' | 'racing' | 'explorer'

export interface RetroComputerStatus {
  powered: boolean
  driveOpen: boolean
  diskInserted: boolean
  mode: RetroComputerMode
}

export interface PlaygroundPreset {
  id: PlaygroundPresetId
  label: string
  description: string
}

export const playgroundPresets: PlaygroundPreset[] = [
  { id: 'geometry', label: 'Abstract 3D Geometry', description: 'Layered mesh forms and luminous motion.' },
  { id: 'particles', label: 'Animated Particle Universe', description: 'Nebulous particles drifting through space.' },
  { id: 'torus', label: 'Interactive Torus / Rings', description: 'Responsive rings with pointer-driven movement.' },
  { id: 'network', label: '3D Neural Network', description: 'Connected nodes tracing a digital signal.' },
  { id: 'grid', label: 'Cybernetic Grid', description: 'Futuristic latticeforms and glow lines.' },
  { id: 'shapes', label: 'Floating 3D Shapes', description: 'Sculptural forms in a calm orbital dance.' },
  { id: 'retro-computer', label: 'Virtual Retro Computer', description: 'A hands-on 1980s-inspired computer with a simulated terminal and original mini-games.' },
]

export class WebGLUnsupported extends Error {
  constructor() {
    super('WebGL is not available')
    this.name = 'WebGLUnsupported'
  }
}

export interface SceneRuntime {
  group: THREE.Group
  update: (t: number, dt: number) => void
  dispose: () => void
  interactive?: boolean
  pointerDown?: (event: PointerEvent) => void
  pointerMove?: (event: PointerEvent) => void
  pointerUp?: (event: PointerEvent) => void
  wheel?: (event: WheelEvent) => void
  action?: (action: RetroComputerAction) => void
  invalidate?: () => void
}

export class PlaygroundSceneManager {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private root = new THREE.Group()
  private current: SceneRuntime | null = null
  private reduced: boolean
  private pointer = new THREE.Vector2(0, 0)
  private raf = 0
  private clock = new THREE.Clock()
  private ro: ResizeObserver
  private disposed = false
  private presetRequest = 0
  private onComputerStatus?: (status: RetroComputerStatus | null) => void

  constructor(
    private element: HTMLCanvasElement,
    options: { reducedMotion: boolean; onComputerStatus?: (status: RetroComputerStatus | null) => void },
  ) {
    this.reduced = options.reducedMotion
    this.onComputerStatus = options.onComputerStatus

    const renderer = new THREE.WebGLRenderer({
      canvas: this.element,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    this.renderer = renderer
    this.renderer.setClearColor(0x000000, 0)

    this.scene = new THREE.Scene()
    const width = this.element.clientWidth || this.element.parentElement?.clientWidth || 900
    const height = this.element.clientHeight || this.element.parentElement?.clientHeight || 500
    this.renderer.setSize(width, height, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)
    this.camera.position.set(0, 0.4, 9)
    this.camera.lookAt(0, 0, 0)

    const hemi = new THREE.HemisphereLight('#7dd3fc', '#050816', 1.2)
    this.scene.add(hemi)
    const accent = new THREE.PointLight('#7dd3fc', 35, 30, 2)
    accent.position.set(3, 2, 4)
    this.scene.add(accent)

    this.scene.add(this.root)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(this.element.parentElement ?? this.element)
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    this.element.addEventListener('pointerdown', this.onCanvasPointerDown)
    this.element.addEventListener('pointermove', this.onCanvasPointerMove)
    this.element.addEventListener('pointerup', this.onCanvasPointerUp)
    this.element.addEventListener('pointercancel', this.onCanvasPointerUp)
    this.element.addEventListener('wheel', this.onCanvasWheel, { passive: false })

    this.setPreset('geometry')
    if (this.reduced) {
      this.renderFrame()
    } else {
      this.startLoop()
    }
  }

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.element.getBoundingClientRect()
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      this.pointer.set(0, 0)
      return
    }
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  private renderFrame() {
    if (this.disposed) return
    this.renderer.render(this.scene, this.camera)
  }

  private startLoop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.startLoop)
    const dt = Math.min(this.clock.getDelta(), 0.04)
    const t = this.clock.elapsedTime
    if (this.current) this.current.update(t, dt)
    if (!this.current?.interactive) {
      this.root.rotation.y += 0.0025
      this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, this.pointer.y * 0.4, 0.04)
      this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, this.pointer.x * 0.35, 0.04)
    }
    this.renderFrame()
  }

  setPreset(presetId: PlaygroundPresetId) {
    if (this.disposed) return
    const request = ++this.presetRequest
    this.clearCurrentScene()
    this.root.rotation.set(0, 0, 0)
    this.onComputerStatus?.(null)

    if (presetId === 'retro-computer') {
      import('./virtualRetroComputer')
        .then(({ createVirtualRetroComputer }) => {
          if (this.disposed || request !== this.presetRequest) return
          const preset = createVirtualRetroComputer({
            canvas: this.element,
            camera: this.camera,
            onStatus: (status) => this.onComputerStatus?.(status),
            reducedMotion: this.reduced,
            invalidate: () => {
              if (this.reduced) this.renderFrame()
            },
          })
          this.installPreset(preset)
        })
        .catch((error: unknown) => {
          console.error('Virtual Retro Computer failed to load:', error)
        })
      return
    }

    this.camera.position.set(0, 0.4, 9)
    this.camera.fov = 40
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
    this.installPreset(this.createPreset(presetId))
  }

  private installPreset(preset: SceneRuntime) {
    this.current = preset
    this.root.add(preset.group)
    if (this.reduced) this.renderFrame()
  }

  private onCanvasPointerDown = (event: PointerEvent) => {
    this.current?.pointerDown?.(event)
    if (this.reduced) this.renderFrame()
  }

  private onCanvasPointerMove = (event: PointerEvent) => {
    this.current?.pointerMove?.(event)
    if (this.reduced) this.renderFrame()
  }

  private onCanvasPointerUp = (event: PointerEvent) => {
    this.current?.pointerUp?.(event)
    if (this.reduced) this.renderFrame()
  }

  private onCanvasWheel = (event: WheelEvent) => {
    if (!this.current?.wheel) return
    event.preventDefault()
    this.current.wheel(event)
    if (this.reduced) this.renderFrame()
  }

  performComputerAction(action: RetroComputerAction) {
    this.current?.action?.(action)
    if (this.reduced) this.renderFrame()
  }

  private clearCurrentScene() {
    if (!this.current) return
    this.root.remove(this.current.group)
    this.current.dispose()
    this.current = null
  }

  private createPreset(presetId: PlaygroundPresetId): SceneRuntime {
    switch (presetId) {
      case 'geometry':
        return this.createAbstractGeometry()
      case 'particles':
        return this.createParticleUniverse()
      case 'torus':
        return this.createTorusScene()
      case 'network':
        return this.createNeuralNetwork()
      case 'grid':
        return this.createCyberneticGrid()
      case 'shapes':
        return this.createFloatingShapes()
      case 'retro-computer':
        return this.createAbstractGeometry()
      default:
        return this.createAbstractGeometry()
    }
  }

  private createAbstractGeometry(): SceneRuntime {
    const group = new THREE.Group()
    const shapes: THREE.Object3D[] = []

    const material = new THREE.MeshPhysicalMaterial({
      color: '#8be9fd',
      emissive: '#3f8efc',
      emissiveIntensity: 0.6,
      metalness: 0.35,
      roughness: 0.2,
      transparent: true,
      opacity: 0.9,
    })

    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.3, 0.38, 180, 32), material)
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), new THREE.MeshStandardMaterial({
      color: '#c084fc',
      emissive: '#4f46e5',
      emissiveIntensity: 0.7,
      metalness: 0.45,
      roughness: 0.25,
    }))
    const shell = new THREE.Mesh(new THREE.OctahedronGeometry(2.3, 0), new THREE.MeshStandardMaterial({
      color: '#0f172a',
      emissive: '#67e8f9',
      emissiveIntensity: 0.16,
      transparent: true,
      opacity: 0.16,
      roughness: 0.34,
      metalness: 0.28,
    }))

    group.add(knot, orb, shell)
    shapes.push(knot, orb, shell)

    return {
      group,
      update: (t) => {
        const phase = t * 0.9
        group.rotation.x = phase * 0.6 + this.pointer.y * 0.8
        group.rotation.y = phase * 0.8 + this.pointer.x * 0.7
        for (let i = 0; i < shapes.length; i++) {
          const s = shapes[i] as THREE.Mesh
          s.position.y = Math.sin(t * 1.4 + i) * 0.5
        }
      },
      dispose: () => {
        shapes.forEach((shape) => {
          const mesh = shape as THREE.Mesh
          mesh.geometry.dispose()
          const material = mesh.material
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose())
          } else {
            material.dispose()
          }
        })
      },
    }
  }

  private createParticleUniverse(): SceneRuntime {
    const group = new THREE.Group()
    const count = 1800
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const radius = 4 + Math.random() * 6
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1] = radius * Math.cos(phi)
      positions[i3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
      const color = new THREE.Color().setHSL(0.55 + Math.random() * 0.2, 0.9, 0.68)
      colors[i3] = color.r
      colors[i3 + 1] = color.g
      colors[i3 + 2] = color.b
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 0.06,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })

    const particles = new THREE.Points(geometry, material)
    group.add(particles)
    const basePositions = positions.slice()

    return {
      group,
      update: (t) => {
        const pos = particles.geometry.attributes.position.array as Float32Array
        for (let i = 0; i < count; i++) {
          const i3 = i * 3
          const wave = Math.sin(t * 0.8 + i * 0.13)
          pos[i3] = basePositions[i3] + Math.sin(t + i) * 0.12 + this.pointer.x * 0.5
          pos[i3 + 1] = basePositions[i3 + 1] + wave * 0.18
          pos[i3 + 2] = basePositions[i3 + 2] + Math.cos(t + i * 0.7) * 0.12
        }
        particles.geometry.attributes.position.needsUpdate = true
        group.rotation.y = t * 0.25 + this.pointer.x * 0.9
        group.rotation.x = this.pointer.y * 0.8
      },
      dispose: () => {
        geometry.dispose()
        material.dispose()
      },
    }
  }

  private createTorusScene(): SceneRuntime {
    const group = new THREE.Group()
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: '#67e8f9',
      emissive: '#0ea5e9',
      emissiveIntensity: 0.8,
      metalness: 0.65,
      roughness: 0.25,
    })

    const torus1 = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.2, 24, 200), ringMaterial)
    const torus2 = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.14, 20, 200), new THREE.MeshStandardMaterial({
      color: '#c084fc',
      emissive: '#8b5cf6',
      emissiveIntensity: 0.9,
      metalness: 0.6,
      roughness: 0.2,
    }))
    const torus3 = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.13, 18, 200), new THREE.MeshStandardMaterial({
      color: '#f9a8d4',
      emissive: '#f472b6',
      emissiveIntensity: 0.8,
      metalness: 0.5,
      roughness: 0.2,
    }))

    torus1.rotation.x = Math.PI / 2
    torus2.rotation.y = Math.PI / 2
    torus3.rotation.x = Math.PI / 2
    group.add(torus1, torus2, torus3)

    return {
      group,
      update: (t) => {
        torus1.rotation.z = t * 0.9
        torus2.rotation.x = t * 0.7
        torus3.rotation.y = t * 0.8
        group.rotation.y = t * 0.6 + this.pointer.x * 1.2
        group.rotation.x = this.pointer.y * 0.9
      },
      dispose: () => {
        torus1.geometry.dispose()
        torus2.geometry.dispose()
        torus3.geometry.dispose()
        ringMaterial.dispose()
        ;(torus2.material as THREE.Material).dispose()
        ;(torus3.material as THREE.Material).dispose()
      },
    }
  }

  private createNeuralNetwork(): SceneRuntime {
    const group = new THREE.Group()
    const nodes: THREE.Mesh[] = []
    const nodePositions: THREE.Vector3[] = []
    const geometry = new THREE.SphereGeometry(0.12, 16, 16)
    const material = new THREE.MeshStandardMaterial({
      color: '#7dd3fc',
      emissive: '#38bdf8',
      emissiveIntensity: 0.8,
      metalness: 0.4,
      roughness: 0.25,
    })

    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2
      const radius = 2.4 + (i % 3) * 0.7
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle * 1.7) * 1.9
      const z = Math.sin(angle) * radius
      const node = new THREE.Mesh(geometry, material)
      node.position.set(x, y, z)
      nodePositions.push(node.position.clone())
      nodes.push(node)
      group.add(node)
    }

    const lineMaterial = new THREE.LineBasicMaterial({ color: '#67e8f9', transparent: true, opacity: 0.46 })
    const linePositions: number[] = []
    for (let i = 0; i < nodePositions.length; i++) {
      for (let j = i + 1; j < nodePositions.length; j++) {
        const dist = nodePositions[i].distanceTo(nodePositions[j])
        if (dist < 2.7) {
          linePositions.push(nodePositions[i].x, nodePositions[i].y, nodePositions[i].z, nodePositions[j].x, nodePositions[j].y, nodePositions[j].z)
        }
      }
    }
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))
    const networkLines = new THREE.LineSegments(lineGeometry, lineMaterial)
    group.add(networkLines)
    group.scale.setScalar(0.82)
    group.position.y = 0.12

    return {
      group,
      update: (t) => {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          const pulse = 1 + Math.sin(t * 1.4 + i * 0.7) * 0.12
          node.scale.setScalar(pulse)
          node.rotation.x = t + i
          node.rotation.y = t * 0.8 + i * 0.3
        }
        group.rotation.y = t * 0.5 + this.pointer.x * 0.8
        group.rotation.x = this.pointer.y * 0.7
      },
      dispose: () => {
        geometry.dispose()
        material.dispose()
        lineGeometry.dispose()
        lineMaterial.dispose()
      },
    }
  }

  private createCyberneticGrid(): SceneRuntime {
    const group = new THREE.Group()
    const gridPositions: number[] = []
    const accentPositions: number[] = []
    const divisions = 24
    const size = 14
    const halfSize = size / 2
    for (let i = 0; i <= divisions; i++) {
      const coordinate = -halfSize + (i / divisions) * size
      const target = i % 6 === 0 ? accentPositions : gridPositions
      target.push(-halfSize, 0, coordinate, halfSize, 0, coordinate)
      target.push(coordinate, 0, -halfSize, coordinate, 0, halfSize)
    }

    const gridGeometry = new THREE.BufferGeometry()
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3))
    const gridMaterial = new THREE.LineBasicMaterial({ color: '#1e293b', transparent: true, opacity: 0.76 })
    const grid = new THREE.LineSegments(gridGeometry, gridMaterial)
    grid.position.y = -2.2
    group.add(grid)
    const accentGridGeometry = new THREE.BufferGeometry()
    accentGridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(accentPositions, 3))
    const accentGridMaterial = new THREE.LineBasicMaterial({ color: '#315b6c', transparent: true, opacity: 0.52 })
    const accentGrid = new THREE.LineSegments(accentGridGeometry, accentGridMaterial)
    accentGrid.position.y = -2.2
    group.add(accentGrid)

    const boxMaterial = new THREE.MeshPhysicalMaterial({
      color: '#7dd3fc',
      emissive: '#0284c7',
      emissiveIntensity: 0.7,
      metalness: 0.6,
      roughness: 0.2,
      transparent: true,
      opacity: 0.82,
    })

    const boxes: THREE.Mesh[] = []
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), boxMaterial)
      mesh.position.set((i - 4) * 1.2, Math.sin(i) * 0.8, (i % 3) - 1.2)
      group.add(mesh)
      boxes.push(mesh)
    }

    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.05, 16, 160), new THREE.MeshStandardMaterial({
      color: '#a78bfa',
      emissive: '#7c3aed',
      emissiveIntensity: 0.75,
    }))
    ring.rotation.x = Math.PI / 2
    group.add(ring)

    return {
      group,
      update: (t) => {
        group.rotation.y = t * 0.7 + this.pointer.x * 0.8
        group.rotation.x = this.pointer.y * 0.6
        ringsUpdate(t)
        boxes.forEach((box, i) => {
          box.position.y = Math.sin(t * 1.3 + i) * 0.7 - 0.2
          box.rotation.x = t + i
          box.rotation.z = t * 0.8 + i
        })

        function ringsUpdate(time: number) {
          ring.rotation.z = time * 1.2
        }
      },
      dispose: () => {
        gridGeometry.dispose()
        gridMaterial.dispose()
        accentGridGeometry.dispose()
        accentGridMaterial.dispose()
        ring.geometry.dispose()
        boxMaterial.dispose()
        ;(ring.material as THREE.Material).dispose()
      },
    }
  }

  private createFloatingShapes(): SceneRuntime {
    const group = new THREE.Group()
    const shapes: THREE.Mesh[] = []
    const palette = ['#67e8f9', '#c084fc', '#f9a8d4', '#93c5fd']

    for (let i = 0; i < 7; i++) {
      const geometry = i % 2 === 0 ? new THREE.IcosahedronGeometry(0.48, 0) : new THREE.OctahedronGeometry(0.52, 0)
      const material = new THREE.MeshStandardMaterial({
        color: palette[i % palette.length],
        emissive: palette[i % palette.length],
        emissiveIntensity: 0.65,
        metalness: 0.5,
        roughness: 0.2,
      })
      const mesh = new THREE.Mesh(geometry, material)
      shapes.push(mesh)
      group.add(mesh)
    }

    return {
      group,
      update: (t) => {
        shapes.forEach((mesh, index) => {
          const angle = (index / shapes.length) * Math.PI * 2 + t * 0.28
          mesh.position.x = Math.cos(angle) * 2.45
          mesh.position.y = Math.sin(angle * 1.15) * 1.28
          mesh.position.z = Math.sin(angle) * 1.15
          mesh.rotation.x = t + index
          mesh.rotation.y = t * 0.9 + index * 0.6
        })
        group.rotation.y = t * 0.4 + this.pointer.x * 0.8
        group.rotation.x = this.pointer.y * 0.6
      },
      dispose: () => {
        shapes.forEach((mesh) => {
          mesh.geometry.dispose()
          ;(mesh.material as THREE.Material).dispose()
        })
      },
    }
  }

  resize() {
    if (this.disposed) return
    const width = this.element.clientWidth || this.element.parentElement?.clientWidth || 900
    const height = this.element.clientHeight || this.element.parentElement?.clientHeight || 500
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderFrame()
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('pointermove', this.onPointerMove)
    this.element.removeEventListener('pointerdown', this.onCanvasPointerDown)
    this.element.removeEventListener('pointermove', this.onCanvasPointerMove)
    this.element.removeEventListener('pointerup', this.onCanvasPointerUp)
    this.element.removeEventListener('pointercancel', this.onCanvasPointerUp)
    this.element.removeEventListener('wheel', this.onCanvasWheel)
    this.ro.disconnect()
    this.clearCurrentScene()
    this.renderer.dispose()
  }
}
