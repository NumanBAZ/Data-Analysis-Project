import { useLiveQuery } from 'dexie-react-hooks'
import { getCategoryList } from '@/data/repo'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * Kategori seçimi: yalnızca listedeki kategoriler seçilebilir (elle yazım yok, yazım hatası
 * yeni kategori oluşturamaz). Yeni kategori Kategoriler > Kategori listesi'nden eklenir.
 */
export function CategorySelect({
  value,
  onChange,
  className,
  placeholder = 'Kategori seçin',
  open,
  onOpenChange,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
  open?: boolean
  onOpenChange?: (o: boolean) => void
}) {
  const list = useLiveQuery(getCategoryList) ?? []
  // Değer listede yoksa (eski kayıt) yine de görünsün
  const items = value && !list.includes(value) ? [value, ...list] : list
  return (
    <Select value={value || undefined} onValueChange={onChange} open={open} onOpenChange={onOpenChange}>
      <SelectTrigger className={cn('h-8 w-full', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className='max-h-80'>
        {items.map((c) => (
          <SelectItem key={c} value={c}>{c}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
