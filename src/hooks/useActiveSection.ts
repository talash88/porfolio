import { useEffect, useState } from 'react'

/**
 * Tracks which section is currently in view so the nav can mark it active.
 * Uses IntersectionObserver with a band across the upper-middle viewport.
 */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (elements.length === 0) return

    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id
          if (entry.isIntersecting) visible.set(id, entry.intersectionRatio)
          else visible.delete(id)
        }
        let best: { id: string; ratio: number } | null = null
        for (const [id, ratio] of visible) {
          if (!best || ratio > best.ratio) best = { id, ratio }
        }
        setActive(best ? best.id : null)
      },
      {
        rootMargin: '-25% 0px -50% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    )
    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [ids.join('|')])

  return active
}
