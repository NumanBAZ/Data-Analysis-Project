/**
 * Marka adlarını birleştirme.
 * "AKFIX", "akfix", "Akfix " ve "Ak-fix" aynı anahtara ("akfix") iner.
 * Alt marka / satıcı adları ana markaya bağlanır (lotus -> Kraken gibi).
 */

import { fold } from './text'

export type BrandAlias ={ key: string; brand: string }

/** Anahtar: küçük harf, aksansız, yalnızca a-z ve 0-9. */
export function brandKey(name: unknown): string {
  return fold(name).replace(/[^a-z0-9]+/g, '')
}

/** Bilinen markalar ve görünen adları. */
export const KNOWN_BRANDS = [
  'Benasse',
  'Akfix',
  'Beest',
  'Ixir',
  'Kraken',
  'Magic Chems',
  'Selsil',
  'Sprayman',
  'Stanley',
  'Vega Bond',
  "Y'allcandiy",
] as const

/** V4'teki eşlemeler; Ayarlar'dan genişletilebilir. */
export const DEFAULT_ALIASES: BrandAlias[] = [
  { key: 'famemart', brand: 'Ixir' },
  { key: 'ixirpro', brand: 'Ixir' },
  { key: 'demlar', brand: 'Magic Chems' },
  { key: 'demlaronlinestore', brand: 'Magic Chems' },
  // Lotos Global (bizim grup): LotusBond mağazası ve KRAKEN BOND markası Kraken'dir
  { key: 'lotus', brand: 'Kraken' },
  { key: 'lotusbond', brand: 'Kraken' },
  { key: 'krakenbond', brand: 'Kraken' },
  { key: 'deamler', brand: 'Magic Chems' },
  { key: 'stark', brand: 'Vega Bond' },
  { key: 'vega', brand: 'Vega Bond' },
  { key: 'astemrey', brand: "Y'allcandiy" },
  // Petra / Petramax, Beest'in markalarıdır (satıcı: PETRA TOOLS)
  { key: 'petra', brand: 'Beest' },
  { key: 'petramax', brand: 'Beest' },
  { key: 'petratools', brand: 'Beest' },
]

export type BrandResolver = (raw: unknown) => { brand: string; key: string; known: boolean }

export function createBrandResolver(
  aliases: BrandAlias[] = []
): BrandResolver {
  const table = new Map<string, string>()
  for (const b of KNOWN_BRANDS) table.set(brandKey(b), b)
  // Varsayılan eşlemeler her zaman geçerli; Ayarlar'dakiler üstüne eklenir
  for (const a of [...DEFAULT_ALIASES, ...aliases]) {
    const k = brandKey(a.key)
    if (k && a.brand) table.set(k, a.brand)
  }

  return (raw) => {
    const k = brandKey(raw)
    if (!k) return { brand: 'Bilinmiyor', key: '', known: false }
    const known = table.get(k)
    if (known) return { brand: known, key: brandKey(known), known: true }
    return { brand: titleCase(String(raw).trim()), key: k, known: false }
  }
}

/**
 * Firmayı bulur: önce marka adı, tanınmıyorsa satıcı / Buy Box sahibi.
 * Örn. "Luft Werkzeuge" markasını FameMart satıyorsa firma Ixir'dir.
 */
export function resolveCompany(
  resolve: BrandResolver,
  brandRaw: unknown,
  sellers: unknown[]
): { brand: string; key: string; via: 'marka' | 'satıcı' | 'bilinmiyor' } {
  const b = resolve(brandRaw)
  if (b.known) return { brand: b.brand, key: b.key, via: 'marka' }
  for (const s of sellers) {
    const r = resolve(s)
    if (r.known) return { brand: r.brand, key: r.key, via: 'satıcı' }
  }
  return { brand: b.brand, key: b.key, via: 'bilinmiyor' }
}

/** Bizim grup ve alt markaları. Analizlerde "biz" bunlardır, gerisi rakiptir. */
export const OWN_GROUP = 'Lotos Global'
export const OWN_BRANDS = ['Kraken', 'Sprayman', 'Stanley', 'Akfix']

/**
 * Alt markalar: verisi ayrı firma olarak tutulur ve ayrı grafiklerde görünür,
 * ama ekranlarda hangi markaya bağlı olduğu not olarak gösterilir.
 */
export const PARENT_BRANDS: Record<string, string> = { sprayman: 'Kraken' }

/** "AKFIX PRO" -> "Akfix Pro". Kısa kısaltmalar (3M, DAP) korunur. */
function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) =>
      w.length <= 3 && w === w.toUpperCase()
        ? w
        : // Marka adları İngilizce; Türkçe kural "GORILLA"yı "Gorılla" yapardı.
          w.charAt(0).toLocaleUpperCase('en') +
          w.slice(1).toLocaleLowerCase('en')
    )
    .join(' ')
}
