import { education } from '../../data/portfolio'
import { SectionHeading } from '../ui/SectionHeading'
import '../../styles/experience.css'

export function Education() {
  return (
    <section id="education" aria-labelledby="education-title">
      <div className="container">
        <SectionHeading eyebrow="Education" title={education.heading} id="education-title" />
        <ul className="edu-list">
          {education.items.map((item, i) => (
            <li className="edu-item" key={`${item.title}-${i}`}>
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
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
