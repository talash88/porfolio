/** Shared section-heading pattern — one visual identity across all sections. */
export function SectionHeading(props: {
  eyebrow: string
  title: string
  lead?: string
  id?: string
}) {
  return (
    <header className="section-head">
      <span className="section-eyebrow">{props.eyebrow}</span>
      <h2 id={props.id}>{props.title}</h2>
      {props.lead ? <p className="lead">{props.lead}</p> : null}
    </header>
  )
}
