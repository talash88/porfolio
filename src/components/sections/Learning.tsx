import { learning } from '../../data/portfolio'
import { FlipCard } from '../ui/FlipCard'
import { SectionHeading } from '../ui/SectionHeading'
import '../../styles/learning.css'

export function Learning() {
  return (
    <section id="learning" aria-labelledby="learning-title">
      <div className="container">
        <SectionHeading
          eyebrow="Learning"
          title={learning.heading}
          id="learning-title"
          lead={learning.lead}
        />
        <ul className="learning-grid">
          {learning.items.map((item, i) => (
            <FlipCard
              as="li"
              className="learning-card"
              key={`${item.name}-${i}`}
              label={item.name}
              front={
                <div className="learning-card-face">
                  <span className="learning-dot" aria-hidden="true" />
                  <h3>{item.name}</h3>
                  <p className="learning-note">{item.note}</p>
                  <p className="learning-state">
                    <span className="visually-hidden">Current state: </span>
                    {item.progressLabel}
                  </p>
                </div>
              }
              back={
                <div className="learning-card-face learning-card-face--back">
                  <span className="learning-dot" aria-hidden="true" />
                  <span className="learning-back-label">Current focus</span>
                  <h3>{item.name}</h3>
                  <p className="learning-note">{item.note}</p>
                  <p className="learning-state">{item.progressLabel}</p>
                </div>
              }
            />
          ))}
        </ul>
      </div>
    </section>
  )
}
