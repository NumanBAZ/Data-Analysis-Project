import { computeTotals, UNDEFINED_CATEGORY } from './clean'
import type { Product, ReportTotals } from './types'
import { ancestorsOf, flattenTree, selfAndDescendants, type CategoryTree } from './tree'

/** Select bileşenlerinde "bütün kategoriler" değeri */
export const ALL = '__all__'

export function categoryOf(p: Pick<Product, 'category'>) {
  return p.category || UNDEFINED_CATEGORY
}

/** Kategoriye göre süzer; ALL veya boşsa hepsi. Ağaç verilirse üst kategori, alt kategorilerinin ürünlerini de kapsar. */
export function byCategory<T extends Pick<Product, 'category'>>(products: T[], category?: string, tree?: CategoryTree): T[] {
  if (!category || category === ALL) return products
  if (!tree) return products.filter((p) => categoryOf(p) === category)
  // Ara seviyedeki kategorilerin kendi ürünü olmasa da zincir kopmasın
  const names = new Set(products.map(categoryOf))
  for (const c of [...names]) for (const a of ancestorsOf(tree, c)) names.add(a)
  const set = selfAndDescendants(tree, category, [...names])
  return products.filter((p) => set.has(categoryOf(p)))
}

export type CategoryOption = { category: string; revenue: number; count: number; depth: number; isGroup: boolean }

/**
 * Filtre seçenekleri: ürünlerde geçen kategoriler, ağaç sırasıyla; alt kategorisi olan
 * üst kategoriler altlarının toplamıyla (kendi + alt kategoriler) eklenir.
 * Yalnızca seçim listesi içindir; toplamlar üst üste bindiği için toplanmamalıdır.
 */
export function categoryOptions(products: Product[], tree: CategoryTree): CategoryOption[] {
  const leaf = new Map(categoriesIn(products).map((c) => [c.category, c]))
  const names = new Set(leaf.keys())
  for (const c of leaf.keys()) for (const a of ancestorsOf(tree, c)) names.add(a)
  const all = [...names]
  return flattenTree(tree, all).map((r) => {
    const set = selfAndDescendants(tree, r.name, all)
    let revenue = 0
    let count = 0
    for (const c of set) {
      revenue += leaf.get(c)?.revenue ?? 0
      count += leaf.get(c)?.count ?? 0
    }
    return { category: r.name, revenue, count, depth: r.depth, isGroup: r.hasChildren }
  })
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
