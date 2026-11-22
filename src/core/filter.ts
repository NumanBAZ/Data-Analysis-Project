import { computeTotals, UNDEFINED_CATEGORY } from './clean'
import type { Product, ReportTotals } from './types'

/** Select bileşenlerinde "bütün kategoriler" değeri */
export const ALL = '__all__'

export function categoryOf(p: Pick<Product, 'category'>) {
  return p.category || UNDEFINED_CATEGORY
}

/** Kategoriye göre süzer; ALL veya boşsa hepsi */
export function byCategory<T extends Pick<Product, 'category'>>(products: T[], category?: string): T[] {
  if (!category || category === ALL) return products
  return products.filter((p) => categoryOf(p) === category)
}

/** Ciro, satış, listing, parent (+ ortalama fiyat) */
export function totalsOf(products: Pick<Product, 'revenueCalc' | 'salesAdjusted' | 'isParent'>[]): ReportTotals & { avgPrice: number | null } {
  const t = computeTotals(products)
  return { ...t, avgPrice: t.sales ? t.revenue / t.sales : null }
}

/** Ürünlerdeki kategoriler, ciroya göre büyükten küçüğe, ürün sayısıyla */
export function categoriesIn(products: Product[]): { category: string; revenue: number; count: number }[] {
  const m = new Map<string, { category: string; revenue: number; count: number }>()
  for (const p of products) {
    const c = categoryOf(p)
    const e = m.get(c) ?? { category: c, revenue: 0, count: 0 }
    e.revenue += p.revenueCalc || 0
    e.count++
    m.set(c, e)
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue)
}
