import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { projects, type Project } from '../../data/portfolio'
import { SectionHeading } from '../ui/SectionHeading'
import '../../styles/projects.css'

/* ------------------------------------------------------------------
 * Generative CSS artwork — the composition is derived from the
 * project's accent hue, so each card feels distinct without any
 * fabricated screenshots or stock images.
 * ----------------------------------------------------------------- */
export function ProjectArt({ project, large = false }: { project: Project; large?: boolean }) {
  const tilt = ((project.hue * 7) % 160) - 80
  return (
    <div
      className={`project-art${large ? ' project-art--lg' : ''}`}
      style={{ '--hue': project.hue, '--tilt': `${tilt}deg` } as CSSProperties}
      role="img"
      aria-label={`Abstract generated artwork for ${project.title}`}
    >
      <i className="project-art-orb" />
      <i className="project-art-stripes" />
    </div>
  )
}

/* ------------------------------------------------------------------
 * Case-study dialog — a native <dialog>: real focus trapping, Escape
 * to close, and focus restoration for free.
 * ----------------------------------------------------------------- */
function ProjectDialog(props: { project: Project | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { project } = props

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (project && !dlg.open) dlg.showModal()
    if (!project && dlg.open) dlg.close()
  }, [project])

  return (
    <dialog
      ref={ref}
      className="project-dialog"
      aria-labelledby="project-dialog-title"
      onClose={props.onClose}
      onClick={(e) => {
        // click on the backdrop (the dialog element itself) closes
        if (e.target === ref.current) ref.current.close()
      }}
    >
      {project ? (
        <div className="project-dialog-inner">
          <button type="button" className="project-dialog-close" onClick={props.onClose}>
            <span className="visually-hidden">Close case study</span>
            <span aria-hidden="true">✕</span>
          </button>

          <ProjectArt project={project} large />

          <div className="project-dialog-body">
            <p className="project-dialog-meta">
              <span>{project.index}</span>
              {project.category} · {project.year}
            </p>
            <h3 id="project-dialog-title" className="display">
              {project.title}
            </h3>
            <p className="project-dialog-summary">{project.summary}</p>

            <dl className="project-dialog-facts">
              <div>
                <dt>Role</dt>
                <dd>{project.role}</dd>
              </div>
              <div>
                <dt>Built with</dt>
                <dd>
                  <ul className="stack-chips">
                    {project.stack.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>

            {project.links?.live || project.links?.source ? (
              <div className="project-dialog-actions">
                {project.links?.live ? (
                  <a className="btn" href={project.links.live} target="_blank" rel="noreferrer noopener">
                    Visit live project
                  </a>
                ) : null}
                {project.links?.source ? (
                  <a className="btn btn--ghost" href={project.links.source} target="_blank" rel="noreferrer noopener">
                    View source
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="project-dialog-note">
                Live and source links will appear here once this project publishes — no dead buttons.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  )
}

/* ------------------------------------------------------------------
 * Section — list rows + cursor-following artwork preview (fine pointer
 * only, disabled for reduced motion). Rows open the case-study dialog.
 * ----------------------------------------------------------------- */
export function Projects() {
  const [dialogProject, setDialogProject] = useState<Project | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const sectionRef = useRef<HTMLElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: 0, y: 0, tx: 0, ty: 0, raf: 0 })

  // lerp-follow the cursor, only while a row is hovered
  useEffect(() => {
    const preview = previewRef.current
    const section = sectionRef.current
    if (!preview || !section) return

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      pos.current.tx = e.clientX + 28
      pos.current.ty = e.clientY - 110
      if (pos.current.raf) return
      const tick = () => {
        pos.current.raf = requestAnimationFrame(tick)
        const p = pos.current
        p.x += (p.tx - p.x) * 0.18
        p.y += (p.ty - p.y) * 0.18
        preview.style.transform = `translate(${p.x}px, ${p.y}px)`
      }
      pos.current.raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(pos.current.raf)
    }
  }, [])

  useEffect(() => {
    if (hoverIndex === null) previewRef.current?.classList.remove('is-visible')
    else if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      previewRef.current?.classList.add('is-visible')
    }
  }, [hoverIndex])

  return (
    <section id="projects" className="projects" ref={sectionRef} aria-labelledby="projects-title">
      <div className="container">
        <SectionHeading
          eyebrow="Projects"
          title={projects.heading}
          lead={projects.lead}
          id="projects-title"
        />

        <ul className="project-list">
          {projects.items.map((project, i) => (
            <li key={project.id} className="project-item">
              <button
                type="button"
                className="project-row"
                onPointerEnter={() => setHoverIndex(i)}
                onPointerLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(null)}
                onClick={() => setDialogProject(project)}
                aria-haspopup="dialog"
              >
                <span className="project-row-index" aria-hidden="true">
                  {project.index}
                </span>
                <span className="project-row-main">
                  <span className="project-row-title display">{project.title}</span>
                  <span className="project-row-summary">{project.summary}</span>
                  <span className="stack-chips stack-chips--inline">
                    {project.stack.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </span>
                </span>
                <span className="project-row-meta">
                  <span>{project.category}</span>
                  <span>{project.year}</span>
                  <span className="project-row-open" aria-hidden="true">
                    <span className="project-row-open-label">Open case</span>
                    <span className="project-row-open-arrow">→</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* cursor-following preview card */}
      <div ref={previewRef} className="project-preview" aria-hidden="true">
        {hoverIndex !== null ? <ProjectArt project={projects.items[hoverIndex]} /> : null}
      </div>

      <ProjectDialog project={dialogProject} onClose={() => setDialogProject(null)} />
    </section>
  )
}
