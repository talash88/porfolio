import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { community } from '../../data/portfolio'
import {
  COMMUNITY_GROUP,
  COMMUNITY_REALTIME_CHANNEL,
  getStoredIdentity,
  getStoredUserId,
  isCommunityConfigured,
  loadCommunityClient,
  storeIdentity,
} from '../../lib/communityClient'
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

/* Realtime architecture (Vercel-compatible — no WebSocket server needed):
 *  - history:  GET  /api/community/messages        (same-origin function)
 *  - send:     POST /api/community/messages        (server-validated, rate-limited)
 *  - live:     Supabase Realtime postgres_changes INSERT on community_messages
 *  - presence: Supabase Realtime presence (online members list)
 * Writes never happen from the browser; the anon key is read-only via RLS. */

/** Supabase subscribe callback status → the UI's three-state connection dot. */
function mapChannelStatus(status: string): 'connecting' | 'connected' | 'disconnected' {
  if (status === 'SUBSCRIBED') return 'connected'
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') return 'disconnected'
  return 'connecting'
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
  const [viewerId] = useState<string>(getStoredUserId())
  const [unread, setUnread] = useState(0)
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading')
  const feedRef = useRef<HTMLDivElement | null>(null)
  const prevCountRef = useRef(0)

  // Refs keep reconnect/track/send logic free of stale render closures.
  const displayNameRef = useRef(displayName)
  displayNameRef.current = displayName
  const profileRef = useRef(profile)
  profileRef.current = profile
  const joinedRef = useRef(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const connectingRef = useRef(false)
  const reconnectTimerRef = useRef<number | null>(null)
  const unmountRef = useRef(false)

  /* Upsert a stored row (from realtime INSERT or the POST result), replacing
   * a matching optimistic temp message so nothing is ever duplicated and the
   * canonical reply_preview from the server wins. */
  const mergeStoredMessage = (row: CommunityMessage) => {
    const stored: CommunityMessage = {
      id: String(row.id),
      display_name: String(row.display_name ?? ''),
      message: String(row.message ?? ''),
      created_at: String(row.created_at ?? new Date().toISOString()),
      user_id: row.user_id ? String(row.user_id) : '',
      profile: row.profile ? String(row.profile) : undefined,
      reply_to: row.reply_to ? String(row.reply_to) : null,
      reply_preview: row.reply_preview ? String(row.reply_preview) : null,
    }
    setMessages((current) => {
      const byFields = current.findIndex((m) => m.id.startsWith('tmp-') && m.user_id === stored.user_id && m.message === stored.message)
      if (byFields !== -1) {
        const next = [...current]
        next[byFields] = stored
        return next
      }
      const byId = current.findIndex((m) => m.id === stored.id)
      if (byId !== -1) {
        const next = [...current]
        next[byId] = stored
        return next
      }
      return [...current, stored].slice(-200)
    })
  }

  const removeMessage = (id: string) => {
    setMessages((current) => current.filter((message) => message.id !== id))
  }

  const trackPresence = (channel: RealtimeChannel) => {
    void channel.track({
      display_name: displayNameRef.current.trim() || 'Guest',
      profile: profileRef.current.trim() || 'Student developer',
    })
  }

  const scheduleReconnect = () => {
    if (reconnectTimerRef.current !== null || unmountRef.current) return
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null
      void connectRealtime()
    }, 2000)
  }

  const connectRealtime = async () => {
    if (unmountRef.current || connectingRef.current || !isCommunityConfigured()) return
    connectingRef.current = true

    let client: SupabaseClient
    try {
      client = await loadCommunityClient()
    } catch (error) {
      console.error('Community realtime unavailable:', error instanceof Error ? error.message : 'unknown')
      setStatus('disconnected')
      connectingRef.current = false
      scheduleReconnect()
      return
    }

    if (unmountRef.current) {
      connectingRef.current = false
      return
    }
    if (channelRef.current) {
      void client.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = client.channel(COMMUNITY_REALTIME_CHANNEL, {
      config: { presence: { key: viewerId } },
    })
    channelRef.current = channel

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages', filter: `channel=eq.${COMMUNITY_GROUP}` }, (payload) => {
        const row = payload.new as unknown as CommunityMessage | null
        if (row?.id) mergeStoredMessage(row)
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, Array<{ display_name?: string; profile?: string }>>
        const online: CommunityMember[] = []
        for (const [id, presences] of Object.entries(state)) {
          const presence = presences[0]
          if (presence?.display_name) {
            online.push({ id, display_name: presence.display_name, profile: presence.profile || 'Developer' })
          }
        }
        setMembers(online)
      })
      .subscribe((rawStatus: string) => {
        connectingRef.current = false
        const mapped = mapChannelStatus(rawStatus)
        if (mapped === 'connected') {
          setStatus('connected')
          if (joinedRef.current) {
            trackPresence(channel)
            setNotice('Connection restored.')
          }
        } else if (unmountRef.current) {
          return
        } else if (mapped === 'disconnected') {
          setStatus('disconnected')
          setNotice('Connection lost. Reconnecting...')
          scheduleReconnect()
        }
      })
  }

  useEffect(() => {
    if (!isCommunityConfigured()) {
      console.error('Developer Community: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable live chat.')
      setStatus('disconnected')
      setNotice('Live chat is not connected yet. Please check back soon.')
      return
    }

    /* Persistent identity: returning visitors are already joined. */
    const identity = getStoredIdentity()
    if (identity) {
      setDisplayName(identity.displayName)
      setProfile(identity.profile)
      setJoined(true)
      joinedRef.current = true
    }

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

    void connectRealtime()

    return () => {
      unmountRef.current = true
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      const channel = channelRef.current
      channelRef.current = null
      if (channel) {
        void loadCommunityClient()
          .then((client) => client.removeChannel(channel))
          .catch(() => {})
      }
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

    const trimmedProfile = profile.trim() || 'Student developer'
    storeIdentity(trimmedName, trimmedProfile)
    setJoined(true)
    joinedRef.current = true

    const channel = channelRef.current
    if (channel && status === 'connected') {
      // Push the updated identity (name/profile edit or fresh join).
      void channel.track({ display_name: trimmedName, profile: trimmedProfile })
    }
    setNotice(`Joined ${community.name}. Start the conversation.`)
  }

  const handleSend = async () => {
    const cleaned = draft.trim()
    if (!cleaned || !joined || status !== 'connected') return
    if (cleaned.length > 500) {
      setNotice('Messages must be 500 characters or fewer.')
      return
    }
    if (!isCommunityConfigured()) {
      setNotice('Live chat is not connected yet. Please check back soon.')
      return
    }

    const target = replyTo
    const payload = {
      display_name: displayNameRef.current.trim() || 'Guest',
      profile: profileRef.current.trim() || 'Student developer',
      user_id: viewerId,
      message: cleaned,
      reply_to: target?.id ?? null,
    }

    /* Optimistic append: the message appears instantly; the stored row
     * (realtime echo or POST result) replaces the temp entry by fields. */
    const tempId = `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const optimistic: CommunityMessage = {
      id: tempId,
      display_name: payload.display_name,
      message: cleaned,
      created_at: new Date().toISOString(),
      user_id: payload.user_id,
      profile: payload.profile,
      reply_to: payload.reply_to,
      reply_preview: target ? `${target.display_name}: ${target.message}`.slice(0, 140) : null,
    }
    setMessages((current) => [...current, optimistic].slice(-200))
    setDraft('')
    setReplyTo(null)
    setNotice('Message sent.')

    try {
      const response = await fetch('/api/community/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      })
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: CommunityMessage; error?: string }
        | null

      if (!response.ok || !result?.success) {
        removeMessage(tempId)
        setNotice(result?.error || 'Could not save your message. Please try again later.')
        return
      }
      if (result.message) mergeStoredMessage(result.message)
    } catch (error) {
      removeMessage(tempId)
      console.error('Community send failed:', error instanceof Error ? error.message : 'network error')
      setNotice('Could not save your message. Please try again later.')
    }
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
