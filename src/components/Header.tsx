import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { navLinks, site } from '../data/portfolio'
import { useActiveSection } from '../hooks/useActiveSection'
import { useTheme } from '../hooks/useTheme'
import '../styles/header.css'

function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const active = useActiveSection(navLinks.map((l) => l.id))
  const panelRef = useRef<HTMLUListElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the mobile panel on Escape and return focus to the toggle.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])  // Lock page scroll while the panel is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const closeAndBlur = () => setOpen(false)

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="container header-row">
        <a className="brand" href="#top" onClick={closeAndBlur}>
          <span className="visually-hidden">{site.name} — back to top</span>
          <span aria-hidden="true">{site.name.toLowerCase()}.dev</span>
        </a>

        <nav aria-label="Primary" className="desktop-nav" data-open={String(open)}>
          <ul ref={panelRef} id="nav-list" className="nav-list">
            {navLinks.map((link, i) => (
              <li key={link.id} style={{ '--i': i } as CSSProperties}>
                <a
                  href={`#${link.id}`}
                  aria-current={active === link.id ? 'location' : undefined}
                  onClick={closeAndBlur}
                >
                  <span aria-hidden="true">0{i + 1}</span> {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <button
          type="button"
          className="theme-toggle"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          onClick={toggleTheme}
        >
          <svg
            viewBox="0 0 24 24"
            width="19"
            height="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {theme === 'dark' ? (
              <>
                <circle cx="12" cy="12" r="3.6" />
                <path d="M12 2.2v2M12 19.8v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2.2 12h2m15.6 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
              </>
            ) : (
              <path d="M20.4 15.25A8.45 8.45 0 0 1 8.75 3.6 8.5 8.5 0 1 0 20.4 15.25Z" />
            )}
          </svg>
        </button>

        <button
          ref={toggleRef}
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="nav-list"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
          <span aria-hidden="true" className={`nav-toggle-box${open ? ' is-open' : ''}`}>
            <i />
            <i />
          </span>
        </button>
      </div>
    </header>
  )
}

export { Header }
