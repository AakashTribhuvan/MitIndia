const VARIANTS = {
  primary: 'bg-sl-green text-sl-ink border-2 border-sl-ink shadow-sl-sm hover:bg-sl-green-600 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
  dark: 'bg-sl-ink text-white border-2 border-sl-ink hover:bg-sl-ink-700',
  outline: 'bg-white text-sl-ink border-2 border-sl-ink hover:bg-sl-cream-200',
  ghost: 'bg-transparent text-sl-ink border-2 border-transparent hover:bg-sl-cream-200',
  purple: 'bg-sl-purple text-white border-2 border-sl-ink shadow-sl-sm hover:bg-sl-purple-600 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
}
const SIZES = { sm: 'min-h-9 px-3 text-sm', md: 'min-h-11 px-5 text-sm', lg: 'min-h-12 px-6 text-base' }

/** SignLine button. Renders an <a> when `href` is given. */
export default function Button({ variant = 'primary', size = 'md', className = '', as: As, href, children, ...rest }) {
  const cls = `inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`
  const Tag = As || (href ? 'a' : 'button')
  return (
    <Tag className={cls} href={href} {...(Tag === 'button' ? { type: rest.type || 'button' } : {})} {...rest}>
      {children}
    </Tag>
  )
}
