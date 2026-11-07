import { about, profile, site } from '../../data/portfolio'
import { SectionHeading } from '../ui/SectionHeading'
import '../../styles/about.css'

export function About() {
  return (
    <section id="about" className="about" aria-labelledby="about-title">
      <div className="container about-grid">
        <div className="about-copy">
          <div className="about-portrait-wrap">
            <img className="about-portrait" src={profile.avatar} alt={`${site.name} avatar`} />
          </div>
          <SectionHeading
            eyebrow="About"
            title={about.heading}
            lead={about.paragraphs[0]}
          />
          <div className="about-body">
            {about.paragraphs.slice(1).map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
            <p className="about-sign">
              — <em className="accent">{site.name}</em>
            </p>
          </div>
        </div>

        <aside className="about-facts" aria-label={`Quick facts about ${site.name}`}>
          <span className="about-facts-label">Quick facts</span>
          <dl>
            {about.facts.map((fact) => (
              <div className="about-fact" key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>
                  {fact.value.split('•').map((part, index) => (
                    <span key={index}>
                      {index > 0 ? (
                        // nbsp keeps the bullet glued to the word before it, so a
                        // wrapped line never starts with a bare separator.
                        <span className="about-fact-sep" aria-hidden="true">
                          {'\u00a0• '}
                        </span>
                      ) : null}
                      {part.trim()}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </section>
  )
}
