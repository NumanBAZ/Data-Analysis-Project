/**
 * Helium 10 export'ları ABD formatındadır:
 *   virgül = binlik ayırıcı, nokta = ondalık ayırıcı.
 *   "$1,234.56" -> 1234.56   "1.234" -> 1.234   "1,234" -> 1234
 *
 * Türk formatı ("1.234,56") burada bilerek desteklenmez; böyle bir değer
 * tutarsız gruplama nedeniyle null döner ve temizleme raporunda görünür.
 */

const EMPTY_TOKENS = new Set([
  '',
  '-',
  '--',
  '—',
  'n/a',
  'na',
  'none',
  'null',
  'nan',
  '#n/a',
  '#value!',
  '#div/0!',
  '#ref!',
])

// Binlik gruplaması doğru olan ya da hiç virgül içermeyen sayı.
const US_NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?$/
const SCIENTIFIC = /^\d+(?:\.\d+)?e[+-]?\d+$/i
const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 }

export function isEmptyCell(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string')
    return EMPTY_TOKENS.has(value.trim().toLowerCase())
  return false
}

/** ABD formatındaki bir hücreyi sayıya çevirir. Çevrilemezse null döner. */
export function parseUSNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return null

  let s = String(value).trim()
  if (EMPTY_TOKENS.has(s.toLowerCase())) return null

  let negative = false
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true
    s = s.slice(1, -1).trim()
  }

  // \s bölünmez boşluğu (NBSP) da kapsar
  s = s.replace(/usd/gi, '').replace(/[$€£\s]/g, '')
  if (s.endsWith('%')) s = s.slice(0, -1)

  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }

  let multiplier = 1
  const last = s.slice(-1).toLowerCase()
  if (last in SUFFIX && s.length > 1) {
    multiplier = SUFFIX[last]
    s = s.slice(0, -1)
  }

  if (!s || s === '.') return null

  let n: number
  if (US_NUMBER.test(s)) {
    n = Number(s.replace(/,/g, ''))
  } else if (SCIENTIFIC.test(s)) {
    n = Number(s)
  } else {
    return null
  }

  if (!Number.isFinite(n)) return null
  n *= multiplier
  return negative ? -n : n
}

/** Tam sayı bekleyen alanlar (adet, yorum sayısı) için. */
export function parseUSInteger(value: unknown): number | null {
  const n = parseUSNumber(value)
  return n === null ? null : Math.round(n)
}

// Yalnızca ABD biçimiyle okunamayan, açıkça Türkçe yazılmış değerler:
// "4,3"  "1.234,56"  "5.473.145"
const TR_DECIMAL = /^\d+,\d+$/
const TR_FULL = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/
// Tam sayı alanında "54.329" ABD'de 54.329 olurdu ama BSR/adet kesirli olamaz -> 54329
const TR_THOUSANDS = /^\d{1,3}(?:\.\d{3})+$/

export type ParsedCell = { value: number | null; fixedTurkish: boolean }

/**
 * Önce ABD biçimi denenir. Dosya Türkçe ayarlı Excel'den geçmişse bazı hücreler
 * "4,3" gibi kalabilir; bunlar başka türlü okunamadığı için düzeltilir ve işaretlenir.
 * Para alanlarında belirsiz değerler ("1.234") her zaman ABD biçiminde okunur.
 */
export function parseCell(value: unknown, integer: boolean): ParsedCell {
  const us = parseUSNumber(value)
  const raw = typeof value === 'string' ? value.trim().replace(/[$\s]/g, '') : ''

  if (us !== null) {
    if (integer && !Number.isInteger(us) && TR_THOUSANDS.test(raw)) {
      return { value: Number(raw.replace(/\./g, '')), fixedTurkish: true }
    }
    return { value: integer ? Math.round(us) : us, fixedTurkish: false }
  }
  if (raw && (TR_DECIMAL.test(raw) || TR_FULL.test(raw))) {
    const n = Number(raw.replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n)) return { value: integer ? Math.round(n) : n, fixedTurkish: true }
  }
  return { value: null, fixedTurkish: false }
}
