import { experience } from '../../data/portfolio'
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
            <li className="xp-item" key={`${item.role}-${i}`}>
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
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
