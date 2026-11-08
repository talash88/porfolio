import * as THREE from 'three/webgpu'
import * as TSL from 'three/tsl'
import type { SceneRuntime } from './playgroundScene'

type EarthPresetOptions = {
  container: HTMLElement
  inputCanvas: HTMLCanvasElement
  reducedMotion: boolean
}

const textureAssets = [
  { file: 'earth-day.jpg', colorSpace: THREE.SRGBColorSpace },
  { file: 'earth-night.jpg', colorSpace: THREE.SRGBColorSpace },
  { file: 'earth-clouds.jpg', colorSpace: THREE.NoColorSpace },
  { file: 'earth-normal.png', colorSpace: THREE.NoColorSpace },
  { file: 'earth-specular.png', colorSpace: THREE.NoColorSpace },
] as const

const minZoom = 5.35
const maxZoom = 14

export async function createEarthPreset({
  container,
  inputCanvas,
  reducedMotion,
}: EarthPresetOptions): Promise<SceneRuntime> {
  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.domElement.className = 'playground-earth-canvas'
  renderer.domElement.setAttribute('aria-hidden', 'true')

  const textures = new Set<THREE.Texture>()
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const loader = new THREE.TextureLoader()
  const textureRequests = textureAssets.map(({ file, colorSpace }) => {
    const url = `${import.meta.env.BASE_URL}earth/${file}`
    return new Promise<THREE.Texture>((resolve, reject) => {
      let texture: THREE.Texture
      texture = loader.load(
        url,
        (loaded) => resolve(loaded),
        undefined,
        () => reject(new Error(`Unable to load Earth texture: ${url}`)),
      )
      texture.colorSpace = colorSpace
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.anisotropy = 4
      textures.add(texture)
    })
  })
  const rendererInitialization = renderer.init()
  let contextLost = false

  try {
    const [, loadedTextures] = await Promise.all([
      rendererInitialization,
      Promise.all(textureRequests),
    ])
    const [dayTexture, nightTexture, cloudTexture, normalTexture, specularTexture] = loadedTextures
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#02040a')

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    let targetZoom = 6.2
    camera.position.set(0, 0, targetZoom)
    camera.lookAt(0, 0, 0)

    const sunDirection = new THREE.Vector3(0.82, 0.24, 0.52).normalize()
    const sunUniform = TSL.uniform(sunDirection)
    const sun = new THREE.DirectionalLight('#fff0d4', 3.2)
    sun.position.copy(sunDirection).multiplyScalar(8)
    const ambient = new THREE.HemisphereLight('#a9c8ff', '#080d1a', 0.18)
    scene.add(sun, ambient)

    const earthGroup = new THREE.Group()
    earthGroup.rotation.z = THREE.MathUtils.degToRad(23.4)
    scene.add(earthGroup)

    const earthGeometry = new THREE.SphereGeometry(1.65, 96, 64)
    geometries.push(earthGeometry)
    const earthMaterial = new THREE.MeshStandardNodeMaterial()
    earthMaterial.colorNode = TSL.texture(dayTexture, TSL.uv())
    earthMaterial.normalMap = normalTexture
    earthMaterial.normalScale.set(0.72, 0.72)
    earthMaterial.metalness = 0.04
    earthMaterial.roughnessNode = TSL.mix(
      TSL.float(0.92),
      TSL.float(0.28),
      TSL.texture(specularTexture, TSL.uv()).r,
    )
    const sunFacing = TSL.normalWorldGeometry.dot(sunUniform)
    const nightSide = TSL.float(1).sub(TSL.smoothstep(-0.2, 0.18, sunFacing))
    earthMaterial.emissiveNode = TSL.texture(nightTexture, TSL.uv()).rgb.mul(nightSide)
    materials.push(earthMaterial)
    const earth = new THREE.Mesh(earthGeometry, earthMaterial)
    earthGroup.add(earth)

    const cloudGeometry = new THREE.SphereGeometry(1.672, 96, 64)
    geometries.push(cloudGeometry)
    const cloudMaterial = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
    })
    const cloudCoverage = TSL.smoothstep(0.18, 0.55, TSL.texture(cloudTexture, TSL.uv()).r)
    cloudMaterial.colorNode = TSL.vec4(
      TSL.vec3(0.84, 0.9, 1),
      cloudCoverage.mul(0.56),
    )
    materials.push(cloudMaterial)
    const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial)
    earthGroup.add(clouds)

    const atmosphereGeometry = new THREE.SphereGeometry(1.78, 72, 48)
    geometries.push(atmosphereGeometry)
    const atmosphereMaterial = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const viewDirection = TSL.positionWorld.sub(TSL.cameraPosition).normalize()
    const atmosphereFacing = TSL.normalWorldGeometry.dot(viewDirection).abs().clamp(0, 1)
    // Let opacity taper to zero at the shell's silhouette instead of outlining it.
    const atmosphereFade = TSL.smoothstep(0.02, 0.7, atmosphereFacing)
    const atmosphereDay = TSL.smoothstep(-0.55, 0.35, sunFacing)
    const atmosphereColor = TSL.mix(
      TSL.vec3(0.28, 0.1, 0.27),
      TSL.vec3(0.1, 0.43, 1),
      atmosphereDay,
    )
    atmosphereMaterial.colorNode = TSL.vec4(
      atmosphereColor,
      atmosphereFade.mul(TSL.mix(0.18, 0.42, atmosphereDay)),
    )
    materials.push(atmosphereMaterial)
    earthGroup.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial))

    let seed = 0x5eed
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }
    const starCount = 900
    const starPositions = new Float32Array(starCount * 3)
    const starColors = new Float32Array(starCount * 3)
    for (let index = 0; index < starCount; index++) {
      const offset = index * 3
      starPositions[offset] = (random() - 0.5) * 70
      starPositions[offset + 1] = (random() - 0.5) * 40
      starPositions[offset + 2] = -34
      const brightness = 0.45 + random() * 0.55
      starColors[offset] = brightness * 0.8
      starColors[offset + 1] = brightness * 0.88
      starColors[offset + 2] = brightness
    }
    const starGeometry = new THREE.BufferGeometry()
    geometries.push(starGeometry)
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
    starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3))
    const starMaterial = new THREE.PointsMaterial({
      size: 0.045,
      transparent: true,
      opacity: 0.82,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    materials.push(starMaterial)
    const stars = new THREE.Points(starGeometry, starMaterial)
    stars.frustumCulled = false
    scene.add(stars)

    const size = container.getBoundingClientRect()
    const width = Math.max(1, Math.round(size.width))
    const height = Math.max(1, Math.round(size.height))
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setSize(width, height, false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.dataset.rendererBackend = renderer.backend.constructor.name.includes('WebGPU')
      ? 'webgpu'
      : 'webgl2'
    container.append(renderer.domElement)

    const originalTouchAction = inputCanvas.style.touchAction
    inputCanvas.style.touchAction = 'none'
    const pointers = new Map<number, { x: number; y: number }>()
    let lastDrag: { x: number; y: number; time: number } | null = null
    let pinchDistance = 0
    let velocityX = 0
    let velocityY = 0
    let disposed = false

    const getPinchDistance = () => {
      const [first, second] = Array.from(pointers.values())
      if (!first || !second) return 0
      return Math.hypot(first.x - second.x, first.y - second.y)
    }
    const setZoom = (distance: number) => {
      targetZoom = THREE.MathUtils.clamp(distance, minZoom, maxZoom)
      if (reducedMotion) camera.position.z = targetZoom
    }
    const onContextLost = (event: Event) => {
      event.preventDefault()
      contextLost = true
    }
    const onContextRestored = () => {
      contextLost = false
    }
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored)

    return {
      group: earthGroup,
      interactive: true,
      update: (_time, delta) => {
        if (reducedMotion || disposed) return
        if (pointers.size === 0) {
          earthGroup.rotation.y += (0.055 + velocityY) * delta
          earthGroup.rotation.x = THREE.MathUtils.clamp(
            earthGroup.rotation.x + velocityX * delta,
            -0.65,
            0.65,
          )
          const damping = Math.exp(-4.4 * delta)
          velocityX *= damping
          velocityY *= damping
        }
        camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZoom, 8, delta)
        clouds.rotation.y += 0.004 * delta
      },
      render: () => {
        if (!disposed && !contextLost) renderer.render(scene, camera)
      },
      resize: (nextWidth, nextHeight) => {
        if (disposed) return
        const safeWidth = Math.max(1, Math.round(nextWidth))
        const safeHeight = Math.max(1, Math.round(nextHeight))
        camera.aspect = safeWidth / safeHeight
        camera.updateProjectionMatrix()
        renderer.setSize(safeWidth, safeHeight, false)
      },
      pointerDown: (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (pointers.size === 1) {
          lastDrag = { x: event.clientX, y: event.clientY, time: event.timeStamp }
        } else {
          lastDrag = null
          pinchDistance = getPinchDistance()
        }
        inputCanvas.setPointerCapture(event.pointerId)
      },
      pointerMove: (event) => {
        const previous = pointers.get(event.pointerId)
        if (!previous) return
        const next = { x: event.clientX, y: event.clientY }
        if (pointers.size > 1) {
          pointers.set(event.pointerId, next)
          const nextDistance = getPinchDistance()
          if (pinchDistance > 0 && nextDistance > 0) {
            setZoom(targetZoom + (pinchDistance - nextDistance) * 0.012)
          }
          pinchDistance = nextDistance
          return
        }

        const deltaX = next.x - previous.x
        const deltaY = next.y - previous.y
        const elapsed = Math.max((event.timeStamp - (lastDrag?.time ?? event.timeStamp)) / 1000, 0.008)
        earthGroup.rotation.y += deltaX * 0.005
        earthGroup.rotation.x = THREE.MathUtils.clamp(
          earthGroup.rotation.x + deltaY * 0.005,
          -0.65,
          0.65,
        )
        velocityY = THREE.MathUtils.clamp((deltaX * 0.005) / elapsed, -2.5, 2.5)
        velocityX = THREE.MathUtils.clamp((deltaY * 0.005) / elapsed, -2.5, 2.5)
        pointers.set(event.pointerId, next)
        lastDrag = { ...next, time: event.timeStamp }
      },
      pointerUp: (event) => {
        pointers.delete(event.pointerId)
        if (pointers.size === 1) {
          const [remaining] = Array.from(pointers.values())
          if (remaining) lastDrag = { ...remaining, time: event.timeStamp }
        } else {
          lastDrag = null
        }
        pinchDistance = pointers.size > 1 ? getPinchDistance() : 0
      },
      wheel: (event) => {
        const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? container.clientHeight
            : 1
        setZoom(targetZoom + event.deltaY * unit * 0.004)
      },
      dispose: () => {
        if (disposed) return
        disposed = true
        inputCanvas.style.touchAction = originalTouchAction
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
        renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored)
        renderer.domElement.remove()
        scene.clear()
        geometries.forEach((geometry) => geometry.dispose())
        materials.forEach((material) => material.dispose())
        textures.forEach((texture) => texture.dispose())
        renderer.dispose()
      },
    }
  } catch (error) {
    await Promise.allSettled([rendererInitialization, ...textureRequests])
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    textures.forEach((texture) => texture.dispose())
    renderer.dispose()
    throw error
  }
}
