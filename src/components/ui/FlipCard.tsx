import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import '../../styles/flip-cards.css'

interface FlipCardProps {
  as?: 'div' | 'li' | 'aside'
  className?: string
  label: string
  role?: 'button' | 'group'
  front: ReactNode
  back: ReactNode
  onHoverStart?: () => void
  onHoverEnd?: () => void
}

export function FlipCard({
  as: Element = 'div',
  className = '',
  label,
  role = 'button',
  front,
  back,
  onHoverStart,
  onHoverEnd,
}: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const lastPointerType = useRef<string | null>(null)

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    lastPointerType.current = event.pointerType
  }

  const handlePointerEnter = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return
    setIsFlipped(true)
    onHoverStart?.()
  }

  const handlePointerLeave = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return
    setIsFlipped(false)
    onHoverEnd?.()
  }

  const handleClick = () => {
    if (
      lastPointerType.current === 'touch' ||
      window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(hover: none)').matches
    ) {
      setIsFlipped((current) => !current)
    }
    lastPointerType.current = null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    setIsFlipped((current) => !current)
  }

  return (
    <Element
      className={`flip-card${className ? ` ${className}` : ''}${isFlipped ? ' is-flipped' : ''}`}
      role={role}
      tabIndex={0}
      aria-label={`${label}. Press Enter or Space to flip.`}
      aria-pressed={role === 'button' ? isFlipped : undefined}
      aria-expanded={role === 'group' ? isFlipped : undefined}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flip-card-inner">
        <div className="flip-card-face flip-card-front" aria-hidden={isFlipped} inert={isFlipped}>
          {front}
        </div>
        <div className="flip-card-face flip-card-back" aria-hidden={!isFlipped} inert={!isFlipped}>
          {back}
        </div>
      </div>
    </Element>
  )
}
