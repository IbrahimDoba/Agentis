// WhatsApp's double tick: the page's one recurring mark, because a delivered,
// answered message is what this product sells.
export function Ticks({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="11" viewBox="0 0 16 11" fill="none" aria-hidden="true">
      <path d="M1 6l3 3.5L10.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 8.5l1 1L14.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
