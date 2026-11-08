import { about, profile, site } from '../../data/portfolio'
import { FlipCard } from '../ui/FlipCard'
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

        <FlipCard
          as="aside"
          className="about-facts"
          label={`Quick facts about ${site.name}`}
          front={
            <div className="about-facts-face">
              <span className="about-facts-label">Quick facts</span>
              <dl>
                {about.facts.map((fact) => (
                  <div className="about-fact" key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>
                      {fact.value.split('•').map((part, index) => (
                        <span key={index}>
                          {index > 0 ? (
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
            </div>
          }
          back={
            <div className="about-facts-face about-facts-face--back">
              <span className="about-facts-label">At a glance</span>
              <dl>
                {[...about.facts].reverse().map((fact) => (
                  <div className="about-fact" key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          }
        />
      </div>
    </section>
  )
}
