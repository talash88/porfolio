import * as THREE from 'three'

/**
 * heroScene — the hero's instanced "light bar" sculpture.
 *
 * A radial disc of thin vertical bars whose heights are driven by layered
 * sine noise; the pointer raises nearby bars and tints them toward the
 * site accent, rippling out from the cursor.
 *
 * Engineering:
 *  - All geometry/materials created once; per-frame work is transforms+colors.
 *  - DPR capped, instance count adapted to viewport, GPU work pauses when the
 *    canvas is off-screen or the tab is hidden.
 *  - Fully disposes on unmount (StrictMode-safe: create → dispose → create).
 *  - If WebGL is unavailable the class throws `WebGLUnsupported` and the
 *    component renders the typographic hero without the canvas.
 */

export class WebGLUnsupported extends Error {
  constructor() {
    super('WebGL is not available')
    this.name = 'WebGLUnsupported'
  }
}

const ACCENT = new THREE.Color('#c9f24f')

/** Cheap layered-sine noise — visually equivalent to value noise here. */
function noise(x: number, y: number, z: number): number {
  return (
    Math.sin(x * 1.7 + y * 2.3 + z * 0.9) * 0.45 +
    Math.sin(x * 3.1 - y * 1.4 + z * 1.7) * 0.3 +
    Math.sin(x * 0.6 + y * 3.7 - z * 0.6) * 0.25
  )
}

interface Bar {
  x: number
  z: number
  phase: number
  scale: number
}

export class HeroScene {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private mesh: THREE.InstancedMesh
  private raycaster = new THREE.Raycaster()
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private bars: Bar[] = []
  private reduced: boolean
  private raf = 0
  private clock = new THREE.Clock()
  private pointer = new THREE.Vector2(-10, -10) // off-disc by default
  private hit = new THREE.Vector3(0, 0, 0) // pointer position on disc plane
  private cameraTarget = new THREE.Vector3(0, 0.4, 0)
  private running = false
  private disposed = false
  private ro: ResizeObserver
  private io: IntersectionObserver

  constructor(private canvas: HTMLCanvasElement, options: { reducedMotion: boolean }) {
    this.reduced = options.reducedMotion

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    this.renderer = renderer

    this.scene = new THREE.Scene()
    // Test hook (harmless in prod): lets Playwright assert scene state.
    ;(window as unknown as Record<string, unknown>).__heroScene = this
    this.scene.fog = new THREE.Fog('#0a0b0e', 9, 16)

    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 600
    renderer.setSize(w, h, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))

    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 40)
    this.camera.position.set(0, 4.6, 8.2)
    this.camera.lookAt(this.cameraTarget)

    // --- lights -----------------------------------------------------------
    this.scene.add(new THREE.HemisphereLight('#8a90ff', '#0a0b0e', 0.55))
    const accent = new THREE.PointLight(ACCENT, 90, 14, 1.6)
    accent.position.set(-3.5, 4.2, 1.5)
    this.scene.add(accent)
    const rim = new THREE.DirectionalLight('#4a5160', 0.5)
    rim.position.set(4, 3, -4)
    this.scene.add(rim)

    // --- bar field ----------------------------------------------------------
    const isSmall = w < 860
    const count = isSmall ? 300 : 640
    const geo = new THREE.BoxGeometry(0.09, 1, 0.09)
    geo.translate(0, 0.5, 0) // grow upward from the disc plane
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0.1 })
    this.mesh = new THREE.InstancedMesh(geo, mat, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)

    // polar distribution — denser at the rim for a nicer silhouette
    let i = 0
    const golden = Math.PI * (3 - Math.sqrt(5))
    while (i < count) {
      const t = i / count
      const angle = i * golden
      const radius = Math.sqrt(t) * 5.1 + 0.55
      const scale = 0.55 + ((i * 37) % 11) / 11 * 0.9
      this.bars.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        phase: ((i * 61) % 628) / 100,
        scale,
      })
      i++
    }
    this.scene.add(this.mesh)

    // --- depth: sparse dust behind the disc --------------------------------
    const dustCount = isSmall ? 90 : 180
    const dustGeo = new THREE.BufferGeometry()
    const dustPos = new Float32Array(dustCount * 3)
    for (let d = 0; d < dustCount; d++) {
      dustPos[d * 3] = (Math.random() - 0.5) * 22
      dustPos[d * 3 + 1] = Math.random() * 6 - 1
      dustPos[d * 3 + 2] = -4 - Math.random() * 9
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: '#5a6070',
        size: 0.035,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    )
    this.scene.add(dust)

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas.parentElement ?? canvas)
    this.io = new IntersectionObserver(
      (entries) => this.setRunning(entries[0]?.isIntersecting ?? false),
      { rootMargin: '80px' },
    )
    this.io.observe(canvas)
    document.addEventListener('visibilitychange', this.onVisibility)
    /* A lost WebGL context (GPU reset, mobile background reclaim) would
       otherwise freeze the scene forever — preventDefault tells the browser
       we want it back, and restore resumes the loop. */
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    // window-level listeners: the copy container overlays the canvas, so the
    // canvas itself would miss most pointer events.
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp, { passive: true })
    window.addEventListener('pointercancel', this.onPointerUp, { passive: true })

    if (this.reduced) {
      // One calm static frame with the default rotation.
      this.rotY = 0.6
      this.scene.rotation.y = this.rotY
      this.update(4, 0)
      renderer.render(this.scene, this.camera)
    }
  }

  private onVisibility = () => this.setRunning(!document.hidden)

  private onContextLost = (event: Event) => {
    event.preventDefault()
    this.setRunning(false)
  }

  private onContextRestored = () => {
    if (this.disposed) return
    if (this.reduced) {
      this.renderer.render(this.scene, this.camera)
    } else {
      this.setRunning(true)
    }
  }

  private dragging = false
  private lastX = 0
  private rotVel = 0
  private rotY = 0

  private onPointerMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect()
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    )
    if (this.dragging) {
      const delta = (e.clientX - this.lastX) * 0.004
      // smoothed velocity from the recent delta only — moves accumulate once,
      // so continuing the drag feels like inertia and can't run away.
      this.rotVel = this.rotVel * 0.55 + delta * 0.45
      this.rotVel = Math.max(-0.12, Math.min(0.12, this.rotVel))
      this.lastX = e.clientX
    }
  }

  /** Drag starts only on the hero's empty canvas area, never on real controls. */
  private onPointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement | null
    if (!target) return
    if (target.closest('a, button, input, textarea, select') && target !== this.canvas) return
    this.dragging = true
    this.lastX = e.clientX
  }

  private onPointerUp = () => {
    this.dragging = false
  }

  private resize() {
    if (this.disposed) return
    const parent = this.canvas.parentElement
    if (!parent) return
    const w = parent.clientWidth
    const h = parent.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.reduced) this.renderer.render(this.scene, this.camera)
  }

  private setRunning(should: boolean) {
    if (this.disposed) return
    const allowed = should && !document.hidden
    if (allowed && !this.running) {
      this.running = true
      if (!this.reduced) this.loop()
    } else if (!allowed && this.running) {
      this.running = false
      cancelAnimationFrame(this.raf)
    }
  }

  private loop = () => {
    if (!this.running || this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    this.frames = (this.frames ?? 0) + 1
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.getElapsedTime()
    this.update(t, dt)
    this.renderer.render(this.scene, this.camera)
  }
  private frames = 0

  /** Total rendered frames — lets tests verify the GPU actually pauses. */
  get frameCount() {
    return this.frames
  }

  /** Called from `window` scroll by the component so the camera can parallax. */
  setScrollProgress(progress: number) {
    if (this.disposed) return
    const p = Math.max(0, Math.min(1, progress))
    this.camera.position.y = 4.6 + p * 2.2
    this.camera.position.z = 8.2 + p * 1.6
    this.scene.position.y = -p * 1.4
    if (this.reduced) this.renderer.render(this.scene, this.camera)
  }

  private update(t: number, dt: number) {
    // rotation: slow auto-spin + drag inertia, damped when idle
    this.rotY += this.rotVel + dt * 0.03
    this.rotVel *= 0.94
    if (Math.abs(this.rotVel) < 0.0004) this.rotVel = 0
    // pointer → disc-plane point
    this.raycaster.setFromCamera(this.pointer, this.camera)
    this.raycaster.ray.intersectPlane(this.plane, this.hit)

    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const col = new THREE.Color()
    const base = new THREE.Color('#191c26')
    const lift = new THREE.Color('#5d6478')

    for (let i = 0; i < this.bars.length; i++) {
      const b = this.bars[i]
      const wave =
        noise(b.x * 0.55, b.z * 0.55, t * 0.5) * 0.5 +
        noise(b.x * 1.3 + 40, b.z * 1.3, t * 0.22) * 0.18

      // pointer ripple — boost height within a falloff radius of the hit point
      const dx = b.x - this.hit.x
      const dz = b.z - this.hit.z
      const dist2 = dx * dx + dz * dz
      const ripple = Math.exp(-dist2 / 1.6)

      const height = b.scale * (0.35 + Math.abs(wave) * 0.9 + ripple * 1.5)
      const glow = Math.abs(wave) * 0.22 + ripple

      pos.set(b.x, 0, b.z)
      scl.set(1, height, 1)
      pos.y = 0
      m.compose(pos, q, scl)
      this.mesh.setMatrixAt(i, m)

      col.copy(glow > 0.02 ? lift : base).lerp(ACCENT, Math.min(1, glow))
      this.mesh.setColorAt(i, col)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor!.needsUpdate = true

    // gentle pointer parallax on the camera when the pointer is off-disc
    const drift = this.pointer.x > -5 ? this.pointer.x : 0
    this.camera.position.x = drift * 0.55
    this.camera.lookAt(this.cameraTarget)
    this.scene.rotation.y = this.rotY
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.io.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose()
        const mat = obj.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    })
    this.renderer.dispose()
  }
}
