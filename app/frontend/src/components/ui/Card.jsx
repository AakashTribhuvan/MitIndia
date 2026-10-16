/**
 * Rounded SignLine panel. `outlined` = black outline with offset shadow (use sparingly, for focal cards).
 * White by default; pass a `bg-*` class to colour it.
 */
export default function Card({ outlined = false, className = '', as: Tag = 'div', children, ...rest }) {
  const bg = /(^|\s)bg-/.test(className) ? '' : 'bg-white'
  const base = outlined
    ? 'border-2 border-sl-ink shadow-sl rounded-sl-lg'
    : 'border border-sl-cream-300 rounded-sl-lg'
  return <Tag className={`${bg} ${base} ${className}`} {...rest}>{children}</Tag>
}
