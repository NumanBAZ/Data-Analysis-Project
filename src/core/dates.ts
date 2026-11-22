import { fold } from './text'

/**
 * Dosya ve sekme adlarından rapor tarihini çıkarır.
 * "5 OCAK26.xlsx", "16 ocak.XLSX", "12oct23", "5 Ocak 2026", "2026-01-05", "05.01.2026"
 */

const MONTHS: Record<string, number> = {
  oca: 1, jan: 1,
  sub: 2, feb: 2,
  mar: 3,
  nis: 4, apr: 4,
  may: 5,
  haz: 6, jun: 6,
  tem: 7, jul: 7,
  agu: 8, aug: 8,
  eyl: 9, sep: 9,
  eki: 10, oct: 10,
  kas: 11, nov: 11,
  ara: 12, dec: 12,
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function fullYear(y: string | undefined, fallback: number): number {
  if (!y) return fallback
  const n = Number(y)
  return y.length <= 2 ? 2000 + n : n
}

export type DateGuess = { date: string; yearGuessed: boolean }

export function guessDate(
  text: string,
  fallbackYear = new Date().getFullYear()
): DateGuess | null {
  const s = fold(text).replace(/\.(xlsx|xls|csv)$/i, '')

  let m = s.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/)
  if (m) {
    const d = iso(+m[1], +m[2], +m[3])
    if (d) return { date: d, yearGuessed: false }
  }

  m = s.match(/(\d{1,2})[-_./](\d{1,2})[-_./](20\d{2}|\d{2})\b/)
  if (m) {
    const d = iso(fullYear(m[3], fallbackYear), +m[2], +m[1])
    if (d) return { date: d, yearGuessed: false }
  }

  // "Top 100 urun 5 ocak" gibi adlarda ilk eşleşme ay değildir; ay olan ilk eşleşmeye kadar bakılır
  for (const x of s.matchAll(/(?<!\d)(\d{1,2})\s*([a-z]{3,})\.?\s*(\d{4}|\d{2})?/g)) {
    const month = MONTHS[x[2].slice(0, 3)]
    if (!month) continue
    const d = iso(fullYear(x[3], fallbackYear), month, +x[1])
    if (d) return { date: d, yearGuessed: !x[3] }
  }
  return null
}

export function todayISO(): string {
  const d = new Date()
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate())!
}

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

/** "2026-01-16" -> "16 Oca" (grafik eksenleri için) */
export function shortDateTR(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number)
  if (!m || !d) return isoDate
  return `${d} ${TR_MONTHS[m - 1].slice(0, 3)}`
}

/** "2026-01-05" -> "5 Ocak 2026" */
export function formatDateTR(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return `${d} ${TR_MONTHS[m - 1]} ${y}`
}
