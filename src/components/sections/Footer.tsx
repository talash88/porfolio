import { footer, meta, site } from '../../data/portfolio'
import { Icon } from '../ui/Icon'
import '../../styles/footer.css'

export function Footer() {
  const mailHref = `mailto:${site.email}?subject=${encodeURIComponent('Portfolio Contact – Tejas')}`

  return (
    <footer className="site-footer">
      <div className="container footer-row">
        <a className="brand" href="#top">
          <span className="visually-hidden">{meta.title} — back to top</span>
          <span aria-hidden="true">{site.name.toLowerCase()}.dev</span>
        </a>

        <div className="footer-notes">
          <p>{site.tagline}</p>
          <p className="footer-fine">
            © {new Date().getFullYear()} {site.name} — {footer.buildNote}
          </p>
        </div>

        <a className="footer-mail" href={mailHref} target="_self" rel="noreferrer noopener">
          <Icon name="mail" />
          <span>{site.email}</span>
        </a>

        <p className="footer-notice" role="note">
          {footer.configNotice}
        </p>
      </div>
    </footer>
  )
}
