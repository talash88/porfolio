import { skills } from '../../data/portfolio'
import { FlipCard } from '../ui/FlipCard'
import { SectionHeading } from '../ui/SectionHeading'
import '../../styles/skills.css'

export function Skills() {
  return (
    <section id="skills" className="skills" aria-labelledby="skills-title">
      <div className="container">
        <SectionHeading eyebrow="Skills" title={skills.heading} lead={skills.lead} />
        <ul className="skill-groups">
          {skills.groups.map((group, gi) => (
            <FlipCard
              as="li"
              className="skill-group"
              key={group.title}
              label={`${group.title} skills`}
              front={
                <div className="skill-group-face">
                  <div className="skill-group-head">
                    <span className="skill-index" aria-hidden="true">
                      {String(gi + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3>{group.title}</h3>
                      <p>{group.caption}</p>
                    </div>
                  </div>
                  <ul className="skill-list">
                    {group.skills.map((skill) => (
                      <li key={skill} className="skill-row">
                        <span className="skill-tick" aria-hidden="true">
                          ＋
                        </span>
                        {skill}
                      </li>
                    ))}
                  </ul>
                </div>
              }
              back={
                <div className="skill-group-face skill-group-face--back">
                  <span className="skill-index" aria-hidden="true">
                    {String(gi + 1).padStart(2, '0')}
                  </span>
                  <h3>{group.title}</h3>
                  <p>{group.caption}</p>
                  <ul className="skill-back-list">
                    {group.skills.map((skill) => (
                      <li key={skill}>{skill}</li>
                    ))}
                  </ul>
                </div>
              }
            />
          ))}
        </ul>
      </div>
    </section>
  )
}
