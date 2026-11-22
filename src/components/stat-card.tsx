import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

const TONES = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400',
}

/**
 * Özet kartı: renkli ikon, büyük değer, yeşil/kırmızı değişim rozeti, altta açıklama satırları.
 * delta: oran (0.12 = %12) ya da `points: true` ile yüzde puan (0.054 = 5.4 puan).
 */
export function StatCard({ icon: Icon, tone, label, value, unit, delta, points, children }: {
  icon: LucideIcon
  tone: keyof typeof TONES
  label: string
  value: string
  /** Değerin yanında küçük yazı (örn. "/ 297 parent") */
  unit?: string
  delta?: number | null
  points?: boolean
  /** Alt kısım: açıklama satırları, küçük çubuk vb. */
  children?: React.ReactNode
}) {
  const up = delta != null && delta >= 0
  return (
    <Card className='gap-0 py-5'>
      <CardContent className='flex h-full flex-col gap-3'>
        <div className='flex items-center justify-between'>
          <span className='text-sm font-medium text-muted-foreground'>{label}</span>
          <span className={cn('flex size-9 items-center justify-center rounded-lg', TONES[tone])}>
            <Icon className='size-5' />
          </span>
        </div>
        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
          <span className='text-3xl font-bold tracking-tight tabular-nums'>{value}</span>
          {unit && <span className='text-sm text-muted-foreground tabular-nums'>{unit}</span>}
          {delta != null && Number.isFinite(delta) && (
            <span className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
              up ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
            )}>
              {up ? <TrendingUp className='size-3' /> : <TrendingDown className='size-3' />}
              {points ? `${up ? '+' : '−'}${Math.abs(delta * 100).toFixed(1)} puan` : fmt.delta(delta)}
            </span>
          )}
        </div>
        {children && <div className='mt-auto space-y-1 border-t pt-3 text-xs text-muted-foreground'>{children}</div>}
      </CardContent>
    </Card>
  )
}
