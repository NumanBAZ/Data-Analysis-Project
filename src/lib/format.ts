// Helium 10 verisi ABD doları olduğu için sayılar ABD biçiminde gösterilir ($1,234.56).
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const dec1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export const fmt = {
  money: (n: number | null | undefined) => (n == null ? '–' : usd0.format(n)),
  money2: (n: number | null | undefined) => (n == null ? '–' : usd2.format(n)),
  moneyCompact: (n: number | null | undefined) => (n == null ? '–' : '$' + compact.format(n)),
  int: (n: number | null | undefined) => (n == null ? '–' : int.format(n)),
  dec: (n: number | null | undefined) => (n == null ? '–' : dec1.format(n)),
  compact: (n: number | null | undefined) => (n == null ? '–' : compact.format(n)),
  pct: (n: number | null | undefined, digits = 1) =>
    n == null || !Number.isFinite(n) ? '–' : `${(n * 100).toFixed(digits)}%`,
  /** Pay yüzdesi: tam sayı; %1'in altı ondalıklı (0.3%), çok küçükse <0.1%; yalnız gerçekten 0 ise 0% */
  share: (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return '–'
    if (n <= 0) return '0%'
    if (n < 0.001) return '<0.1%'
    return n < 0.01 ? `${(n * 100).toFixed(1)}%` : `${(n * 100).toFixed(0)}%`
  },
  /** +12.4% / −3.1% */
  delta: (n: number | null | undefined) =>
    n == null || !Number.isFinite(n) ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`,
}

export function change(curr: number, prev: number | undefined | null): number | null {
  if (prev == null || prev === 0) return null
  return (curr - prev) / prev
}
