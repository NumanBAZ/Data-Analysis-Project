import { useLiveQuery } from 'dexie-react-hooks'
import { flattenTree, pathOf, type CategoryTree } from '@/core/tree'
import { getCategoryList, getCategoryTree } from '@/data/repo'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const EMPTY: CategoryTree = {}

/** Kategori ağacı (canlı); yüklenirken boş ağaç */
export function useCategoryTree(): CategoryTree {
  return useLiveQuery(getCategoryTree) ?? EMPTY
}

/**
 * Kategori seçimi: yalnızca listedeki kategoriler seçilebilir (elle yazım yok, yazım hatası
 * yeni kategori oluşturamaz). Alt kategoriler üst kategorilerinin altında girintili görünür.
 * Yeni kategori Ayarlar > Kategori ağacı'ndan eklenir.
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
  const tree = useCategoryTree()
  // Değer listede yoksa (eski kayıt) yine de görünsün
  const rows = flattenTree(tree, value && !list.includes(value) ? [value, ...list] : list)
  return (
    <Select value={value || undefined} onValueChange={onChange} open={open} onOpenChange={onOpenChange}>
      <SelectTrigger className={cn('h-8 w-full', className)} title={value ? pathOf(tree, value) : undefined}>
        {/* Dar sütunlara sığsın diye yalnızca ad; tam yol üzerine gelince */}
        <SelectValue placeholder={placeholder}>{value || undefined}</SelectValue>
      </SelectTrigger>
      <SelectContent className='max-h-80'>
        {rows.map((r) => (
          <SelectItem key={r.name} value={r.name} className={cn(r.hasChildren && 'font-semibold')}>
            <span style={{ paddingInlineStart: r.depth * 16 }}>{r.depth > 0 && <span className='text-muted-foreground'>└ </span>}{r.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
