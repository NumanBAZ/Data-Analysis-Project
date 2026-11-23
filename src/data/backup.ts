import { db } from './db'

/**
 * Yedek = bir KLASÖR. Her şey ayrı, küçük ve okunabilir dosyalara bölünür:
 *
 *   BENIOKU.txt                       ne nerede (düz yazı)
 *   yedek.json                        tarih, sayılar, dosya listesi
 *   ayarlar.json                      ayarlar (marka, kural…)
 *   kategoriler.json                  kategori listesi, ağaç, eski adlar
 *   asin-kategorileri/01.jsonl        ASIN → kategori (satır başına bir ASIN, dosya başına en çok 1000)
 *   raporlar/raporlar.jsonl           rapor bilgileri (satır başına bir rapor)
 *   raporlar/urunler/001 ….jsonl      her raporun ürün satırları ayrı dosyada (150 satırda bir bölünür)
 *   gorseller/liste.jsonl + B0….jpg   görseller ayrı resim dosyası olarak
 *
 * .jsonl = her satır tek başına bir JSON kaydı; dosya parça parça okunabilir.
 * Eski tek dosyalık .json yedekler de geri yüklenebilir (readBackup).
 */

const FORMAT = 'benasse-analiz-yedek'
const VERSION = 2
const CHUNK = 1000
/** Ürün satırları büyük (~1 KB); dosya başına 150 satır ≈ 150 KB */
const PRODUCT_CHUNK = 150
const CATEGORY_KEYS = ['category-list', 'category-tree', 'category-renames']

type KvRow = { key: string; value: unknown }
type ImageRow = { asin: string; type: string; updatedAt: string; base64: string }

export type BackupData = {
  createdAt: string
  counts: Record<string, number>
  tables: { reports: unknown[]; products: unknown[]; categories: unknown[]; kv: KvRow[]; images: ImageRow[] }
}

export type BackupEntry = { path: string; data: Uint8Array }

const enc = new TextEncoder()
const dec = new TextDecoder()

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

const pad = (n: number, w: number) => String(n).padStart(w, '0')
const jsonl = (rows: unknown[]) => enc.encode(rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''))
const pretty = (v: unknown) => enc.encode(JSON.stringify(v, null, 2) + '\n')
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60)

function chunks<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out.length ? out : [[]]
}

function imageExt(type: string) {
  const t = type.toLowerCase()
  if (t.includes('png')) return 'png'
  if (t.includes('gif')) return 'gif'
  if (t.includes('webp')) return 'webp'
  if (t.includes('bmp')) return 'bmp'
  return 'jpg'
}

/** Klasöre yazılacak dosyalar (yollar klasöre göre, / ile). */
export async function createBackupFiles(): Promise<{ files: BackupEntry[]; counts: Record<string, number> }> {
  const [reports, products, categories, kv, imgs] = await Promise.all([
    db.reports.toArray(), db.products.toArray(), db.categories.toArray(), db.kv.toArray(), db.images.toArray(),
  ])
  const createdAt = new Date().toISOString()
  const counts = { reports: reports.length, products: products.length, categories: categories.length, images: imgs.length }
  const files: BackupEntry[] = []

  files.push({ path: 'ayarlar.json', data: pretty(kv.filter((r) => !CATEGORY_KEYS.includes(r.key))) })
  files.push({ path: 'kategoriler.json', data: pretty(kv.filter((r) => CATEGORY_KEYS.includes(r.key))) })

  const cats = [...categories].sort((a, b) => a.asin.localeCompare(b.asin))
  chunks(cats).forEach((part, i) => files.push({ path: `asin-kategorileri/${pad(i + 1, 2)}.jsonl`, data: jsonl(part) }))

  const sortedReports = [...reports].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  files.push({ path: 'raporlar/raporlar.jsonl', data: jsonl(sortedReports) })
  const byReport = new Map<number, typeof products>()
  for (const p of products) {
    const list = byReport.get(p.reportId)
    if (list) list.push(p)
    else byReport.set(p.reportId, [p])
  }
  sortedReports.forEach((r, i) => {
    const rows = byReport.get(r.id!) ?? []
    byReport.delete(r.id!)
    const base = `raporlar/urunler/${pad(i + 1, 3)} ${safeName(`${r.brand} ${r.date}`)}`
    const parts = chunks(rows, PRODUCT_CHUNK)
    parts.forEach((part, j) => files.push({ path: `${base}${parts.length > 1 ? `-${j + 1}` : ''}.jsonl`, data: jsonl(part) }))
  })
  // Raporu silinmiş ama kalmış satırlar (olmaması gerekir, yine de kaybolmasın)
  const orphans = [...byReport.values()].flat()
  if (orphans.length) files.push({ path: 'raporlar/urunler/raporsuz.jsonl', data: jsonl(orphans) })

  const imageList: { asin: string; type: string; updatedAt: string; file: string }[] = []
  for (const img of imgs) {
    const file = `${safeName(img.asin)}.${imageExt(img.type)}`
    imageList.push({ asin: img.asin, type: img.type, updatedAt: img.updatedAt, file })
    files.push({ path: `gorseller/${file}`, data: new Uint8Array(await img.data.arrayBuffer()) })
  }
  files.push({ path: 'gorseller/liste.jsonl', data: jsonl(imageList) })

  const readme = [
    'Benasse Analiz yedeği',
    `Tarih: ${new Date(createdAt).toLocaleString('tr-TR')}`,
    `${counts.reports} rapor, ${counts.products} ürün satırı, ${counts.categories} kategorili ASIN, ${counts.images} görsel`,
    '',
    'Geri yüklemek için: uygulamada Yedekleme > Yedek klasörü seç > bu klasörü seçin.',
    'Dosyaları silmeyin veya adlarını değiştirmeyin.',
    '',
    'ayarlar.json              Ayarlar (bizim markalar, satış kuralı, marka birleştirme)',
    'kategoriler.json          Kategori listesi, kategori ağacı, eski kategori adları',
    'asin-kategorileri/        ASIN -> kategori atamaları (her satır bir ASIN)',
    'raporlar/raporlar.jsonl   Rapor bilgileri (her satır bir rapor)',
    'raporlar/urunler/         Her raporun ürün satırları ayrı dosyada (her satır bir ürün)',
    'gorseller/                Ürün görselleri (ASIN adıyla) ve liste.jsonl',
    '',
  ].join('\r\n')
  files.push({ path: 'BENIOKU.txt', data: enc.encode(readme) })

  const manifest = { format: FORMAT, version: VERSION, createdAt, counts, files: files.map((f) => f.path).sort() }
  files.push({ path: 'yedek.json', data: pretty(manifest) })
  return { files, counts }
}

const parseJsonl = (bytes: Uint8Array) =>
  dec.decode(bytes).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as unknown)

/** Klasörden okunan dosyalar (yol klasöre göre, / ile) → yedek verisi. */
export function readBackupFolder(files: Map<string, Uint8Array>): BackupData {
  const m = files.get('yedek.json')
  if (!m) throw new Error('Bu klasör bir Benasse Analiz yedeği değil (yedek.json yok).')
  const manifest = JSON.parse(dec.decode(m)) as { format?: string; version: number; createdAt: string; counts: Record<string, number>; files?: string[] }
  if (manifest.format !== FORMAT) throw new Error('Bu klasör bir Benasse Analiz yedeği değil.')
  if (manifest.version > VERSION) throw new Error('Yedek, uygulamanın daha yeni bir sürümüyle alınmış.')
  const missing = (manifest.files ?? []).filter((p) => p !== 'yedek.json' && !files.has(p))
  if (missing.length) throw new Error(`Yedek eksik, şu dosyalar bulunamadı: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`)

  const get = (p: string) => files.get(p) ?? new Uint8Array()
  const under = (dir: string) => [...files.keys()].filter((p) => p.startsWith(dir) && p.endsWith('.jsonl')).sort()

  const kv = [
    ...(JSON.parse(dec.decode(get('ayarlar.json')) || '[]') as KvRow[]),
    ...(JSON.parse(dec.decode(get('kategoriler.json')) || '[]') as KvRow[]),
  ]
  const categories = under('asin-kategorileri/').flatMap((p) => parseJsonl(get(p)))
  const reports = parseJsonl(get('raporlar/raporlar.jsonl'))
  const products = under('raporlar/urunler/').flatMap((p) => parseJsonl(get(p)))
  const imageList = parseJsonl(get('gorseller/liste.jsonl')) as { asin: string; type: string; updatedAt: string; file: string }[]
  const images = imageList
    .filter((i) => files.has(`gorseller/${i.file}`))
    .map((i) => ({ asin: i.asin, type: i.type, updatedAt: i.updatedAt, base64: toBase64(get(`gorseller/${i.file}`)) }))

  return { createdAt: manifest.createdAt, counts: manifest.counts, tables: { reports, products, categories, kv, images } }
}

/** Eski tek dosyalık .json yedek (sürüm 1). Tarayıcıda deneme için de kullanılır. */
export async function createSingleFileBackup(): Promise<Uint8Array> {
  const [reports, products, categories, kv, imgs] = await Promise.all([
    db.reports.toArray(), db.products.toArray(), db.categories.toArray(), db.kv.toArray(), db.images.toArray(),
  ])
  const images = await Promise.all(
    imgs.map(async (i) => ({ asin: i.asin, type: i.type, updatedAt: i.updatedAt, base64: toBase64(new Uint8Array(await i.data.arrayBuffer())) }))
  )
  const counts = { reports: reports.length, products: products.length, categories: categories.length, images: images.length }
  return enc.encode(JSON.stringify({ format: FORMAT, version: 1, createdAt: new Date().toISOString(), counts, tables: { reports, products, categories, kv, images } }))
}

export function readBackup(text: string): BackupData {
  const f = JSON.parse(text) as BackupData & { format?: string; version: number }
  if (f?.format !== FORMAT || !f.tables) throw new Error('Bu dosya bir Benasse Analiz yedeği değil.')
  if (f.version > 1) throw new Error('Bu yeni tür bir yedek; dosya yerine klasörü seçin.')
  return f
}

/** Mevcut verinin tamamını siler ve yedeği yükler. */
export async function restoreBackup(f: BackupData) {
  const t = f.tables
  await db.transaction('rw', [db.reports, db.products, db.categories, db.kv, db.images], async () => {
    await Promise.all([db.reports.clear(), db.products.clear(), db.categories.clear(), db.kv.clear(), db.images.clear()])
    await db.reports.bulkAdd(t.reports as never[])
    await db.products.bulkAdd(t.products as never[])
    await db.categories.bulkAdd(t.categories as never[])
    await db.kv.bulkAdd(t.kv as never[])
    await db.images.bulkAdd(
      t.images.map((i) => ({ asin: i.asin, type: i.type, updatedAt: i.updatedAt, data: new Blob([fromBase64(i.base64) as BlobPart], { type: i.type }) }))
    )
  })
}
