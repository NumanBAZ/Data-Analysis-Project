import ExcelJS from 'exceljs'
import { computeTotals, UNDEFINED_CATEGORY } from './clean'
import type { Product, Report } from './types'

/**
 * V4'teki Excel raporlarının karşılıkları:
 * - Özet (summary_manager): List = Firma x Kategori x Tarih ciro, Total = Firma x Tarih ciro + fark
 * - Yıllık rapor (annual_report_manager): Sum sayfası + her tarih için ürün sayfası (görselli)
 * - Rapor (report_exporter): tek raporun biçimli ürün listesi
 *
 * Görseller Xray dosyasından çıkarılıp veritabanında saklananlardır; Excel'e gömülür
 * (internet veya Microsoft 365 gerekmez).
 */

export type ImageMap = Map<string, { data: Uint8Array; type: string }>

type V = string | number | null | undefined
type Kind = 'text' | 'money' | 'int' | 'pct' | 'dec'
const FMT: Record<Kind, string | undefined> = { text: undefined, money: '$#,##0.00', int: '#,##0', pct: '0.0%', dec: '0.0' }
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }

/** "2026-06-08" → "8Jun26" (V4 yıllık rapor sayfa adı) */
export function sheetDateName(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]
  return `${d}${mon}${String(y).slice(2)}`
}

/** "2026-06-08" → "08.06.2026" */
const dateHeader = (iso: string) => iso.split('-').reverse().join('.')

export function categoryRevenue(products: Pick<Product, 'category' | 'revenueCalc'>[]) {
  const m = new Map<string, number>()
  for (const p of products) {
    const c = p.category || UNDEFINED_CATEGORY
    m.set(c, (m.get(c) ?? 0) + (p.revenueCalc || 0))
  }
  return m
}

const sortTR = (a: string, b: string) => a.localeCompare(b, 'tr')

/** Başlıklı, biçimli tablo sayfası. kinds: sütun biçimleri; totalRows: kalın yazılacak satır numaraları (1 tabanlı, veri dahil) */
function addTable(
  wb: ExcelJS.Workbook,
  name: string,
  header: string[],
  rows: V[][],
  opts: { widths: number[]; kinds: Kind[]; freeze?: { row: number; col: number }; bold?: (row: V[]) => boolean }
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name.slice(0, 31), {
    views: [{ state: 'frozen', xSplit: opts.freeze?.col ?? 0, ySplit: opts.freeze?.row ?? 1 }],
  })
  ws.columns = header.map((h, i) => ({ header: h, width: opts.widths[i] ?? 12, style: { numFmt: FMT[opts.kinds[i] ?? 'text'] } }))
  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.fill = HEADER_FILL
  head.alignment = { vertical: 'middle' }
  head.height = 20
  for (const r of rows) {
    const row = ws.addRow(r.map((v) => (v === undefined ? null : v)))
    if (opts.bold?.(r)) {
      row.font = { bold: true }
      row.fill = TOTAL_FILL
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } }
  return ws
}

async function toBytes(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

function newBook() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Benasse Analiz'
  wb.created = new Date()
  return wb
}

// ---------------------------------------------------------------------------
// 7. Özet Excel (Total + List)
// ---------------------------------------------------------------------------

export async function buildSummaryWorkbook(reports: Report[], productsByReport: Map<number, Product[]>): Promise<Uint8Array> {
  const dates = [...new Set(reports.map((r) => r.date))].sort()
  const companies = [...new Set(reports.map((r) => r.brand))].sort(sortTR)
  const byKey = new Map(reports.map((r) => [`${r.brand}|${r.date}`, r]))
  const wb = newBook()

  // Total: Company | Diff | Diff % | tarihler
  const total: V[][] = []
  const sums = dates.map(() => 0)
  for (const company of companies) {
    const vals = dates.map((d) => byKey.get(`${company}|${d}`)?.totals.revenue ?? null)
    vals.forEach((v, i) => (sums[i] += v ?? 0))
    const known = vals.filter((v): v is number => v !== null)
    const last = known.length ? known[known.length - 1] : undefined
    const prev = known.length > 1 ? known[known.length - 2] : undefined
    const diff = last !== undefined && prev !== undefined ? last - prev : null
    total.push([company, diff, diff !== null && prev ? diff / prev : null, ...vals])
  }
  total.push(['TOTAL', null, null, ...sums])
  addTable(wb, 'Total', ['Company', 'Diff', 'Diff %', ...dates.map(dateHeader)], total, {
    widths: [24, 14, 9, ...dates.map(() => 14)],
    kinds: ['text', 'money', 'pct', ...dates.map((): Kind => 'money')],
    freeze: { row: 1, col: 1 },
    bold: (r) => r[0] === 'TOTAL',
  })

  // List: Company | Category | tarihler
  const list: V[][] = []
  for (const company of companies) {
    const perDate = dates.map((d) => {
      const r = byKey.get(`${company}|${d}`)
      return r ? categoryRevenue(productsByReport.get(r.id!) ?? []) : null
    })
    const cats = [...new Set(perDate.flatMap((m) => (m ? [...m.keys()] : [])))].sort(sortTR)
    for (const cat of cats) list.push([company, cat, ...perDate.map((m) => (m ? (m.get(cat) ?? 0) : null))])
    list.push([`${company} Total`, '', ...dates.map((d) => byKey.get(`${company}|${d}`)?.totals.revenue ?? null)])
  }
  addTable(wb, 'List', ['Company', 'Category', ...dates.map(dateHeader)], list, {
    widths: [24, 22, ...dates.map(() => 14)],
    kinds: ['text', 'text', ...dates.map((): Kind => 'money')],
    freeze: { row: 1, col: 2 },
    bold: (r) => String(r[0]).endsWith(' Total'),
  })
  return toBytes(wb)
}

// ---------------------------------------------------------------------------
// Ürün sayfası (görselli)
// ---------------------------------------------------------------------------

export const PRODUCT_COLS: { label: string; width: number; kind: Kind; get: (p: Product) => V }[] = [
  { label: 'Sıra', width: 7, kind: 'text', get: (p) => p.displayOrder },
  { label: 'ASIN', width: 13, kind: 'text', get: (p) => p.asin },
  { label: 'Ürün', width: 60, kind: 'text', get: (p) => p.title },
  { label: 'Marka', width: 16, kind: 'text', get: (p) => p.brand },
  { label: 'Kategori', width: 18, kind: 'text', get: (p) => p.category },
  { label: 'Fiyat', width: 10, kind: 'money', get: (p) => p.price },
  { label: 'Satış (ham)', width: 11, kind: 'int', get: (p) => p.sales },
  { label: 'Satış', width: 10, kind: 'int', get: (p) => p.salesAdjusted },
  { label: 'Ciro', width: 14, kind: 'money', get: (p) => p.revenueCalc },
  { label: 'Kural', width: 7, kind: 'text', get: (p) => (p.ruleApplied ? 'Evet' : '') },
  { label: 'Elle', width: 7, kind: 'text', get: (p) => (p.edits ? 'Evet' : '') },
  { label: 'BSR', width: 10, kind: 'int', get: (p) => p.bsr },
  { label: 'Yorum', width: 9, kind: 'int', get: (p) => p.reviews },
  { label: 'Puan', width: 6, kind: 'dec', get: (p) => p.rating },
  { label: 'Satıcı', width: 20, kind: 'text', get: (p) => p.seller },
  { label: 'URL', width: 40, kind: 'text', get: (p) => p.url },
]

const IMG_PX = 56

function addProductSheet(wb: ExcelJS.Workbook, name: string, products: Product[], images: ImageMap) {
  const sorted = [...products].sort((a, b) => b.revenueCalc - a.revenueCalc)
  const rows: V[][] = sorted.map((p) => [null, ...PRODUCT_COLS.map((c) => c.get(p))])
  const t = sorted.reduce((a, p) => ({ rev: a.rev + (p.revenueCalc || 0), sales: a.sales + (p.salesAdjusted || 0) }), { rev: 0, sales: 0 })
  rows.push([null, ...PRODUCT_COLS.map((c) => (c.label === 'Ürün' ? 'TOPLAM' : c.label === 'Satış' ? t.sales : c.label === 'Ciro' ? t.rev : null))])

  const ws = addTable(wb, name, ['Görsel', ...PRODUCT_COLS.map((c) => c.label)], rows, {
    widths: [10, ...PRODUCT_COLS.map((c) => c.width)],
    kinds: ['text', ...PRODUCT_COLS.map((c) => c.kind)],
    freeze: { row: 1, col: 4 },
    bold: (r) => r[3] === 'TOPLAM',
  })
  ws.getColumn(4).alignment = { wrapText: true, vertical: 'middle' }

  // Görselleri hücrelere yerleştir; aynı görsel kitapta bir kez saklanır
  const ids = new Map<string, number>()
  sorted.forEach((p, i) => {
    const img = images.get(p.asin)
    const row = i + 2
    ws.getRow(row).height = img ? IMG_PX * 0.75 + 6 : 30
    if (!img) return
    let id = ids.get(p.asin)
    if (id === undefined) {
      const ext = img.type.includes('png') ? 'png' : img.type.includes('gif') ? 'gif' : 'jpeg'
      id = wb.addImage({ buffer: img.data as unknown as ExcelJS.Buffer, extension: ext })
      ids.set(p.asin, id)
    }
    ws.addImage(id, { tl: { col: 0.1, row: row - 1 + 0.05 }, ext: { width: IMG_PX, height: IMG_PX }, editAs: 'oneCell' })
  })
}

// ---------------------------------------------------------------------------
// 10. Tek raporun biçimli Excel'i
// ---------------------------------------------------------------------------

export async function buildReportWorkbook(
  report: Report,
  products: Product[],
  images: ImageMap = new Map(),
  opts: { category?: string } = {}
): Promise<Uint8Array> {
  const wb = newBook()
  const ws = wb.addWorksheet('Özet')
  ws.columns = [{ width: 24 }, { width: 40 }, { width: 10 }]
  // Kategori filtresi varsa toplamlar yalnızca o kategorinin ürünlerinden
  const t = computeTotals(products)
  const kv: [string, V, Kind][] = [
    ['Firma', report.brand, 'text'],
    ['Tarih', dateHeader(report.date), 'text'],
    ...(opts.category ? [['Kategori', opts.category, 'text'] as [string, V, Kind]] : []),
    ['Dosya', report.fileName, 'text'],
    ['Toplam ciro', t.revenue, 'money'],
    ['Toplam satış', t.sales, 'int'],
    ['Listing', t.listings, 'int'],
    ['Parent', t.parents, 'int'],
    ['Ortalama fiyat', t.sales ? t.revenue / t.sales : null, 'money'],
    ['Elle düzenleme', report.editCount ?? 0, 'int'],
  ]
  for (const [k, v, kind] of kv) {
    const row = ws.addRow([k, v])
    row.getCell(1).font = { bold: true }
    if (FMT[kind]) row.getCell(2).numFmt = FMT[kind]!
    row.getCell(2).alignment = { horizontal: 'left' }
  }

  const section = (title: string[], data: V[][], kinds: Kind[]) => {
    ws.addRow([])
    const h = ws.addRow(title)
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    h.fill = HEADER_FILL
    for (const d of data) {
      const r = ws.addRow(d)
      kinds.forEach((k, i) => FMT[k] && (r.getCell(i + 1).numFmt = FMT[k]!))
    }
  }
  const total = t.revenue || 1
  section(['Kategori', 'Ciro', 'Pay'], [...categoryRevenue(products)].sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, v, v / total]), ['text', 'money', 'pct'])
  const brands = new Map<string, number>()
  for (const p of products) brands.set(p.brand, (brands.get(p.brand) ?? 0) + (p.revenueCalc || 0))
  section(['Marka', 'Ciro', 'Pay'], [...brands].sort((a, b) => b[1] - a[1]).map(([b, v]) => [b, v, v / total]), ['text', 'money', 'pct'])

  addProductSheet(wb, 'Ürünler', products, images)
  return toBytes(wb)
}

// ---------------------------------------------------------------------------
// 8. Firma yıllık raporu (Sum + tarih sayfaları, görselli)
// ---------------------------------------------------------------------------

export async function buildAnnualWorkbook(reports: Report[], productsByReport: Map<number, Product[]>, images: ImageMap = new Map()): Promise<Uint8Array> {
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date))
  const perReport = sorted.map((r) => categoryRevenue(productsByReport.get(r.id!) ?? []))
  const cats = [...new Set(perReport.flatMap((m) => [...m.keys()]))].sort(sortTR)
  const wb = newBook()

  const LABELS = new Set(['Sum', 'Number of Listings', 'Number of Parents'])
  const ws = addTable(
    wb,
    'Sum',
    ['Category', ...sorted.map((r) => dateHeader(r.date))],
    [
      ...cats.map((c) => [c, ...perReport.map((m) => m.get(c) ?? 0)]),
      ['Sum', ...sorted.map((r) => r.totals.revenue)],
      ['Number of Listings', ...sorted.map((r) => r.totals.listings)],
      ['Number of Parents', ...sorted.map((r) => r.totals.parents)],
    ],
    { widths: [24, ...sorted.map(() => 14)], kinds: ['text', ...sorted.map((): Kind => 'money')], freeze: { row: 1, col: 1 }, bold: (r) => LABELS.has(String(r[0])) }
  )
  // Listing / Parent satırları adet biçiminde
  for (let r = ws.rowCount - 1; r <= ws.rowCount; r++) ws.getRow(r).eachCell((c, col) => col > 1 && (c.numFmt = FMT.int!))

  // En yeni tarih Sum'dan hemen sonra (V4'teki sıra)
  const used = new Set<string>(['Sum'])
  for (const r of [...sorted].reverse()) {
    const base = sheetDateName(r.date)
    let name = base
    let i = 2
    while (used.has(name)) name = `${base} (${i++})`
    used.add(name)
    addProductSheet(wb, name, productsByReport.get(r.id!) ?? [], images)
  }
  return toBytes(wb)
}

// ---------------------------------------------------------------------------
// Genel tablo kitabı (filtreli rapor listesi, karşılaştırma vb.)
// ---------------------------------------------------------------------------

export type SheetSpec = {
  name: string
  header: string[]
  rows: V[][]
  kinds: Kind[]
  widths: number[]
  /** Bu satırlar kalın / gri (TOPLAM gibi) */
  bold?: (row: V[]) => boolean
  freeze?: { row: number; col: number }
}

export type { Kind as CellKind }

export async function buildSheetsWorkbook(sheets: SheetSpec[]): Promise<Uint8Array> {
  const wb = newBook()
  for (const s of sheets) addTable(wb, s.name, s.header, s.rows, { widths: s.widths, kinds: s.kinds, bold: s.bold, freeze: s.freeze })
  return toBytes(wb)
}

/** Görselli ürün sayfaları ekleyerek (karşılaştırmada iki tarafın ürünleri) */
export async function buildSheetsWithProducts(
  sheets: SheetSpec[],
  productSheets: { name: string; products: Product[] }[],
  images: ImageMap = new Map()
): Promise<Uint8Array> {
  const wb = newBook()
  for (const s of sheets) addTable(wb, s.name, s.header, s.rows, { widths: s.widths, kinds: s.kinds, bold: s.bold, freeze: s.freeze })
  const used = new Set(sheets.map((s) => s.name.slice(0, 31)))
  for (const ps of productSheets) {
    let name = ps.name.slice(0, 28)
    let i = 2
    while (used.has(name)) name = `${ps.name.slice(0, 25)} (${i++})`
    used.add(name)
    addProductSheet(wb, name, ps.products, images)
  }
  return toBytes(wb)
}

/** Ürün listesinin CSV satırları (Excel'deki ürün sayfasıyla aynı sütunlar) */
export function productCsvRows(products: Product[]) {
  const sorted = [...products].sort((a, b) => b.revenueCalc - a.revenueCalc)
  return { header: PRODUCT_COLS.map((c) => c.label), rows: sorted.map((p) => PRODUCT_COLS.map((c) => c.get(p))) }
}
