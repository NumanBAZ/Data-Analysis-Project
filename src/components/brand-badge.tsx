import { brandKey } from '@/core/brands'
import { cn } from '@/lib/utils'

/**
 * Marka etiketi: her markanın kendi sabit rengi var, böylece tablolarda markalar
 * ürün adından ayrışır ve birbirine karışmaz. Bilinen markalara elle renk verildi;
 * yeni bir marka gelirse adından türetilen, listede kullanılmayan bir renk alır.
 */
const COLORS = {
  blue: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  red: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  emerald: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  violet: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  cyan: 'border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  pink: 'border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-300',
  lime: 'border-lime-400 bg-lime-50 text-lime-800 dark:border-lime-800 dark:bg-lime-950 dark:text-lime-300',
  orange: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
  teal: 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300',
  indigo: 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  fuchsia: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300',
  sky: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  rose: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
  yellow: 'border-yellow-400 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  slate: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
} as const

type Color = keyof typeof COLORS

/** Her bilinen markaya ayrı renk (aynı renk iki markaya verilmez) */
const FIXED: Record<string, Color> = {
  kraken: 'blue',
  sprayman: 'sky',
  stanley: 'amber',
  akfix: 'red',
  benasse: 'violet',
  beest: 'orange',
  ixir: 'emerald',
  magicchems: 'pink',
  vegabond: 'cyan',
  yallcandiy: 'lime',
  selsil: 'teal',
}

const SPARE = (Object.keys(COLORS) as Color[]).filter((c) => !Object.values(FIXED).includes(c))

function brandColor(brand: string): string {
  const k = brandKey(brand)
  const fixed = FIXED[k]
  if (fixed) return COLORS[fixed]
  if (!k) return COLORS.slate
  let h = 0
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[SPARE[h % SPARE.length]]
}

export function BrandBadge({ brand, className }: { brand: string; className?: string }) {
  if (!brand) return <span className='text-muted-foreground'>–</span>
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        brandColor(brand),
        className
      )}
      title={brand}
    >
      {brand}
    </span>
  )
}
