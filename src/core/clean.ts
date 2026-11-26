import { createBrandResolver, resolveCompany, type BrandAlias } from './brands'
import { FIELD_BY_KEY, matchField, type ProductField } from './columns'
import { guessDate, todayISO } from './dates'
import { isEmptyCell, parseCell, parseUSNumber } from './number'
import type {
  CleanIssue,
  Marketplace,
  Product,
  ReportTotals,
  Settings,
} from './types'

export type Cell = string | number | boolean | Date | null | undefined
export type Row = Cell[]

export type DraftProduct = Omit<Product, 'id' | 'reportId'>

export type ParsedSheet = {
  uid: string
  fileName: string
  sheetName: string
  /** Ürün tablosu bulunamadıysa nedeni */
  skipped?: string
  headerRowIndex: number
  columnMap: Partial<Record<ProductField, string>>
  unmappedColumns: string[]
  products: DraftProduct[]
  issues: CleanIssue[]
  date: string
  dateSource: 'sekme' | 'dosya' | 'bugün'
  brand: string
  brandKey: string
  brandCounts: { brand: string; count: number }[]
  marketplace: Marketplace
  /** Dosya içeriğinin SHA-256 özeti (aynı dosya tekrar yüklenince uyarmak için) */
  fileHash?: string
  /** Dosyaya gömülü ürün görselleri, ASIN'e göre */
  images?: Map<string, { data: Uint8Array; type: string }>
}

export type CleanContext = {
  fileName: string
  sheetName: string
  aliases?: BrandAlias[]
  categoryLookup?: (asin: string) => string | undefined
}

export const UNDEFINED_CATEGORY = 'Tanımlanmamış'
const ASIN_RE = /^[A-Z0-9]{10}$/
const SUMMARY_RE = /^(grand\s+)?(total|totals|toplam|genel toplam|sum|average|avg|ortalama)\b/i
const MIN_HEADER_SCORE = 3
const HEADER_SCAN_ROWS = 30

const NUMERIC_FIELDS = [
  'price', 'parentSales', 'sales', 'recentPurchases', 'parentRevenue', 'revenue',
  'parentTrend', 'asinTrend', 'bsr', 'stock', 'fees', 'fbaSellers', 'fbmSellers', 'activeSellers',
  'weight', 'salesRankPct', 'reviews', 'rating', 'variationCount', 'sellerAge',
  'titleCharCount', 'imageCount', 'reviewVelocity',
] as const satisfies readonly ProductField[]

function cellText(v: Cell): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).replace(/\s+/g, ' ').trim()
}

/** İlk satırlarda en çok bilinen sütun adını içeren satırı başlık kabul eder. */
export function findHeaderRow(rows: Row[]): { index: number; score: number } {
  let best = { index: -1, score: 0 }
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS)
  for (let i = 0; i < limit; i++) {
    const fields = new Set<ProductField>()
    for (const c of rows[i] ?? []) {
      const f = matchField(c)
      if (f) fields.add(f)
    }
    const hasKey = fields.has('asin') || fields.has('title')
    if (hasKey && fields.size > best.score) best = { index: i, score: fields.size }
  }
  return best.score >= MIN_HEADER_SCORE ? best : { index: -1, score: best.score }
}

function detectMarketplace(urls: string[]): Marketplace {
  const counts = { Amazon: 0, Walmart: 0, eBay: 0 }
  for (const u of urls) {
    const s = u.toLowerCase()
    if (s.includes('amazon.')) counts.Amazon++
    else if (s.includes('walmart.')) counts.Walmart++
    else if (s.includes('ebay.')) counts.eBay++
  }
  const top = (Object.entries(counts) as [Marketplace, number][]).sort((a, b) => b[1] - a[1])[0]
  return top[1] > 0 ? top[0] : 'Bilinmiyor'
}

export function cleanSheet(rows: Row[], ctx: CleanContext): ParsedSheet {
  const uid = `${ctx.fileName}::${ctx.sheetName}`
  const fromSheet = guessDate(ctx.sheetName)
  const fromFile = guessDate(ctx.fileName)
  const dateGuess = fromSheet ?? fromFile
  const base: ParsedSheet = {
    uid,
    fileName: ctx.fileName,
    sheetName: ctx.sheetName,
    headerRowIndex: -1,
    columnMap: {},
    unmappedColumns: [],
    products: [],
    issues: [],
    date: dateGuess?.date ?? todayISO(),
    dateSource: fromSheet ? 'sekme' : fromFile ? 'dosya' : 'bugün',
    brand: '',
    brandKey: '',
    brandCounts: [],
    marketplace: 'Bilinmiyor',
  }

  const header = findHeaderRow(rows)
  if (header.index < 0) {
    return { ...base, skipped: 'Bu sayfada ürün tablosu bulunamadı (ASIN veya ürün adı sütunu yok).' }
  }

  // --- Sütun eşleme ---
  const headerRow = rows[header.index] ?? []
  const colOf = new Map<ProductField, number>()
  const extraCols: { index: number; name: string }[] = []
  // Aynı alana iki sütun eşleşirse (Xray'de boş "Image" + dolu "Image URL") dolu olan seçilir
  const dataRows = rows.slice(header.index + 1, header.index + 51)
  const filled = (i: number) => dataRows.filter((r) => !isEmptyCell(r?.[i])).length
  headerRow.forEach((h, i) => {
    const name = cellText(h)
    if (!name) return
    const f = matchField(name)
    const prev = f ? colOf.get(f) : undefined
    if (f && prev !== undefined && filled(i) > filled(prev)) {
      // Önceki sütun boş/az dolu: ek sütuna düşür, bunu kullan
      const prevName = base.columnMap[f]!
      extraCols.push({ index: prev, name: prevName })
      base.unmappedColumns.push(prevName)
      colOf.set(f, i)
      base.columnMap[f] = name
    } else if (f && prev === undefined) {
      colOf.set(f, i)
      base.columnMap[f] = name
    } else {
      extraCols.push({ index: i, name })
      base.unmappedColumns.push(name)
    }
  })

  const resolveBrand = createBrandResolver(ctx.aliases)
  const issues: CleanIssue[] = []
  const parseFailures = new Map<ProductField, number>()
  const turkishFixes = new Map<ProductField, number>()
  const rawSpellings = new Map<string, Set<string>>()
  const brandCount = new Map<string, number>()
  const seenAsins = new Map<string, number>()
  const urls: string[] = []
  let skippedRows = 0
  let uncategorized = 0
  let viaSeller = 0
  const unresolved: { index: number; brand: string; key: string; brandRaw: string }[] = []

  const get = (row: Row, f: ProductField): Cell => {
    const i = colOf.get(f)
    return i === undefined ? null : row[i]
  }
  const text = (row: Row, f: ProductField) => cellText(get(row, f))
  const num = (row: Row, f: ProductField): number | null => {
    const v = get(row, f)
    const type = FIELD_BY_KEY.get(f)!.type
    // Para alanlarında Türkçe tahmini yapılmaz; "1.234" fiyatı her zaman 1.234 dolardır.
    const { value, fixedTurkish } =
      type === 'money'
        ? { value: parseUSNumber(v), fixedTurkish: false }
        : parseCell(v, type === 'integer')
    if (value === null && !isEmptyCell(v)) parseFailures.set(f, (parseFailures.get(f) ?? 0) + 1)
    if (fixedTurkish) turkishFixes.set(f, (turkishFixes.get(f) ?? 0) + 1)
    return value
  }

  for (let r = header.index + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (row.every((c) => isEmptyCell(c) || cellText(c) === '')) continue

    const url = text(row, 'url')
    let asin = text(row, 'asin').toUpperCase()
    if (!ASIN_RE.test(asin)) {
      const m = url.match(/\/dp\/([A-Z0-9]{10})/i)
      asin = m ? m[1].toUpperCase() : asin
    }
    const title = text(row, 'title')
    const isSummary = !ASIN_RE.test(asin) && SUMMARY_RE.test(title)
    if ((!asin && !title) || isSummary) {
      skippedRows++
      continue
    }

    const brandRaw = text(row, 'brandRaw')
    const { brand, key, via } = resolveCompany(resolveBrand, brandRaw, [text(row, 'buyBox'), text(row, 'seller')])
    if (via === 'satıcı') viaSeller++
    // Ne markası ne satıcısı tanınan ürünler sonra dosyanın ana firmasına bağlanır
    if (via === 'bilinmiyor') unresolved.push({ index: base.products.length, brand, key, brandRaw })
    else if (key) {
      brandCount.set(brand, (brandCount.get(brand) ?? 0) + 1)
      if (!rawSpellings.has(brand)) rawSpellings.set(brand, new Set())
      rawSpellings.get(brand)!.add(brandRaw)
    }

    let category = text(row, 'category')
    if (!category || category === UNDEFINED_CATEGORY) {
      category = (asin && ctx.categoryLookup?.(asin)) || UNDEFINED_CATEGORY
    }
    if (category === UNDEFINED_CATEGORY) uncategorized++

    if (asin) seenAsins.set(asin, (seenAsins.get(asin) ?? 0) + 1)
    if (url) urls.push(url)

    const displayOrder = text(row, 'displayOrder')
    const numbers = Object.fromEntries(NUMERIC_FIELDS.map((f) => [f, num(row, f)])) as Record<
      (typeof NUMERIC_FIELDS)[number],
      number | null
    >

    const extra: Record<string, string | number> = {}
    for (const c of extraCols) {
      const v = row[c.index]
      if (isEmptyCell(v)) continue
      extra[c.name] = typeof v === 'number' ? v : cellText(v)
    }

    base.products.push({
      asin,
      title,
      brand,
      brandKey: key,
      brandRaw,
      category,
      displayOrder,
      isParent: /^\d+\.?$/.test(displayOrder),
      url,
      imageUrl: text(row, 'imageUrl'),
      ...numbers,
      salesAdjusted: numbers.sales,
      revenueCalc: 0,
      ruleApplied: false,
      fba: text(row, 'fba'),
      fbm: text(row, 'fbm'),
      dimensions: text(row, 'dimensions'),
      sizeTier: text(row, 'sizeTier'),
      sellerCountry: text(row, 'sellerCountry'),
      bsrTopCategory: text(row, 'bsrTopCategory'),
      creationDate: text(row, 'creationDate'),
      sponsored: text(row, 'sponsored'),
      bestSeller: text(row, 'bestSeller'),
      seller: text(row, 'seller'),
      amazonCategory: text(row, 'amazonCategory'),
      buyBox: text(row, 'buyBox'),
      fulfillment: text(row, 'fulfillment'),
      abaMostClicked: text(row, 'abaMostClicked'),
      extra,
    })
  }

  // --- Tanınmayan ürünleri dosyanın ana firmasına bağla ---
  // Helium 10 taraması bir mağazanın listesidir; tanınmayan birkaç ürün de o mağazanındır.
  const dominant = [...brandCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (dominant) {
    const key = createBrandResolver(ctx.aliases)(dominant).key
    for (const u of unresolved) {
      base.products[u.index] = { ...base.products[u.index], brand: dominant, brandKey: key }
      brandCount.set(dominant, (brandCount.get(dominant) ?? 0) + 1)
    }
    if (unresolved.length)
      issues.push({
        level: 'warning',
        message: `Markası ve satıcısı tanınmayan ürünler dosyanın ana firmasına (${dominant}) bağlandı: ${[...new Set(unresolved.map((u) => u.brandRaw || 'markasız'))].join(', ')}. Yanlışsa Ayarlar'dan eşleme ekleyin.`,
        count: unresolved.length,
      })
  } else {
    for (const u of unresolved) if (u.key) brandCount.set(u.brand, (brandCount.get(u.brand) ?? 0) + 1)
  }

  // --- Rapor ---
  const n = base.products.length
  if (header.index > 0)
    issues.push({ level: 'info', message: `Başlık satırı ${header.index + 1}. satırda bulundu, üstündeki satırlar atlandı.` })
  if (skippedRows)
    issues.push({ level: 'info', message: 'ASIN ve ürün adı olmayan satırlar (özet/toplam satırları) atlandı.', count: skippedRows })

  for (const f of ['asin', 'sales', 'price'] as ProductField[]) {
    if (!colOf.has(f))
      issues.push({ level: 'error', message: `"${FIELD_BY_KEY.get(f)!.label}" sütunu bulunamadı. Hesaplamalar eksik olabilir.` })
  }
  for (const [f, count] of parseFailures) {
    issues.push({ level: 'warning', message: `${FIELD_BY_KEY.get(f)!.label}: sayıya çevrilemeyen hücreler boş bırakıldı.`, count })
  }
  for (const [f, count] of turkishFixes) {
    issues.push({
      level: 'warning',
      message: `${FIELD_BY_KEY.get(f)!.label}: Türkçe sayı biçiminde yazılmış hücreler düzeltildi (ör. "4,3" → 4.3). Dosya Türkçe Excel'den geçmiş olabilir.`,
      count,
    })
  }
  const dupes = [...seenAsins.values()].filter((c) => c > 1).length
  if (dupes) issues.push({ level: 'warning', message: 'Aynı ASIN birden fazla satırda geçiyor.', count: dupes })

  for (const [brand, spellings] of rawSpellings) {
    const distinct = [...spellings].filter(Boolean)
    if (distinct.length > 1 || (distinct.length === 1 && distinct[0] !== brand))
      issues.push({ level: 'info', message: `Marka adları birleştirildi: ${distinct.map((s) => `"${s}"`).join(', ')} → ${brand}` })
  }
  if (viaSeller)
    issues.push({ level: 'info', message: 'Markası tanınmayan ürünlerin firması satıcıdan bulundu.', count: viaSeller })
  if (uncategorized)
    issues.push({ level: 'warning', message: 'Kategorisi bilinmeyen ürünler "Tanımlanmamış" olarak işaretlendi.', count: uncategorized })
  if (base.unmappedColumns.length)
    issues.push({ level: 'info', message: `Tanınmayan ${base.unmappedColumns.length} sütun olduğu gibi saklandı.` })
  if (n === 0) issues.push({ level: 'error', message: 'Okunabilir ürün satırı bulunamadı.' })

  const brandCounts = [...brandCount.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count)
  const top = brandCounts[0]

  return {
    ...base,
    headerRowIndex: header.index,
    issues,
    brandCounts,
    brand: top?.brand ?? '',
    brandKey: top ? resolveBrand(top.brand).key : '',
    marketplace: detectMarketplace(urls),
  }
}

/**
 * V4'ten gelen iş kuralı: "Son alımlar" satış adedinden büyükse satış = son alımlar x çarpan.
 * Kendi markalarımız (Lotos Global: Kraken, Sprayman, Stanley, Akfix) hariç tutulur. Ham değerler korunur.
 */
export function applyRules(
  products: DraftProduct[],
  reportBrandKey: string,
  rule: Settings['rule']
): { products: DraftProduct[]; adjusted: number } {
  const excluded = rule.excludeBrandKeys.includes(reportBrandKey)
  let adjusted = 0
  const out = products.map((p) => {
    let salesAdjusted = p.sales
    let ruleApplied = false
    if (
      rule.enabled &&
      !excluded &&
      p.recentPurchases !== null &&
      p.recentPurchases > (p.sales ?? 0)
    ) {
      salesAdjusted = p.recentPurchases * rule.multiplier
      ruleApplied = true
      adjusted++
    }
    const revenueCalc =
      p.price !== null && salesAdjusted !== null ? salesAdjusted * p.price : (p.revenue ?? 0)
    return { ...p, salesAdjusted, ruleApplied, revenueCalc }
  })
  return { products: out, adjusted }
}

export function computeTotals(products: Pick<Product, 'revenueCalc' | 'salesAdjusted' | 'isParent'>[]): ReportTotals {
  let revenue = 0
  let sales = 0
  let parents = 0
  for (const p of products) {
    revenue += p.revenueCalc || 0
    sales += p.salesAdjusted || 0
    if (p.isParent) parents++
  }
  return { revenue, sales, listings: products.length, parents }
}
