import { experience } from '../../data/portfolio'
import { FlipCard } from '../ui/FlipCard'
import { SectionHeading } from '../ui/SectionHeading'
import '../../styles/experience.css'

export function Experience() {
  return (
    <section id="experience" aria-labelledby="experience-title">
      <div className="container">
        <SectionHeading
          eyebrow="Experience"
          title={experience.heading}
          id="experience-title"
          lead={experience.lead}
        />
        <ol className="xp-list">
          {experience.items.map((item, i) => (
            <FlipCard
              as="li"
              className="xp-item"
              key={`${item.role}-${i}`}
              label={`${item.role} at ${item.org}`}
              front={
                <>
                  <div className="xp-period">
                    <span className="xp-dot" aria-hidden="true" />
                    <span>{item.period}</span>
                  </div>
                  <div className="xp-body">
                    <h3 className="xp-role">{item.role}</h3>
                    <p className="xp-org">
                      {item.org} <span aria-hidden="true">·</span> {item.location}
                    </p>
                    <p className="xp-summary">{item.summary}</p>
                  </div>
                </>
              }
              back={
                <>
                  <div className="xp-period">
                    <span className="xp-dot" aria-hidden="true" />
                    <span>{item.period}</span>
                  </div>
                  <div className="xp-body xp-body--back">
                    <span className="xp-back-label">Experience</span>
                    <h3 className="xp-role">{item.role}</h3>
                    <p className="xp-org">
                      {item.org} <span aria-hidden="true">·</span> {item.location}
                    </p>
                    <p className="xp-summary">{item.summary}</p>
                  </div>
                </>
              }
            />
          ))}
        </ol>
      </div>
    </section>
  )
}
