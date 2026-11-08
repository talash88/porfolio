const DEFAULT_CONTACT_EMAIL = 'tejaskhadse900@gmail.com'

const sanitise = (value) => String(value ?? '').trim()
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const sanitizeText = (input) => String(input ?? '').replace(/[<>]/g, '').trim().replace(/\s+/g, ' ')

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const response = (status, code, error) => ({
  status,
  body: { success: false, code, error },
})

export async function processContactSubmission(payload, env = process.env) {
  try {
    const name = sanitise(payload?.name)
    const email = sanitise(payload?.email)
    const subject = sanitizeText(payload?.subject)
    const message = sanitise(payload?.message)

    if (!name || !email || !subject || !message) {
      return response(400, 'VALIDATION_ERROR', 'Please complete all required fields before sending.')
    }

    if (name.length < 2 || name.length > 120) {
      return response(400, 'VALIDATION_ERROR', 'Please enter a valid name.')
    }

    if (!isValidEmail(email)) {
      return response(400, 'VALIDATION_ERROR', 'Please use a valid email address.')
    }

    if (subject.length < 3 || subject.length > 180) {
      return response(400, 'VALIDATION_ERROR', 'Please provide a concise subject line.')
    }

    if (message.length < 10 || message.length > 5000) {
      return response(400, 'VALIDATION_ERROR', 'Message length must be between 10 and 5000 characters.')
    }

    const apiKey = String(env.BREVO_API_KEY || '').trim()
    if (!apiKey) {
      return response(
        503,
        'EMAIL_NOT_CONFIGURED',
        'Email delivery is temporarily unavailable. Please use the direct email link instead.',
      )
    }

    const recipient = env.CONTACT_EMAIL || DEFAULT_CONTACT_EMAIL
    const sender = env.CONTACT_FROM_EMAIL || recipient
    const submittedAt = new Date()
    const submittedAtIso = submittedAt.toISOString()
    const submittedAtText = submittedAt.toUTCString()

    let brevoResponse
    try {
      brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Portfolio Contact', email: sender },
          to: [{ email: recipient }],
          replyTo: { email },
          subject: `[Portfolio] ${subject}`,
          textContent: [
            `Name: ${name}`,
            `Email: ${email}`,
            `Subject: ${subject}`,
            `Submitted: ${submittedAtText} (UTC)`,
            '',
            'Message:',
            message,
          ].join('\n'),
          htmlContent: `
            <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
              <h2 style="margin-bottom: 12px;">New portfolio message</h2>
              <p><strong>Name:</strong> ${escapeHtml(name)}</p>
              <p><strong>Email:</strong> ${escapeHtml(email)}</p>
              <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
              <p><strong>Submitted:</strong> <time datetime="${submittedAtIso}">${escapeHtml(submittedAtText)} (UTC)</time></p>
              <div style="margin-top: 20px; padding: 16px; background: #f3f4f6; border-radius: 10px;">
                <p style="white-space: pre-wrap; margin: 0;">${escapeHtml(message).replace(/\n/g, '<br />')}</p>
              </div>
            </div>
          `,
        }),
      })
    } catch (fetchError) {
      const timedOut = fetchError?.name === 'TimeoutError' || fetchError?.name === 'AbortError'
      console.error('Brevo request failed:', timedOut ? 'timed out after 15s' : 'network error')
      return response(
        504,
        timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNREACHABLE',
        timedOut
          ? 'The email provider took too long to respond. Please try again later.'
          : 'Could not reach the email provider. Please try again later.',
      )
    }

    let providerResult = null
    try {
      providerResult = await brevoResponse.json()
    } catch {
      // A successful response must contain the provider's acceptance ID.
    }

    if (!brevoResponse.ok) {
      let providerCode = 'unknown'
      if (typeof providerResult?.code === 'string' && /^[a-z0-9_-]{1,60}$/i.test(providerResult.code)) {
        providerCode = providerResult.code
      }
      console.error(`Brevo error: HTTP ${brevoResponse.status} (${providerCode})`)

      const senderFailure =
        /(sender|from address|unverified|not verified)/i.test(
          `${providerCode} ${typeof providerResult?.message === 'string' ? providerResult.message : ''}`,
        )
      if (senderFailure) {
        return response(
          502,
          'SENDER_UNVERIFIED',
          'The email sender is not verified with the email service. Please use the direct email link instead.',
        )
      }
      if (brevoResponse.status === 401) {
        return response(
          502,
          'PROVIDER_AUTH',
          'The email service rejected its credentials. Please use the direct email link instead.',
        )
      }
      if (brevoResponse.status === 403) {
        return response(
          502,
          'PROVIDER_PERMISSION',
          'The email service denied permission to send this message. Please use the direct email link instead.',
        )
      }
      if (brevoResponse.status === 429) {
        return response(
          429,
          'PROVIDER_RATE_LIMITED',
          'The email service is receiving too many messages right now. Please try again later.',
        )
      }
      if (brevoResponse.status >= 500) {
        return response(502, 'PROVIDER_UNAVAILABLE', 'The email service is temporarily unavailable. Please try again later.')
      }
      return response(502, 'PROVIDER_REJECTED', 'The email provider rejected this message. Please try again later.')
    }

    if (typeof providerResult?.messageId !== 'string' || !providerResult.messageId) {
      console.error(`Brevo response missing acceptance ID: HTTP ${brevoResponse.status}`)
      return response(
        502,
        'PROVIDER_UNCONFIRMED',
        'The email service did not confirm delivery acceptance. Please try again later.',
      )
    }

    return {
      status: 200,
      body: {
        success: true,
        accepted: true,
        message: 'Your message was accepted by the email service.',
      },
    }
  } catch (error) {
    console.error('Contact endpoint failure:', error?.name ?? 'unknown')
    return response(500, 'SERVER_ERROR', 'Something went wrong while sending your message. Please try again later.')
  }
}

export function isSameOriginRequest(req) {
  const origin = req.headers.origin
  const host = req.headers.host
  if (typeof origin !== 'string' || typeof host !== 'string') return false

  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}
