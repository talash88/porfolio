import { useEffect, useRef, useState } from 'react'
import { community } from '../../data/portfolio'
import '../../styles/community.css'

interface CommunityMessage {
  id: string
  display_name: string
  message: string
  created_at: string
  user_id: string
  profile?: string
  reply_to?: string | null
  reply_preview?: string | null
}

interface CommunityMember {
  id: string
  display_name: string
  profile: string
}

/* Same-origin WebSocket: works behind any reverse proxy and upgrades to
   wss:// automatically on HTTPS. Requires /ws to be proxied to the API
   server in production (see README) and by the Vite dev proxy. */
const wsUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws`
}

export function DeveloperCommunity() {
  const [displayName, setDisplayName] = useState('')
  const [profile, setProfile] = useState('Student developer')
  const [messages, setMessages] = useState<CommunityMessage[]>([])
  const [members, setMembers] = useState<CommunityMember[]>([])
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null)
  const [joined, setJoined] = useState(false)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [notice, setNotice] = useState<string>(community.welcome)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading')
  const wsRef = useRef<WebSocket | null>(null)
  const feedRef = useRef<HTMLDivElement | null>(null)
  const prevCountRef = useRef(0)

  const pendingJoinRef = useRef<{ display_name: string; profile: string } | null>(null)
  const joinedRef = useRef(false)
  const profileRef = useRef(profile)
  profileRef.current = profile

  // Refs keep reconnect/rejoin logic free of stale render closures.
  const displayNameRef = useRef(displayName)
  displayNameRef.current = displayName

  const sendJoin = (socket: WebSocket) => {
    socket.send(JSON.stringify({ type: 'join', group: 'developer-community', display_name: displayNameRef.current.trim(), profile: profileRef.current.trim() || 'Student developer' }))
  }

  const connect = () => {
    if (wsRef.current) return

    const socket = new WebSocket(wsUrl())
    wsRef.current = socket

    socket.addEventListener('open', () => {
      setStatus('connected')
      if (pendingJoinRef.current) {
        socket.send(JSON.stringify({ type: 'join', group: 'developer-community', ...pendingJoinRef.current }))
      } else if (joinedRef.current) {
        sendJoin(socket)
        setNotice('Connection restored.')
      } else {
        // Fresh visitor (or post-reconnect): keep the status dot and the
        // notice consistent while the connection is up.
        setNotice(community.welcome)
      }
    })

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data)

        if (payload.type === 'history') {
          setMessages(payload.messages ?? [])
          if (payload.you) setViewerId(payload.you)
          setHistoryState('ready')
          return
        }

        if (payload.type === 'message') {
          setMessages((current) => [...current, payload.message].slice(-200))
          return
        }

        if (payload.type === 'presence') {
          setMembers(payload.members ?? [])
          return
        }

        if (payload.type === 'error') {
          setNotice(payload.message || 'Something went wrong.')
        }
      } catch {
        setNotice('The community connection returned an unexpected response.')
      }
    })

    socket.addEventListener('close', () => {
      setStatus('disconnected')
      setNotice('Connection lost. Reconnecting...')
      wsRef.current = null
      setTimeout(() => {
        if (!wsRef.current) connect()
      }, 2000)
    })

    socket.addEventListener('error', () => {
      setStatus('disconnected')
      setNotice('Unable to connect to the community right now.')
    })
  }

  useEffect(() => {
    fetch('/api/community/messages?group=developer-community')
      .then((response) => {
        if (!response.ok) throw new Error(`history request failed: ${response.status}`)
        return response.json()
      })
      .then((data) => {
        setMessages(data.messages ?? [])
        setHistoryState('ready')
      })
      .catch(() => setHistoryState('error'))

    connect()

    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  useEffect(() => {
    const feed = feedRef.current
    if (!feed) return

    const distanceFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight
    const initialLoad = prevCountRef.current === 0 && messages.length > 0
    prevCountRef.current = messages.length

    if (initialLoad || distanceFromBottom < 90) {
      // Scroll the chat feed's own container only — never the document,
      // so a fresh page load always stays at the Hero section.
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' })
      setUnread(0)
    } else {
      setUnread((count) => count + 1)
    }
  }, [messages])

  const jumpToLatest = () => {
    const feed = feedRef.current
    feed?.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' })
    setUnread(0)
  }

  const handleJoin = () => {
    const trimmedName = displayName.trim()
    if (trimmedName.length < 2) {
      setNotice('Choose a display name with at least 2 characters.')
      return
    }

    const joinPayload = { display_name: trimmedName, profile: profile.trim() || 'Student developer' }
    setJoined(true)
    joinedRef.current = true
    setNotice(`Joined ${community.name}. Start the conversation.`)

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      // Buffer the join: it is sent automatically once the socket opens.
      pendingJoinRef.current = joinPayload
      return
    }

    pendingJoinRef.current = null
    wsRef.current.send(JSON.stringify({ type: 'join', group: 'developer-community', ...joinPayload }))
  }

  const handleSend = () => {
    const cleaned = draft.trim()
    if (!cleaned || !joined || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    if (cleaned.length > 500) {
      setNotice('Messages must be 500 characters or fewer.')
      return
    }

    wsRef.current.send(
      JSON.stringify({
        type: 'message',
        group: 'developer-community',
        message: cleaned,
        reply_to: replyTo?.id ?? null,
        reply_preview: replyTo?.message ?? null,
      }),
    )

    setDraft('')
    setReplyTo(null)
    setNotice('Message sent.')
  }

  const handleReport = async (messageId: string) => {
    try {
      const response = await fetch('/api/community/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      })
      const data = await response.json()
      setNotice(data.message || 'Report sent to moderation.')
    } catch {
      setNotice('Report failed. Please try again later.')
    }
  }

  return (
    <section id="community" className="community-section" aria-labelledby="community-title">
      <div className="container community-shell">
        <div className="section-head community-head">
          <span className="section-eyebrow">Developer Community</span>
          <h2 id="community-title">{community.tagline}</h2>
          <p className="lead">{community.description}</p>
        </div>

        <div className="community-layout">
          <aside className="community-panel community-panel--sidebar">
            <div className="panel-header">
              <h3>{community.name}</h3>
            </div>

            <div className="community-summary">
              <p>{community.description}</p>
            </div>

            <div className="community-join">
              <label htmlFor="community-name">Display name</label>
              <input id="community-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" />

              <label htmlFor="community-profile">Profile</label>
              <input id="community-profile" value={profile} onChange={(event) => setProfile(event.target.value)} placeholder="Student developer" />

              <button type="button" className="btn" onClick={handleJoin}>
                {joined ? 'Update profile' : 'Join group'}
              </button>

              <p className="community-note">{notice}</p>
            </div>
          </aside>

          <div className="community-panel community-panel--chat">
            <div className="chat-header">
              <div>
                <p className="chat-label">Group</p>
                <h3>{community.name}</h3>
              </div>
              <div className="chat-status">
                <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
                {status === 'connected' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Offline'}
              </div>
            </div>

            {replyTo ? (
              <div className="reply-banner">
                <span>Replying to {replyTo.display_name}</span>
                <button type="button" onClick={() => setReplyTo(null)}>Clear</button>
              </div>
            ) : null}

            <div className="chat-messages" aria-live="polite" ref={feedRef}>
              {historyState === 'loading' ? <div className="chat-loading">Loading messages…</div> : null}
              {historyState === 'error' ? (
                <div className="chat-history-note">
                  Earlier messages could not be loaded. Live messages will still appear here in real time.
                </div>
              ) : null}
              {historyState !== 'loading' && messages.length ? (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className={message.user_id && message.user_id === viewerId ? 'chat-message chat-message--self' : 'chat-message'}
                  >
                    {message.reply_preview ? (
                      <div className="reply-preview">Replying to: {message.reply_preview}</div>
                    ) : null}
                    <div className="chat-message-topline">
                      <div className="chat-user">
                        <span className="member-avatar" aria-hidden="true">{message.display_name.slice(0, 1).toUpperCase()}</span>
                        <strong>{message.display_name}</strong>
                      </div>
                      <time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                    </div>
                    <p>{message.message}</p>
                    <div className="chat-actions-row">
                      <button type="button" className="chat-reply" onClick={() => setReplyTo(message)}>
                        Reply
                      </button>
                      <button type="button" className="chat-report" onClick={() => handleReport(message.id)}>
                        Report
                      </button>
                    </div>
                  </article>
                ))
              ) : historyState !== 'loading' ? (
                <div className="chat-empty">No messages yet. Start the conversation with the group.</div>
              ) : null}
              {unread > 0 ? (
                <button type="button" className="chat-unread-jump" onClick={jumpToLatest}>
                  ↓ {unread} new message{unread === 1 ? '' : 's'} — jump to latest
                </button>
              ) : null}
            </div>

            <div className="chat-compose">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                placeholder="Share a question, idea, or update with the group... 🙂"
                maxLength={500}
              />
              <div className="chat-actions">
                <span>{draft.length}/500</span>
                <button type="button" className="btn" onClick={handleSend} disabled={!joined || status !== 'connected'}>
                  Send message
                </button>
              </div>
            </div>
          </div>

          <aside className="community-panel community-panel--members">
            <div className="panel-header">
              <h3>Online</h3>
              <span className="panel-badge">{members.length}</span>
            </div>

            <div className="member-list">
              {members.length ? (
                members.map((member) => (
                  <div key={member.id} className="member-item">
                    <span className="member-avatar" aria-hidden="true">{member.display_name.slice(0, 1).toUpperCase()}</span>
                    <div className="member-copy">
                      <strong>{member.display_name}</strong>
                      <small>{member.profile || 'Developer'}</small>
                    </div>
                    <span className="member-status" aria-label="Online member" />
                  </div>
                ))
              ) : (
                <p className="member-empty">No members are online yet.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
