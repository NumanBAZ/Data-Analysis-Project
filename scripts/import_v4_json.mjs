/**
 * V4'ün json/ klasöründeki ASIN → kategori kütüphanelerini uygulamanın tek dosyasına çevirir:
 *   node scripts/import_v4_json.mjs ../json
 * Çıktı: public/seed/categories.json (uygulama açılışta okur, eksik ASIN'leri ekler).
 * Bir ASIN iki dosyada farklı kategoriyle geçerse aktarım DURUR (karışma olmasın diye).
 */
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2] ?? '../json'
// V4'teki yazım farkları
const FIX = { 'Ballon Shine': 'Balloon Shine' }
const key = (s) => s.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()

const map = new Map()
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'settings.json').sort()) {
  const brand = f.replace(/\.json$/, '')
  const text = fs.readFileSync(path.join(dir, f), 'utf8')
  const keys = [...text.matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1])
  if (new Set(keys).size !== keys.length) throw new Error(`${f}: aynı ASIN dosyada iki kez geçiyor`)
  for (const [asinRaw, catRaw] of Object.entries(JSON.parse(text))) {
    const asin = asinRaw.trim().toUpperCase()
    if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error(`${f}: geçersiz ASIN ${asinRaw}`)
    const category = FIX[catRaw.trim()] ?? catRaw.trim()
    const prev = map.get(asin)
    if (prev && prev.category !== category)
      throw new Error(`ÇELİŞKİ ${asin}: ${prev.source}=${prev.category}, ${f}=${category}`)
    if (!prev) map.set(asin, { asin, category, brandKey: key(brand), source: f })
  }
}

const entries = [...map.values()].sort((a, b) => a.asin.localeCompare(b.asin))
const out = { version: 1, source: 'V4 json/ klasörü', createdAt: new Date().toISOString(), count: entries.length, entries }
fs.writeFileSync('public/seed/categories.json', JSON.stringify(out, null, 1))
console.log(`${entries.length} ASIN yazıldı → public/seed/categories.json`)
