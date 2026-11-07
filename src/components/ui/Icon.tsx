import type { SocialLink } from '../../data/portfolio'

/** Minimal geometric icons, one path per supported social/name. */
export function Icon(props: { name: SocialLink['icon']; className?: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': true as const,
    className: props.className,
  }
  switch (props.name) {
    case 'github':
      return (
        <svg {...common}>
          <path
            d="M8 1.2a6.8 6.8 0 0 0-2.15 13.25c.34.06.46-.15.46-.32v-1.14c-1.89.41-2.29-.9-2.29-.9-.31-.79-.76-1-.76-1-.62-.42.05-.42.05-.42.68.05 1.05.7 1.05.7.6 1.03 1.59.74 1.98.57.06-.44.24-.74.43-.91-1.51-.17-3.1-.76-3.1-3.36 0-.75.27-1.36.7-1.84-.07-.17-.3-.87.07-1.82 0 0 .58-.18 1.88.7a6.5 6.5 0 0 1 3.42 0c1.3-.88 1.88-.7 1.88-.7.37.95.14 1.65.07 1.82.44.48.7 1.09.7 1.84 0 2.61-1.59 3.19-3.11 3.36.25.21.46.62.46 1.25v1.93c0 .18.12.39.47.32A6.8 6.8 0 0 0 8 1.2Z"
            fill="currentColor"
          />
        </svg>
      )
    case 'instagram':
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="3" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="8" r="2.7" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="11.7" cy="4.3" r="0.9" fill="currentColor" />
        </svg>
      )
    case 'linkedin':
      return (
        <svg {...common}>
          <path
            d="M3.4 2.9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM.15 5.4h3.5V15H.15V5.4Zm5.7 0h3.35v1.3h.05c.47-.86 1.61-1.55 2.93-1.55 2.57 0 3.12 1.66 3.12 3.9V15h-3.5v-5.1c0-1.2-.02-2.75-1.72-2.75-1.73 0-2 1.32-2 2.66V15H5.85V5.4Z"
            fill="currentColor"
          />
        </svg>
      )
    case 'x':
      return (
        <svg {...common}>
          <path
            d="M9.3 6.9 14.6 1h-1.5L8.6 6 5 1H.7l5.6 7.9L.7 15h1.5l4.9-5.4L11 15h4.3L9.3 6.9Zm-1.7 1.9-.5-.8L2.9 2.2h2l3.5 4.9.5.8 4 5.8h-2L7.7 8.8Z"
            fill="currentColor"
          />
        </svg>
      )
    case 'mail':
      return (
        <svg {...common}>
          <rect x="1" y="3" width="14" height="10.5" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
          <path d="m1.8 4.2 6.2 4.6 6.2-4.6" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )
  }
}
