/** Small hand-drawn accents (decorative: hidden from screen readers). Colour follows `currentColor`. */
const common = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false' }

export function DoodleArrow({ className = '', width = 72 }) {
  return (
    <svg viewBox="0 0 72 40" width={width} className={className} {...common} strokeWidth="2.2">
      <path d="M3 30 C 18 6, 38 4, 52 18 C 58 24, 60 30, 66 34" />
      <path d="M58 34 L 66 34 L 64 26" />
    </svg>
  )
}

export function DoodleSparkle({ className = '', size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...common} strokeWidth="2">
      <path d="M12 2 C 12.8 8, 16 11.2, 22 12 C 16 12.8, 12.8 16, 12 22 C 11.2 16, 8 12.8, 2 12 C 8 11.2, 11.2 8, 12 2 Z" />
    </svg>
  )
}

export function DoodleSquiggle({ className = '', width = 60 }) {
  return (
    <svg viewBox="0 0 60 16" width={width} className={className} {...common} strokeWidth="2.2">
      <path d="M2 10 C 8 2, 12 2, 16 8 S 24 14, 30 8 S 40 2, 44 8 S 52 14, 58 6" />
    </svg>
  )
}
