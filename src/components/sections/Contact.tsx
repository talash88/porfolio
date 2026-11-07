import { useRef, useState, type FormEvent } from 'react'
import { contact, socials, type SocialLink } from '../../data/portfolio'
import { SectionHeading } from '../ui/SectionHeading'
import { Icon } from '../ui/Icon'
import '../../styles/contact.css'

/* Socials — placeholders (bracketed URLs in the config) render as inert
   chips so the live site never exposes a broken link. */
function SocialRow({ social }: { social: SocialLink }) {
  const isPlaceholder = social.href.startsWith('[')
  const inner = (
    <>
      <Icon name={social.icon} />
      <span className="social-label">{social.label}</span>
      <span className="social-handle">{social.handle}</span>
    </>
  )
  if (isPlaceholder) {
    return (
      <span
        className="social social--placeholder"
        title="Placeholder — set the real URL in src/data/portfolio.ts"
        aria-label={`${social.label} — link not set yet`}
      >
        {inner}
      </span>
    )
  }
  return (
    <a className="social" href={social.href} target="_blank" rel="noreferrer noopener">
      {inner}
    </a>
  )
}

function ContactForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState(contact.formNote)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const payload = {
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      subject: String(data.get('subject') ?? '').trim(),
      message: String(data.get('message') ?? '').trim(),
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)

    for (const el of form.querySelectorAll<HTMLElement>('[data-error]')) el.hidden = true
    const invalid: string[] = []
    if (payload.name.length === 0 || payload.name.length < 2) invalid.push('name')
    if (!emailOk) invalid.push('email')
    if (payload.subject.length === 0 || payload.subject.length < 3) invalid.push('subject')
    if (payload.message.length < 10) invalid.push('message')

    for (const id of invalid) {
      const node = form.querySelector<HTMLElement>(`[data-error="${id}"]`)
      if (node) node.hidden = false
    }

    if (invalid.length > 0) {
      setStatus('error')
      setMessage('Please fix the highlighted fields and try again.')
      form.querySelector<HTMLElement>(`[name="${invalid[0]}"]`)?.focus()
      return
    }

    setStatus('loading')
    setMessage('Sending...')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = (await response.json().catch(() => ({ success: false, error: 'Unable to send message.' }))) as {
        success?: boolean
        error?: string
        message?: string
      }

      if (!response.ok || !result.success) {
        setStatus('error')
        setMessage(result.error || 'The message could not be sent right now.')
        return
      }

      form.reset()
      setStatus('success')
      setMessage(result.message || 'Your message has been sent successfully.')
    } catch {
      setStatus('error')
      setMessage('The message could not be sent. Please try again in a moment.')
    }
  }

  return (
    <form className="contact-form" ref={formRef} onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="cf-name">Name</label>
        <input id="cf-name" name="name" type="text" autoComplete="name" required placeholder="[ Your name ]" />
        <p className="field-error" data-error="name" hidden>
          Please tell me your name.
        </p>
      </div>
      <div className="field">
        <label htmlFor="cf-email">Email</label>
        <input id="cf-email" name="email" type="email" autoComplete="email" required placeholder="[ you@domain.com ]" />
        <p className="field-error" data-error="email" hidden>
          That email does not look right.
        </p>
      </div>
      <div className="field">
        <label htmlFor="cf-subject">Subject</label>
        <input id="cf-subject" name="subject" type="text" autoComplete="off" required placeholder="[ Project inquiry ]" />
        <p className="field-error" data-error="subject" hidden>
          Please add a meaningful subject line.
        </p>
      </div>
      <div className="field">
        <label htmlFor="cf-message">Message</label>
        <textarea id="cf-message" name="message" rows={5} required placeholder="[ What can I help you build? ]" />
        <p className="field-error" data-error="message" hidden>
          A few words are needed so the reply can be useful.
        </p>
      </div>
      <div className="form-foot">
        <button type="submit" className="btn" disabled={status === 'loading'}>
          {status === 'loading' ? 'Sending...' : 'Send message'}
          <span aria-hidden="true">↗</span>
        </button>
        <p className="form-note" role="status" aria-live="polite">
          {message}
        </p>
      </div>
    </form>
  )
}

export function Contact() {
  return (
    <section id="contact" aria-labelledby="contact-title">
      <div className="container contact-grid">
        <div className="contact-left">
          <SectionHeading eyebrow="Contact" title={contact.heading} id="contact-title" />
          <p className="contact-intro">{contact.intro}</p>

          <ul className="social-list" aria-label="Social links">
            {socials.map((social) => (
              <li key={social.label}>
                <SocialRow social={social} />
              </li>
            ))}
          </ul>
        </div>

        <ContactForm />
      </div>
    </section>
  )
}
