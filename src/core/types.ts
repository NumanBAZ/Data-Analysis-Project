import type { ProductField } from './columns'

export type Marketplace = 'Amazon' | 'Walmart' | 'eBay' | 'Bilinmiyor'

export type Product = {
  id?: number
  reportId: number
  asin: string
  title: string
  brand: string
  brandKey: string
  brandRaw: string
  category: string
  displayOrder: string
  isParent: boolean
  url: string
  imageUrl: string

  price: number | null
  /** Dosyadaki ham satış adedi */
  sales: number | null
  /** Kurallar uygulandıktan sonraki satış adedi (analizde bu kullanılır) */
  salesAdjusted: number | null
  /** Dosyadaki ham ciro */
  revenue: number | null
  /** Analizde kullanılan ciro: düzeltilmiş satış x fiyat */
  revenueCalc: number
  ruleApplied: boolean
  /** Elle düzenlenen alanlar ve eski değerleri */
  edits?: Record<string, { from: unknown; at: string }>

  parentSales: number | null
  parentRevenue: number | null
  recentPurchases: number | null
  parentTrend: number | null
  asinTrend: number | null
  bsr: number | null
  fees: number | null
  fba: string
  fbm: string
  fbaSellers: number | null
  fbmSellers: number | null
  activeSellers: number | null
  weight: number | null
  dimensions: string
  sizeTier: string
  salesRankPct: number | null
  sellerCountry: string
  reviews: number | null
  rating: number | null
  variationCount: number | null
  bsrTopCategory: string
  creationDate: string
  sponsored: string
  bestSeller: string
  sellerAge: number | null
  seller: string
  amazonCategory: string
  buyBox: string
  fulfillment: string
  abaMostClicked: string
  titleCharCount: number | null
  imageCount: number | null
  reviewVelocity: number | null

  /** Tanınmayan sütunlar kaybolmasın diye olduğu gibi saklanır */
  extra: Record<string, string | number>
}

export type ReportTotals = {
  revenue: number
  sales: number
  listings: number
  parents: number
}

export type Report = {
  id?: number
  name: string
  fileName: string
  sheetName: string
  date: string
  brand: string
  brandKey: string
  marketplace: Marketplace
  importedAt: string
  source: 'upload' | 'v4'
  /** Dosya içeriğinin SHA-256 özeti */
  fileHash?: string
  /** Uygulama içinde elle düzenlenen hücre sayısı */
  editCount?: number
  totals: ReportTotals
  /** Hangi Excel sütunu hangi alana eşlendi */
  columnMap: Partial<Record<ProductField, string>>
  unmappedColumns: string[]
  issues: CleanIssue[]
}

export type IssueLevel = 'info' | 'warning' | 'error'

export type CleanIssue = {
  level: IssueLevel
  message: string
  count?: number
}

export type CategoryEntry = {
  asin: string
  category: string
  brandKey: string
  /** Kullanıcı elle tanımladıysa zamanı (Bütün ASIN'ler'de en üste çıkar) */
  definedAt?: string
}

export type Settings = {
  /** Bizim grup (Lotos Global) ve alt markaları; gerisi rakip */
  ownGroup: string
  ownBrands: string[]
  rule: {
    enabled: boolean
    multiplier: number
    /** Kuraldan hariç markalar: kendi markalarımızın satış verisi doğru kabul edilir */
    excludeBrandKeys: string[]
  }
  aliases: { key: string; brand: string }[]
}

export const DEFAULT_SETTINGS: Settings = {
  ownGroup: 'Lotos Global',
  // Sprayman, Kraken'in alt markası; ayrı firma olarak izlenir ama Lotos Global'e dahildir
  ownBrands: ['Kraken', 'Sprayman', 'Stanley', 'Akfix'],
  rule: { enabled: true, multiplier: 1.1, excludeBrandKeys: ['kraken', 'sprayman', 'stanley', 'akfix'] },
  aliases: [],
}
