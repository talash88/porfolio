import { hero, site } from '../../data/portfolio'
import '../../styles/hero.css'

export function Hero() {
  return (
    <section id="hero" className="hero" aria-labelledby="hero-title">
      <div className="hero-scrim" aria-hidden="true" />

      <div className="container hero-inner">
        <div className="hero-copy">
          <p className="hero-status">
            <span className="pulse-dot" aria-hidden="true" />
            {hero.eyebrow}
          </p>
          <h1 id="hero-title" className="display hero-title">
            {hero.title.plain} <em className="accent">{hero.title.accent}</em>
          </h1>
          <p className="hero-subhead">{hero.subhead}</p>
          <p className="hero-lead">{hero.lead}</p>
          <div className="hero-actions">
            <a className="btn" href="#projects">
              View selected work
            </a>
            <a className="btn btn--ghost" href="#contact">
              Reach out
            </a>
          </div>
          <p className="hero-hint">
            <span className="hero-hint-mark" aria-hidden="true">
              ✳
            </span>
            {site.availability} · {hero.sceneHint}
          </p>
        </div>
      </div>

      <p className="hero-scroll-cta" aria-hidden="true">
        {hero.scrollCta}
        <span className="hero-scroll-arrow">↓</span>
      </p>
    </section>
  )
}
