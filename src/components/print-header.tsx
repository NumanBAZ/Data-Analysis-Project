import { formatDateTR, todayISO } from '@/core/dates'

/** Yalnızca PDF/baskıda görünen rapor başlığı */
export function PrintHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className='print-only mb-4 border-b pb-3'>
      <div className='flex items-end justify-between'>
        <div>
          <p className='text-xs font-medium tracking-wide text-gray-500 uppercase'>Lotos Global · Rakip Analizi</p>
          <h1 className='text-2xl font-bold'>{title}</h1>
          {subtitle && <p className='text-sm text-gray-600'>{subtitle}</p>}
        </div>
        <p className='text-sm text-gray-500'>Hazırlanma: {formatDateTR(todayISO())}</p>
      </div>
    </div>
  )
}
