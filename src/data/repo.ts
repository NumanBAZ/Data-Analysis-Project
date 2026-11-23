import { brandKey, createBrandResolver } from '@/core/brands'
import {
  applyRules,
  computeTotals,
  UNDEFINED_CATEGORY,
  type DraftProduct,
  type ParsedSheet,
} from '@/core/clean'
import type { CategoryEntry, Product, Report, Settings } from '@/core/types'
import { canMoveUnder, childrenOf, type CategoryTree } from '@/core/tree'
import { db } from './db'

export async function loadCategoryMap(): Promise<Map<string, string>> {
  const all = await db.categories.toArray()
  return new Map(all.map((c) => [c.asin, c.category]))
}


export async function findExistingReport(date: string, key: string) {
  return db.reports.where('[date+brandKey]').equals([date, key]).first()
}

async function learnCategories(products: DraftProduct[], key: string) {
  const entries = products
    .filter((p) => p.asin && p.category && p.category !== UNDEFINED_CATEGORY)
    .map((p) => ({ asin: p.asin, category: p.category, brandKey: key }))
  if (!entries.length) return
  // Elle tanımlama zamanı korunur
  const old = await db.categories.bulkGet(entries.map((e) => e.asin))
  await db.categories.bulkPut(entries.map((e, i) => (old[i]?.definedAt && old[i]!.category === e.category ? { ...e, definedAt: old[i]!.definedAt } : e)))
}

export type SaveOptions = {
  brand: string
  date: string
  settings: Settings
  /** Aynı tarih + marka için kayıt varsa üzerine yaz */
  replaceId?: number
  /** Dosyada birden çok firma varsa yalnızca bu firmanın ürünleri */
  products?: DraftProduct[]
}

/** Önizlemesi onaylanmış bir sayfayı rapor olarak kaydeder. */
/** Onaylı ad kuralları (örn. adında "Fire Block" geçen = Fire Block) yeni yüklenen ürünlere de uygulanır */
function applyTitleRulesTo(products: DraftProduct[], renames: Record<string, string>): DraftProduct[] {
  return products.map((p) => {
    const rule = TITLE_RULES.find((r) => r.match.test(p.title ?? ''))
    // Adı sonradan değiştirilmiş kategori, dosyada ya da kuralda eski adıyla gelse de yeni adı alır
    const category = renamed(renames, rule ? rule.category : p.category)
    return category !== p.category ? { ...p, category } : p
  })
}

export async function saveSheet(sheet: ParsedSheet, opts: SaveOptions): Promise<number> {
  const resolved = createBrandResolver(opts.settings.aliases)(opts.brand)
  if (resolved.known) opts = { ...opts, brand: resolved.brand }
  const key = brandKey(opts.brand)
  // Taslaktaki bütün ürünler tek firmanındır; firma adı yüklemede elle değiştirildiyse ürünlere de yansır
  const drafts = (opts.products ?? sheet.products).map((p) =>
    p.brand === opts.brand && p.brandKey === key ? p : { ...p, brand: opts.brand, brandKey: key }
  )
  const { products } = applyRules(applyTitleRulesTo(drafts, await getCategoryRenames()), key, opts.settings.rule)
  const report: Report = {
    name: sheet.sheetName && sheet.sheetName !== 'Sheet1'
      ? `${sheet.fileName} / ${sheet.sheetName}`
      : sheet.fileName,
    fileName: sheet.fileName,
    sheetName: sheet.sheetName,
    date: opts.date,
    brand: opts.brand,
    brandKey: key,
    marketplace: sheet.marketplace,
    importedAt: new Date().toISOString(),
    source: 'upload',
    totals: computeTotals(products),
    columnMap: sheet.columnMap,
    unmappedColumns: sheet.unmappedColumns,
    issues: sheet.issues,
    fileHash: sheet.fileHash,
  }

  const now = new Date().toISOString()
  const asins = new Set(products.map((p) => p.asin))
  const images = [...(sheet.images ?? [])]
    .filter(([asin]) => asins.has(asin))
    .map(([asin, img]) => ({ asin, data: new Blob([img.data as BlobPart], { type: img.type }), type: img.type, updatedAt: now }))

  return db.transaction('rw', [db.reports, db.products, db.categories, db.images], async () => {
    // Aynı firma + tarih için kayıt varsa onun yerine geçer (firma adı takma adla yazılmış olsa bile)
    const replaceId = opts.replaceId ?? (await findExistingReport(opts.date, key))?.id
    if (replaceId) await deleteReport(replaceId)
    const id = (await db.reports.add(report)) as number
    await db.products.bulkAdd(products.map((p) => ({ ...p, reportId: id })))
    await learnCategories(products, key)
    if (images.length) await db.images.bulkPut(images)
    return id
  })
}

export async function deleteReport(id: number) {
  await db.transaction('rw', db.reports, db.products, db.images, async () => {
    const asins = [...new Set((await db.products.where('reportId').equals(id).toArray()).map((p) => p.asin))]
    await db.products.where('reportId').equals(id).delete()
    await db.reports.delete(id)
    const stillUsed = new Set((await db.products.where('asin').anyOf(asins).toArray()).map((p) => p.asin))
    const orphan = asins.filter((a) => a && !stillUsed.has(a))
    if (orphan.length) await db.images.bulkDelete(orphan)
  })
}

export async function getProducts(reportIds: number[]): Promise<Product[]> {
  if (!reportIds.length) return []
  return db.products.where('reportId').anyOf(reportIds).toArray()
}

// ---------------------------------------------------------------------------
// Kategori atama
// ---------------------------------------------------------------------------

/**
 * ASIN'e kategori verir: kütüphaneye kaydeder ve o ASIN'in bütün kayıtlı ürünlerini günceller.
 * Raporların toplamları değişmez (kategori ciroyu etkilemez).
 */
export async function setCategory(asin: string, category: string, key: string) {
  const cat = category.trim()
  if (!asin || !cat) return
  await db.transaction('rw', db.categories, db.products, async () => {
    await db.categories.put({ asin, category: cat, brandKey: key, definedAt: new Date().toISOString() })
    await db.products.where('asin').equals(asin).modify({ category: cat })
  })
}

/** Geri al: ASIN'i önceki kategorisine döndürür; önceden tanımsızsa kütüphaneden siler. */
export async function restoreCategory(asin: string, previous: string, key: string) {
  if (previous && previous !== UNDEFINED_CATEGORY) return setCategory(asin, previous, key)
  await db.transaction('rw', db.categories, db.products, async () => {
    await db.categories.delete(asin)
    await db.products.where('asin').equals(asin).modify({ category: UNDEFINED_CATEGORY })
  })
}

/** Birden çok ASIN'e tek seferde kategori verir (önerileri toplu onaylama). */
export async function setCategories(items: { asin: string; category: string; brandKey: string }[]) {
  const list = items.filter((i) => i.asin && i.category.trim())
  if (!list.length) return
  await db.transaction('rw', db.categories, db.products, async () => {
    const now = new Date().toISOString()
    await db.categories.bulkPut(list.map((i) => ({ ...i, category: i.category.trim(), definedAt: now })))
    const cat = new Map(list.map((i) => [i.asin, i.category.trim()]))
    await db.products.where('asin').anyOf([...cat.keys()]).modify((p) => {
      p.category = cat.get(p.asin)!
    })
  })
}

// ---------------------------------------------------------------------------
// Elle düzenleme (V4'teki tablo düzenleme karşılığı)
// ---------------------------------------------------------------------------

export const EDITABLE_FIELDS = ['title', 'brand', 'category', 'price', 'salesAdjusted', 'bsr', 'reviews', 'rating', 'seller'] as const
export type EditableField = (typeof EDITABLE_FIELDS)[number]

/**
 * Bir ürünün alanını değiştirir; ciro (fiyat x satış) ve raporun toplamları yeniden hesaplanır.
 * Eski değer `edits` içinde saklanır. Kategori değişirse ASIN kütüphanesi de güncellenir.
 */
export async function updateProduct(id: number, field: EditableField, value: string | number | null) {
  await db.transaction('rw', db.products, db.reports, db.categories, async () => {
    const p = await db.products.get(id)
    if (!p) return
    const old = p[field]
    if (old === value) return
    const patch: Partial<Product> = { [field]: value }
    if (field === 'brand') patch.brandKey = brandKey(String(value ?? ''))
    const price = field === 'price' ? (value as number | null) : p.price
    const sales = field === 'salesAdjusted' ? (value as number | null) : p.salesAdjusted
    if (field === 'price' || field === 'salesAdjusted') {
      // Yüklemedeki kuralla aynı: fiyat veya satış yoksa dosyadaki ham ciro
      patch.revenueCalc = price !== null && sales !== null ? price * sales : (p.revenue ?? 0)
    }
    const firstEdit = p.edits?.[field]
    patch.edits = { ...(p.edits ?? {}), [field]: firstEdit ?? { from: old, at: new Date().toISOString() } }
    await db.products.update(id, patch)

    if (field === 'category' && p.asin && value) {
      // ASIN kesin anahtar: aynı ürün eski/yeni bütün raporlarda bu kategoriyle görünür
      await db.categories.put({ asin: p.asin, category: String(value), brandKey: p.brandKey, definedAt: new Date().toISOString() })
      await db.products.where('asin').equals(p.asin).modify({ category: String(value) })
    }
    const all = await db.products.where('reportId').equals(p.reportId).toArray()
    const report = await db.reports.get(p.reportId)
    await db.reports.update(p.reportId, { totals: computeTotals(all), editCount: (report?.editCount ?? 0) + 1 })
  })
}

/** Excel'e gömmek için kayıtlı görseller */
export async function loadImages(asins: string[]): Promise<Map<string, { data: Uint8Array; type: string }>> {
  const rows = await db.images.bulkGet([...new Set(asins.filter(Boolean))])
  const out = new Map<string, { data: Uint8Array; type: string }>()
  for (const r of rows) if (r) out.set(r.asin, { data: new Uint8Array(await r.data.arrayBuffer()), type: r.type })
  return out
}

// ---------------------------------------------------------------------------
// V4 JSON kategori kütüphanesi (public/seed/categories.json)
// ---------------------------------------------------------------------------

/** Kütüphane dosyası güncellenince artırılır; uygulama bir sonraki açılışta yeni atamaları alır. */
const CATEGORY_SEED_VERSION = 3

/**
 * Kurulumla gelen ASIN → kategori kütüphanesini (public/seed/categories.json) yükler.
 * - Eksik ASIN'leri ekler.
 * - Dosyadaki elle tanımlanmış atamalar (definedAt), uygulamadaki daha eski ya da otomatik atamanın
 *   yerine geçer; uygulamada daha yeni elle yapılmış atama varsa ona dokunulmaz.
 * - Kayıtlı ürünlerden "Tanımlanmamış" olanlara ve değişen ASIN'lere yeni kategoriyi yazar.
 */
export async function seedCategoriesIfNeeded(): Promise<{ added: number; fixed: number }> {
  const done = (await db.kv.get('seed-categories'))?.value as { version?: number } | undefined
  if ((done?.version ?? 0) >= CATEGORY_SEED_VERSION) return { added: 0, fixed: 0 }
  const res = await fetch('/seed/categories.json')
  if (!res.ok) return { added: 0, fixed: 0 }
  const raw = (await res.json()) as {
    entries: CategoryEntry[]
    categoryList?: string[]
    categoryTree?: CategoryTree
    categoryRenames?: Record<string, string>
  }
  // Kütüphanedeki eski ad → yeni ad (örn. ağaca geçişte "Sealant" → "Sealants & Caulks"): uygulamada eski ad
  // hâlâ kullanılıyorsa (kullanıcının kendi atamaları dahil) her yerde yenisine çevrilir, yeni yüklemelerde de geçerli olur
  for (const [from, to] of Object.entries(raw.categoryRenames ?? {})) {
    if (from && to && from !== to && (await getCategoryList()).includes(from)) await renameCategory(from, to)
  }
  // Kullanıcının değiştirdiği kategori adları kütüphane dosyasındaki eski adların yerine geçer
  const renames = await getCategoryRenames()
  const seed = {
    entries: raw.entries.map((e) => ({ ...e, category: renamed(renames, e.category) })),
    categoryList: [...new Set([
      ...(raw.categoryList ?? []),
      ...Object.entries(raw.categoryTree ?? {}).flatMap(([c, n]) => (n.parent ? [c, n.parent] : [c])),
    ].map((c) => renamed(renames, c)))],
    tree: Object.entries(raw.categoryTree ?? {}).map(([c, n]) => ({ name: renamed(renames, c), parent: n.parent ? renamed(renames, n.parent) : '', at: n.at })),
  }

  return db.transaction('rw', db.categories, db.products, db.kv, async () => {
    const existing = new Map((await db.categories.toArray()).map((c) => [c.asin, c]))
    const put: CategoryEntry[] = []
    const changed = new Map<string, string>()
    let added = 0
    for (const { asin, category, brandKey, definedAt } of seed.entries) {
      const e: CategoryEntry = definedAt ? { asin, category, brandKey, definedAt } : { asin, category, brandKey }
      const old = existing.get(asin)
      if (!old) {
        put.push(e)
        added++
      } else if (definedAt && old.category !== category && (!old.definedAt || old.definedAt < definedAt)) {
        put.push(e)
        changed.set(asin, category)
      }
    }
    if (put.length) await db.categories.bulkPut(put)
    if (seed.categoryList?.length) {
      const saved = ((await db.kv.get(CATEGORY_LIST_KEY))?.value as string[] | undefined) ?? []
      await db.kv.put({ key: CATEGORY_LIST_KEY, value: [...new Set([...saved, ...seed.categoryList])] })
    }
    // Ağaç: dosyadaki yerleşim, uygulamada daha yeni bir elle değişiklik yoksa geçerli olur
    if (seed.tree.length) {
      const tree = await getCategoryTree()
      for (const n of seed.tree) {
        if (!n.name || n.name === n.parent) continue
        const old = tree[n.name]
        if (old && old.at >= n.at) continue
        if (!canMoveUnder(tree, n.name, n.parent)) continue
        tree[n.name] = { parent: n.parent, at: n.at }
      }
      await db.kv.put({ key: CATEGORY_TREE_KEY, value: tree })
    }

    const lib = new Map((await db.categories.toArray()).map((c) => [c.asin, c.category]))
    let fixed = 0
    await db.products
      .where('category')
      .equals(UNDEFINED_CATEGORY)
      .modify((p) => {
        const c = lib.get(p.asin)
        if (c) {
          p.category = c
          fixed++
        }
      })
    if (changed.size) {
      await db.products.where('asin').anyOf([...changed.keys()]).modify((p) => {
        p.category = changed.get(p.asin)!
        fixed++
      })
    }
    await db.kv.put({ key: 'seed-categories', value: { version: CATEGORY_SEED_VERSION, added, changed: changed.size, fixed, at: new Date().toISOString() } })
    return { added, fixed }
  })
}

// ---------------------------------------------------------------------------
// Kategori listesi (sabit liste: kategoriler elle yazılmaz, listeden seçilir)
// ---------------------------------------------------------------------------

const CATEGORY_LIST_KEY = 'category-list'

/**
 * Seçilebilir bütün kategoriler: kayıtlı liste + kütüphanede kullanılanlar (hiçbiri kaybolmasın diye).
 * Alfabetik, "Tanımlanmamış" hariç.
 */
export async function getCategoryList(): Promise<string[]> {
  const saved = ((await db.kv.get(CATEGORY_LIST_KEY))?.value as string[] | undefined) ?? []
  const used = new Set<string>()
  await db.categories.each((c) => {
    used.add(c.category)
  })
  return [...new Set([...saved, ...used])]
    .filter((c) => c && c !== UNDEFINED_CATEGORY)
    .sort((a, b) => a.localeCompare(b, 'tr'))
}

/**
 * Listeye yeni kategori ekler; `parent` verilirse onun alt kategorisi olur.
 * Büyük/küçük harf farkıyla aynısı varsa eklemez ve hata verir.
 */
export async function addCategoryToList(name: string, parent = ''): Promise<string> {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean) throw new Error('Kategori adı boş olamaz.')
  if (clean === UNDEFINED_CATEGORY) throw new Error(`"${UNDEFINED_CATEGORY}" kategori olarak eklenemez.`)
  return db.transaction('rw', db.categories, db.kv, async () => {
    const list = await getCategoryList()
    const same = list.find((c) => c.toLocaleLowerCase('tr') === clean.toLocaleLowerCase('tr'))
    if (same) throw new Error(`"${same}" zaten listede.`)
    if (parent && !list.includes(parent)) throw new Error(`Üst kategori "${parent}" bulunamadı.`)
    const saved = ((await db.kv.get(CATEGORY_LIST_KEY))?.value as string[] | undefined) ?? []
    await db.kv.put({ key: CATEGORY_LIST_KEY, value: [...saved, clean] })
    if (parent) {
      const tree = await getCategoryTree()
      tree[clean] = { parent, at: new Date().toISOString() }
      await db.kv.put({ key: CATEGORY_TREE_KEY, value: tree })
    }
    return clean
  })
}

// ---------------------------------------------------------------------------
// Kategori ağacı (alt kategoriler)
// ---------------------------------------------------------------------------

const CATEGORY_TREE_KEY = 'category-tree'

export async function getCategoryTree(): Promise<CategoryTree> {
  const saved = (await db.kv.get(CATEGORY_TREE_KEY))?.value as CategoryTree | undefined
  return saved ? { ...saved } : {}
}

/** Kategoriyi başka bir kategorinin altına taşır; `parent` '' ise ana kategori yapar. ASIN atamaları değişmez. */
export async function setCategoryParent(name: string, parent: string) {
  await db.transaction('rw', db.categories, db.kv, async () => {
    const list = await getCategoryList()
    if (!list.includes(name)) throw new Error(`"${name}" bulunamadı.`)
    if (parent && !list.includes(parent)) throw new Error(`Üst kategori "${parent}" bulunamadı.`)
    const tree = await getCategoryTree()
    if (!canMoveUnder(tree, name, parent)) throw new Error(`"${name}" kendi alt kategorisinin altına taşınamaz.`)
    tree[name] = { parent, at: new Date().toISOString() }
    await db.kv.put({ key: CATEGORY_TREE_KEY, value: tree })
  })
}

/**
 * Kategoriyi siler. Yalnızca boş kategori silinir: hiçbir ASIN'e atanmamış ve alt kategorisi yok.
 * (Dolu kategoriyi kaldırmak için önce ürünleri başka kategoriye verin ya da adını değiştirip birleştirin.)
 */
export async function deleteCategory(name: string) {
  await db.transaction('rw', db.categories, db.products, db.kv, async () => {
    if (name === UNDEFINED_CATEGORY) throw new Error(`"${UNDEFINED_CATEGORY}" silinemez.`)
    const used = await db.categories.filter((c) => c.category === name).count()
    const inProducts = await db.products.where('category').equals(name).count()
    if (used || inProducts) throw new Error(`"${name}" ${used || inProducts} üründe kullanılıyor; önce o ürünlere başka kategori verin.`)
    const tree = await getCategoryTree()
    const list = await getCategoryList()
    const kids = childrenOf(tree, name, list)
    if (kids.length) throw new Error(`"${name}" altında ${kids.length} alt kategori var (${kids.slice(0, 3).join(', ')}); önce onları taşıyın ya da silin.`)
    const saved = ((await db.kv.get(CATEGORY_LIST_KEY))?.value as string[] | undefined) ?? []
    await db.kv.put({ key: CATEGORY_LIST_KEY, value: saved.filter((c) => c !== name) })
    delete tree[name]
    await db.kv.put({ key: CATEGORY_TREE_KEY, value: tree })
  })
}

// ---------------------------------------------------------------------------
// Kategori adını değiştirme
// ---------------------------------------------------------------------------

const CATEGORY_RENAMES_KEY = 'category-renames'

/** Eski ad → yeni ad. Yeni yüklenen dosyalarda, kurulumla gelen kütüphanede ve ad kurallarında eski ad gelirse yenisine çevrilir. */
export async function getCategoryRenames(): Promise<Record<string, string>> {
  return ((await db.kv.get(CATEGORY_RENAMES_KEY))?.value as Record<string, string> | undefined) ?? {}
}

/** Zincirleme değişiklikleri izler (A→B, B→C ise A→C). Ad tam eşleşmeyle aranır: "Foam" ≠ "Foam Set". */
export function renamed(renames: Record<string, string>, name: string): string {
  let cur = name
  for (let i = 0; i < 20 && renames[cur] !== undefined; i++) cur = renames[cur]
  return cur
}

/**
 * Kategorinin adını her yerde değiştirir: ASIN kütüphanesi, eski/yeni bütün raporlardaki ürünler,
 * kategori listesi. Yeni ad zaten varsa iki kategori birleşir. Eski ad hatırlanır; sonradan gelen
 * dosyalarda eski ad yazsa bile yeni ad kullanılır.
 */
export async function renameCategory(from: string, to: string): Promise<{ asins: number; products: number }> {
  const clean = to.trim().replace(/\s+/g, ' ')
  if (!clean) throw new Error('Kategori adı boş olamaz.')
  if (from === UNDEFINED_CATEGORY || clean === UNDEFINED_CATEGORY) throw new Error(`"${UNDEFINED_CATEGORY}" değiştirilemez.`)
  if (clean === from) return { asins: 0, products: 0 }

  return db.transaction('rw', db.categories, db.products, db.kv, async () => {
    // Yeni ad zaten bir kategoriyse iki kategori birleşir
    const merged = (await getCategoryList()).includes(clean)
    const asins = await db.categories.filter((c) => c.category === from).modify({ category: clean })
    const products = await db.products.where('category').equals(from).modify({ category: clean })

    const saved = ((await db.kv.get(CATEGORY_LIST_KEY))?.value as string[] | undefined) ?? []
    await db.kv.put({ key: CATEGORY_LIST_KEY, value: [...new Set([...saved.filter((c) => c !== from), clean])] })

    const map = await getCategoryRenames()
    // Daha önce "from"a çevrilen adlar artık doğrudan yeni ada gider; geri dönüşte döngü olmasın
    for (const k of Object.keys(map)) if (map[k] === from) map[k] = clean
    map[from] = clean
    delete map[clean]
    await db.kv.put({ key: CATEGORY_RENAMES_KEY, value: map })

    // Ağaç: yeni ad eskisinin yerini alır, alt kategoriler yeni adın altında kalır.
    // Birleşmede hedef kategori kendi yerinde kalır.
    const tree = await getCategoryTree()
    const now = new Date().toISOString()
    if (tree[from] && !merged) tree[clean] = { ...tree[from], at: now }
    delete tree[from]
    for (const k of Object.keys(tree)) if (tree[k].parent === from) tree[k] = { parent: clean, at: now }
    // Hedef, eskisinin alt kategorisiyse kendi kendinin altına düşmesin
    if (tree[clean] && !canMoveUnder(tree, clean, tree[clean].parent)) tree[clean] = { parent: '', at: now }
    await db.kv.put({ key: CATEGORY_TREE_KEY, value: tree })
    return { asins, products }
  })
}

/** Kategori kaç ASIN'de kullanılıyor */
export async function categoryUsage(): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  await db.categories.each((c) => {
    m.set(c.category, (m.get(c.category) ?? 0) + 1)
  })
  return m
}

// ---------------------------------------------------------------------------
// Ürün adına göre tek seferlik kategori düzeltmeleri (kullanıcı onaylı)
// ---------------------------------------------------------------------------

/**
 * Her kural bir kez çalışır (kv'de id'si saklanır). Adı eşleşen bütün ASIN'ler —
 * tanımlanmamış olanlar da, daha önce başka kategori verilmiş olanlar da — bu kategoriye geçer.
 */
const TITLE_RULES: { id: string; match: RegExp; category: string }[] = [
  // 2026-11-14: adında "Fire Block" / "Fireblock" geçen her ürün "Fire Block" (baba onayladı)
  { id: 'fire-block-2026-11-14', match: /fire\s*-?\s*block/i, category: 'Fire Block' },
]

export async function applyTitleCategoryRules(): Promise<{ category: string; asins: number }[]> {
  const done = ((await db.kv.get('title-rules'))?.value as string[] | undefined) ?? []
  const todo = TITLE_RULES.filter((r) => !done.includes(r.id))
  if (!todo.length) return []
  const out: { category: string; asins: number }[] = []
  const products = await db.products.toArray()
  const renames = await getCategoryRenames()
  for (const r of todo) {
    const rule = { ...r, category: renamed(renames, r.category) }
    const items = new Map<string, { asin: string; category: string; brandKey: string }>()
    for (const p of products) {
      if (p.asin && rule.match.test(p.title ?? '')) items.set(p.asin, { asin: p.asin, category: rule.category, brandKey: p.brandKey })
    }
    // Kategori listesinde yoksa ekle
    const list = await getCategoryList()
    if (!list.some((c) => c.toLocaleLowerCase('tr') === rule.category.toLocaleLowerCase('tr'))) await addCategoryToList(rule.category)
    await setCategories([...items.values()])
    out.push({ category: rule.category, asins: items.size })
  }
  await db.kv.put({ key: 'title-rules', value: [...done, ...todo.map((r) => r.id)] })
  return out
}
