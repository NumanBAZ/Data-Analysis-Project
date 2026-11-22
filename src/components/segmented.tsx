import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

/** Küçük seçim düğmesi: "Ciro | Adet", "Çoktan aza | Azdan çoğa" gibi */
export function Segmented<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode }[]
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className='no-print'>
      <TabsList className='h-8'>
        {options.map((o) => (
          <TabsTrigger key={o.value} value={o.value} className='px-2.5 text-xs'>{o.label}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
