import { cn } from '@/lib/utils'

// The Vanta mark: a bone-white V held inside four field brackets with a violet
// signal point, on the near-black app-icon tile. It reads on light and dark
// surfaces alike, so it does not follow the theme. Size it with className
// (default size-14).
export function BrandMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span className={cn('inline-flex size-14 shrink-0 items-center justify-center', className)} {...props}>
      <svg aria-hidden className="size-full" data-slot="brand-mark" viewBox="0 0 64 64">
        <rect fill="#050507" height="64" rx="14" width="64" />
        <path
          d="M10 22V10h12M42 10h12v12M54 42v12H42M22 54H10V42"
          fill="none"
          stroke="#F4EFE3"
          strokeLinecap="square"
          strokeWidth="3"
        />
        <path d="M20 21h7l5 14 5-14h7L35 45h-6L20 21Z" fill="#F4EFE3" />
        <circle cx="47" cy="17" fill="#7C3AED" r="2.5" />
      </svg>
    </span>
  )
}
