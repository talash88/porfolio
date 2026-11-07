import { useEffect, useRef, useState } from 'react'
import {
  playgroundPresets,
  PlaygroundSceneManager,
  WebGLUnsupported,
  type RetroComputerAction,
  type RetroComputerStatus,
} from '../../three/playgroundScene'
import '../../styles/playground.css'

export function Playground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PlaygroundSceneManager | null>(null)
  const [activeId, setActiveId] = useState<(typeof playgroundPresets)[number]['id']>(playgroundPresets[0].id)
  const [webglUnsupported, setWebglUnsupported] = useState(false)
  const [computerStatus, setComputerStatus] = useState<RetroComputerStatus | null>(null)
  const isComputer = activeId === 'retro-computer'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      sceneRef.current?.dispose()
      sceneRef.current = new PlaygroundSceneManager(canvas, {
        reducedMotion: reduced,
        onComputerStatus: setComputerStatus,
      })
      setWebglUnsupported(false)
    } catch (error) {
      console.warn('Playground scene unavailable:', error)
      if (error instanceof WebGLUnsupported) {
        setWebglUnsupported(true)
      }
    }

    return () => {
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!sceneRef.current) return
    sceneRef.current.setPreset(activeId)
  }, [activeId])

  const activePreset = playgroundPresets.find((preset) => preset.id === activeId)
  const handleComputerAction = (action: RetroComputerAction) => sceneRef.current?.performComputerAction(action)
  const toggleFullscreen = () => {
    const shell = shellRef.current
    if (!shell) return
    if (document.fullscreenElement === shell) {
      void document.exitFullscreen()
    } else {
      void shell.requestFullscreen?.().catch((error: unknown) => {
        console.warn('Fullscreen is unavailable:', error)
      })
    }
  }

  return (
    <section id="playground" className="playground" aria-labelledby="playground-title">
      <div className="container">
        <div className="section-head">
          <span className="section-eyebrow">3D Playground</span>
          <h2 id="playground-title">Interactive experiments.</h2>
          <p className="lead">
            Select a preset to explore different Three.js compositions. The scene stays responsive and cleanly replaces the active composition without creating duplicate renderers.
          </p>
        </div>

        <div ref={shellRef} className="playground-shell">
          <div className="playground-toolbar" aria-label="Three.js scene presets">
            {playgroundPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`playground-button${activeId === preset.id ? ' is-active' : ''}`}
                onClick={() => setActiveId(preset.id)}
                aria-pressed={activeId === preset.id}
              >
                <span>{preset.label}</span>
              </button>
            ))}
          </div>

          <div
            className="playground-stage"
            role={isComputer ? 'application' : 'img'}
            aria-label={activePreset?.label ?? '3D playground'}
          >
            {webglUnsupported ? (
              <div className="playground-fallback">
                WebGL is unavailable in this browser, so the 3D playground is not available right now.
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                className="playground-canvas"
                tabIndex={isComputer ? 0 : undefined}
                aria-label={isComputer ? 'Retro computer. Click the keyboard and type commands after powering it on.' : undefined}
              />
            )}
          </div>

          {isComputer && !webglUnsupported && (
            <div className="playground-computer-controls" aria-label="Virtual Retro Computer controls">
              <button type="button" className="playground-button" onClick={() => handleComputerAction('power')}>
                {computerStatus?.powered ? 'Power Off' : 'Start Computer'}
              </button>
              <button
                type="button"
                className="playground-button"
                onClick={() => handleComputerAction('reset')}
                disabled={!computerStatus?.powered}
              >
                Reset
              </button>
              <button type="button" className="playground-button" onClick={() => handleComputerAction('drive')}>
                {computerStatus?.driveOpen ? 'Close Drive' : 'Open Drive'}
              </button>
              <button
                type="button"
                className="playground-button"
                onClick={() => handleComputerAction('disk')}
                disabled={!computerStatus?.driveOpen}
              >
                {computerStatus?.diskInserted ? 'Eject Disk' : 'Insert Disk'}
              </button>
              <button
                type="button"
                className="playground-button"
                onClick={() => handleComputerAction(computerStatus?.mode === 'games' ? 'terminal' : 'games')}
                disabled={!computerStatus?.powered}
              >
                {computerStatus?.mode === 'games' ? 'Return to Terminal' : 'Games Menu'}
              </button>
              <button type="button" className="playground-button" onClick={toggleFullscreen}>
                Fullscreen
              </button>
              <button type="button" className="playground-button" onClick={() => setActiveId('geometry')}>
                Exit Computer
              </button>
              <span className="playground-computer-status" aria-live="polite">
                {computerStatus?.powered ? 'ON' : 'OFF'} · {computerStatus?.diskInserted ? 'Disk inserted' : 'No disk'}
                {computerStatus?.powered ? ` · ${computerStatus.mode.toUpperCase()}` : ''}
                {' · '}Mouse drag rotates, wheel zooms, keyboard types
              </span>
            </div>
          )}

          <p className="playground-caption">
            {activePreset?.description}
          </p>
        </div>
      </div>
    </section>
  )
}
