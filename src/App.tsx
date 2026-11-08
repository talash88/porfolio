import { useEffect, useRef } from 'react'
import { useReducedMotion } from './hooks/useReducedMotion'
import type { HeroScene } from './three/heroScene'
import { Header } from './components/Header'
import { Hero } from './components/sections/Hero'
import { About } from './components/sections/About'
import { Playground } from './components/sections/Playground'
import { Skills } from './components/sections/Skills'
import { DeveloperCommunity } from './components/sections/DeveloperCommunity'
import { Projects } from './components/sections/Projects'
import { Experience } from './components/sections/Experience'
import { Education } from './components/sections/Education'
import { Learning } from './components/sections/Learning'
import { Contact } from './components/sections/Contact'
import { Footer } from './components/sections/Footer'

function SceneBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<HeroScene | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    import('./three/heroScene')
      .then(({ HeroScene, WebGLUnsupported }) => {
        if (cancelled) return
        sceneRef.current?.dispose()

        let scene: HeroScene
        try {
          scene = new HeroScene(canvas, { reducedMotion: reduced })
        } catch (err) {
          if (err instanceof WebGLUnsupported) {
            console.warn('WebGL unavailable — rendering the static portfolio background only.')
          } else {
            console.error('Background scene failed to start:', err)
          }
          return
        }

        sceneRef.current = scene

        let progress = 0
        let queued = false
        const onScroll = () => {
          if (queued) return
          queued = true
          requestAnimationFrame(() => {
            queued = false
            const next = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight || 1)))
            if (next !== progress) {
              progress = next
              scene.setScrollProgress(next)
            }
          })
        }

        window.addEventListener('scroll', onScroll, { passive: true })
        cleanupRef.current = () => {
          window.removeEventListener('scroll', onScroll)
          scene.dispose()
          sceneRef.current = null
        }
      })
      .catch((err) => {
        console.error('Background scene bundle failed to load:', err)
      })

    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [reduced])

  return (
    <div className="site-scene" aria-hidden="true">
      <canvas ref={canvasRef} className="site-scene-canvas" />
      <div className="site-scene-overlay" />
    </div>
  )
}

export default function App() {
  // SPA deep links: the browser's one-shot fragment navigation runs before the
  // sections mount, so loading `/#contact` directly would land at the top and
  // never retry. Re-run the scroll once the sections exist.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return
    document.getElementById(id)?.scrollIntoView()
  }, [])

  // Scroll-reveal: one observer handles every [data-reveal] element;
  // CSS honors prefers-reduced-motion, so nothing animates when it shouldn't.
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('[data-reveal]')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((el) => el.classList.add('is-revealed'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed')
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    nodes.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <span id="top" className="visually-hidden" />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SceneBackground />
      <Header />
      <main id="main" className="site-main">
        <Hero />
        <div data-reveal="about">
          <About />
        </div>
        <div data-reveal="playground">
          <Playground />
        </div>
        <DeveloperCommunity />
        <div data-reveal="skills">
          <Skills />
        </div>
        <Projects />
        <div data-reveal="xp">
          <Experience />
        </div>
        <div data-reveal="edu">
          <Education />
        </div>
        <div data-reveal="learning">
          <Learning />
        </div>
        <Contact />
      </main>
      <Footer />
      <div className="page-texture" aria-hidden="true" />
    </>
  )
}
