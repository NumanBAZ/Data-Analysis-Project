/**
 * Kategori ağacı: her kategorinin (varsa) bir üst kategorisi vardır.
 * Ürünler her zaman tek bir kategoriye (çoğunlukla en alttakine) atanır; üst kategori seçildiğinde
 * altındaki bütün kategorilerin ürünleri de dahil edilir. Kategori adları uygulama genelinde tektir.
 */

/** alt kategori → üst kategori adı ('' = ana kategori); `at` = son değişiklik zamanı */
export type CategoryTree = Record<string, { parent: string; at: string }>

/** Üst kategorisi; ana kategoriyse '' */
export function parentOf(tree: CategoryTree, name: string): string {
  return tree[name]?.parent ?? ''
}

/** Kökten başlayarak üst kategoriler (kendisi hariç): ["Yapıştırıcı", "Sprey"] */
export function ancestorsOf(tree: CategoryTree, name: string): string[] {
  const out: string[] = []
  let cur = parentOf(tree, name)
  while (cur && !out.includes(cur) && out.length < 20) {
    out.unshift(cur)
    cur = parentOf(tree, cur)
  }
  return out
}

/** "Yapıştırıcı › Sprey › 400 ml" */
export function pathOf(tree: CategoryTree, name: string): string {
  return [...ancestorsOf(tree, name), name].join(' › ')
}

/** Doğrudan alt kategoriler */
export function childrenOf(tree: CategoryTree, name: string, all: string[]): string[] {
  return all.filter((c) => c !== name && parentOf(tree, c) === name)
}

/** Kendisi + bütün alt kategorileri (her seviye) */
export function selfAndDescendants(tree: CategoryTree, name: string, all: string[]): Set<string> {
  const out = new Set([name])
  let grew = true
  while (grew) {
    grew = false
    for (const c of all) {
      if (!out.has(c) && out.has(parentOf(tree, c))) {
        out.add(c)
        grew = true
      }
    }
  }
  return out
}

/** `child`, `parent`in altına taşınabilir mi (kendi altına taşımak döngü yaratır) */
export function canMoveUnder(tree: CategoryTree, child: string, parent: string): boolean {
  if (!parent) return true
  if (parent === child) return false
  return !ancestorsOf(tree, parent).includes(child)
}

export type TreeRow = { name: string; depth: number; path: string; hasChildren: boolean }

/**
 * Ağaç sırasıyla düz liste: her üst kategorinin hemen altında alt kategorileri, alfabetik.
 * Üst kategorisi listede olmayanlar ana kategori sayılır (hiçbiri kaybolmaz).
 */
export function flattenTree(tree: CategoryTree, all: string[]): TreeRow[] {
  const names = new Set(all)
  const parent = (c: string) => {
    const p = parentOf(tree, c)
    return p && names.has(p) && canMoveUnder(tree, c, p) ? p : ''
  }
  const kids = new Map<string, string[]>()
  for (const c of all) {
    const p = parent(c)
    kids.set(p, [...(kids.get(p) ?? []), c])
  }
  const out: TreeRow[] = []
  const seen = new Set<string>()
  const walk = (p: string, depth: number) => {
    for (const c of (kids.get(p) ?? []).sort((a, b) => a.localeCompare(b, 'tr'))) {
      if (seen.has(c)) continue
      seen.add(c)
      out.push({ name: c, depth, path: pathOf(tree, c), hasChildren: (kids.get(c)?.length ?? 0) > 0 })
      walk(c, depth + 1)
    }
  }
  walk('', 0)
  return out
}
