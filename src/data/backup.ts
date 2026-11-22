import { db } from './db'

/**
 * Bütün veritabanını tek bir JSON dosyasına yazar / dosyadan geri yükler.
 * Görseller base64 olarak dosyanın içine girer; dosya tek başına yeterlidir.
 */

const FORMAT = 'benasse-analiz-yedek'
const VERSION = 1

type BackupFile = {
  format: typeof FORMAT
  version: number
  createdAt: string
  counts: Record<string, number>
  tables: {
    reports: unknown[]
    products: unknown[]
    categories: unknown[]
    kv: unknown[]
    images: { asin: string; type: string; updatedAt: string; base64: string }[]
  }
}

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

export async function createBackup(): Promise<{ data: Uint8Array; counts: Record<string, number> }> {
  const [reports, products, categories, kv, imgs] = await Promise.all([
    db.reports.toArray(), db.products.toArray(), db.categories.toArray(), db.kv.toArray(), db.images.toArray(),
  ])
  const images = await Promise.all(
    imgs.map(async (i) => ({ asin: i.asin, type: i.type, updatedAt: i.updatedAt, base64: toBase64(new Uint8Array(await i.data.arrayBuffer())) }))
  )
  const counts = { reports: reports.length, products: products.length, categories: categories.length, images: images.length }
  const file: BackupFile = { format: FORMAT, version: VERSION, createdAt: new Date().toISOString(), counts, tables: { reports, products, categories, kv, images } }
  return { data: new TextEncoder().encode(JSON.stringify(file)), counts }
}

export function readBackup(text: string): BackupFile {
  const f = JSON.parse(text) as BackupFile
  if (f?.format !== FORMAT || !f.tables) throw new Error('Bu dosya bir Benasse Analiz yedeği değil.')
  if (f.version > VERSION) throw new Error('Yedek, uygulamanın daha yeni bir sürümüyle alınmış.')
  return f
}

/** Mevcut verinin tamamını siler ve yedeği yükler. */
export async function restoreBackup(f: BackupFile) {
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
