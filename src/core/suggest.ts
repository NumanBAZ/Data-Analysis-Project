/**
 * Kategori önerisi: yapay zeka servisi değil, bilgisayarda çalışan basit bir istatistik modeli
 * (Naive Bayes). Daha önce kategorisi verilmiş ürün adlarından kelime → kategori sıklığını öğrenir.
 *
 * Kesin kaynak her zaman ASIN kütüphanesidir (V4 verisinde 1.276 ASIN'in hiçbiri iki farklı
 * kategoriye atanmamış). Bu model yalnızca kütüphanede olmayan yeni ASIN'ler için öneri üretir;
 * V4 verisiyle yapılan çapraz testte isabet ~%94, "emin" önerilerde ~%95.
 * Öneriler kullanıcı onaylamadan kaydedilmez.
 */

const STOP = new Set([
  'and', 'for', 'the', 'with', 'pack', 'pcs', 'set', 'use', 'new', 'from', 'oz', 'fl', 'inch', 'ideal',
  'all', 'your', 'made', 'more', 'non', 'free', 'great', 'best',
])

export function tokens(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !STOP.has(w))
  return [...new Set(words)]
}

export type CategoryModel = {
  classes: Map<string, { docs: number; words: Map<string, number>; total: number }>
  vocab: number
  docs: number
}

export function trainCategoryModel(items: { title: string; category: string }[]): CategoryModel {
  const classes: CategoryModel['classes'] = new Map()
  const vocab = new Set<string>()
  for (const it of items) {
    let c = classes.get(it.category)
    if (!c) classes.set(it.category, (c = { docs: 0, words: new Map(), total: 0 }))
    c.docs++
    for (const w of tokens(it.title)) {
      c.words.set(w, (c.words.get(w) ?? 0) + 1)
      c.total++
      vocab.add(w)
    }
  }
  return { classes, vocab: vocab.size, docs: items.length }
}

export type Suggestion = { category: string; confidence: number }

/** En olası kategori ve güven (0–1). Model boşsa ya da adda bilinen kelime yoksa null. */
export function suggestCategory(model: CategoryModel, title: string): Suggestion | null {
  if (!model.docs) return null
  const ws = tokens(title)
  if (!ws.some((w) => [...model.classes.values()].some((c) => c.words.has(w)))) return null
  const scores: [string, number][] = []
  for (const [name, c] of model.classes) {
    let s = Math.log(c.docs / model.docs)
    for (const w of ws) s += Math.log(((c.words.get(w) ?? 0) + 1) / (c.total + model.vocab))
    scores.push([name, s])
  }
  scores.sort((a, b) => b[1] - a[1])
  // log skorlarını olasılığa çevir
  const max = scores[0][1]
  const sum = scores.reduce((a, [, s]) => a + Math.exp(s - max), 0)
  return { category: scores[0][0], confidence: 1 / sum }
}

/** Bu güvenin üstündeki öneriler "emin" sayılır ve toplu onaylanabilir. */
export const CONFIDENT = 0.9
