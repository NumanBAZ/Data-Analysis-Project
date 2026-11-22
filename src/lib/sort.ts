/** Ürün listelerinde sıralama: ciroya ya da satış adedine göre */
export type SortBy = 'revenue' | 'sales'
export const SORT_BY_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'revenue', label: 'Ciro' },
  { value: 'sales', label: 'Adet' },
]
