import { education } from '../../data/portfolio'
import { FlipCard } from '../ui/FlipCard'
import { SectionHeading } from '../ui/SectionHeading'
import '../../styles/experience.css'

export function Education() {
  return (
    <section id="education" aria-labelledby="education-title">
      <div className="container">
        <SectionHeading eyebrow="Education" title={education.heading} id="education-title" />
        <ul className="edu-list">
          {education.items.map((item, i) => (
            <FlipCard
              as="li"
              className="edu-item"
              key={`${item.title}-${i}`}
              label={`${item.title} education`}
              front={
                <div className="edu-item-face">
                  <span className="edu-period">
                    <span className="xp-edu-dot--inline" aria-hidden="true" />
                    {item.period}
                  </span>
                  <div className="xp-edu-body xp-body">
                    <h3 className="xp-role" style={{ fontSize: 'var(--text-md)' }}>
                      {item.title}
                    </h3>
                    <p className="xp-edu-org">{item.org}</p>
                    <p className="xp-edu-note">{item.note}</p>
                  </div>
                  <span className="edu-type">{item.type}</span>
                </div>
              }
              back={
                <div className="edu-item-face edu-item-face--back">
                  <span className="edu-period">
                    <span className="xp-edu-dot--inline" aria-hidden="true" />
                    {item.period}
                  </span>
                  <div className="xp-edu-body xp-body">
                    <span className="edu-back-label">Education</span>
                    <h3 className="xp-role" style={{ fontSize: 'var(--text-md)' }}>
                      {item.title}
                    </h3>
                    <p className="xp-edu-org">{item.org}</p>
                    <p className="xp-edu-note">{item.note}</p>
                  </div>
                  <span className="edu-type">{item.type}</span>
                </div>
              }
            />
          ))}
        </ul>
      </div>
    </section>
  )
}
