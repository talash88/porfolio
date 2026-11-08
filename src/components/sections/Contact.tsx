import { useRef, useState, type FormEvent } from 'react'
import { contact, socials, type SocialLink } from '../../data/portfolio'
import { SectionHeading } from '../ui/SectionHeading'
import { Icon } from '../ui/Icon'
import '../../styles/contact.css'

const CONTACT_ENDPOINT = '/api/contact'

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
  /* Ref guard against duplicate submissions: while a request is in flight,
     any extra submit event (double-click, Enter key) is ignored. */
  const submittingRef = useRef(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submittingRef.current) return
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
    submittingRef.current = true

    try {
      const response = await fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      })

      const result = (response.headers.get('content-type')?.includes('application/json')
        ? await response.json().catch(() => null)
        : null) as {
        success?: boolean
        accepted?: boolean
        code?: string
        error?: string
        message?: string
      } | null

      if (!response.ok || !result || result.success !== true || result.accepted !== true) {
        setStatus('error')
        console.error(`Contact form API response: HTTP ${response.status} (${result?.code ?? 'unclassified'})`)
        if (response.status === 404 || result?.code === 'API_NOT_FOUND') {
          setMessage('The contact service was not found. Please use the direct email link instead.')
        } else if (response.status === 429 || result?.code === 'RATE_LIMITED' || result?.code === 'PROVIDER_RATE_LIMITED') {
          setMessage(result?.error || 'Too many messages were submitted. Please try again later.')
        } else if (result?.error) setMessage(result.error)
        else if (response.status >= 500) {
          setMessage('The contact service could not complete this request. Please try again later.')
        } else {
          setMessage(`The contact service returned HTTP ${response.status}. Please try again later.`)
        }
        return
      }

      form.reset()
      setStatus('success')
      setMessage(result.message || 'Your message was accepted by the email service.')
    } catch (error) {
      setStatus('error')
      const errorName = error instanceof Error ? error.name : 'NetworkError'
      console.error(`Contact form request failed: ${errorName}`)
      if (errorName === 'TimeoutError' || errorName === 'AbortError') {
        setMessage('The contact service took too long to respond. Please try again later.')
      } else {
        setMessage('Could not connect to the contact service. Please try again later or use the direct email link.')
      }
    } finally {
      submittingRef.current = false
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
