/**
 * Helium 10 (Xray) export sütunları ve olası farklı adları.
 * Sütunlar sırasına göre değil, adına göre tanınır; Helium 10 sütun
 * eklese ya da yer değiştirse bile eşleşme bozulmaz.
 */

import { fold } from './text'

export type FieldType = 'text' | 'money' | 'number' | 'integer' | 'percent'

export type FieldDef = {
  key: ProductField
  label: string
  type: FieldType
  aliases: string[]
}

export type ProductField =
  | 'displayOrder'
  | 'category'
  | 'title'
  | 'asin'
  | 'url'
  | 'imageUrl'
  | 'brandRaw'
  | 'price'
  | 'parentSales'
  | 'sales'
  | 'recentPurchases'
  | 'parentRevenue'
  | 'revenue'
  | 'parentTrend'
  | 'asinTrend'
  | 'bsr'
  | 'fees'
  | 'fba'
  | 'fbm'
  | 'fbaSellers'
  | 'fbmSellers'
  | 'weight'
  | 'salesRankPct'
  | 'sellerCountry'
  | 'reviews'
  | 'rating'
  | 'variationCount'
  | 'bsrTopCategory'
  | 'creationDate'
  | 'sponsored'
  | 'bestSeller'
  | 'sellerAge'
  | 'seller'
  | 'activeSellers'
  | 'dimensions'
  | 'sizeTier'
  | 'amazonCategory'
  | 'titleCharCount'
  | 'imageCount'
  | 'reviewVelocity'
  | 'buyBox'
  | 'fulfillment'
  | 'abaMostClicked'

export const FIELDS: FieldDef[] = [
  { key: 'displayOrder', label: 'Sıra', type: 'text', aliases: ['Display Order', '#', 'No'] },
  { key: 'category', label: 'Kategori', type: 'text', aliases: ['Categori', 'Kategori', 'Urun Kategorisi', 'Product Category'] },
  { key: 'title', label: 'Ürün adı', type: 'text', aliases: ['Product Details', 'Title', 'Product Name', 'Product Title', 'Urun Adi'] },
  { key: 'asin', label: 'ASIN', type: 'text', aliases: ['ASIN', 'Item ID', 'Child ASIN', 'Product ID'] },
  { key: 'url', label: 'Bağlantı', type: 'text', aliases: ['URL', 'Product URL', 'Link'] },
  { key: 'imageUrl', label: 'Görsel', type: 'text', aliases: ['Image URL', 'Image Link', 'Image', 'Resim URL'] },
  { key: 'brandRaw', label: 'Marka', type: 'text', aliases: ['Brand', 'Marka', 'Manufacturer'] },
  { key: 'price', label: 'Fiyat', type: 'money', aliases: ['Price', 'Price $', 'Price US$', 'Fiyat', 'Current Price'] },
  { key: 'parentSales', label: 'Parent satış', type: 'integer', aliases: ['Parent Level Sales', 'Parent Sales'] },
  { key: 'sales', label: 'Satış adedi', type: 'integer', aliases: ['ASIN Sales', 'Sales', 'Monthly Sales', 'Units Sold', 'Ordered Units', 'Units Ordered', 'Satis Adedi'] },
  { key: 'recentPurchases', label: 'Son alımlar', type: 'integer', aliases: ['Recent Purchases', 'Bought in Past Month'] },
  { key: 'parentRevenue', label: 'Parent ciro', type: 'money', aliases: ['Parent Level Revenue', 'Parent Revenue'] },
  { key: 'revenue', label: 'Ciro', type: 'money', aliases: ['ASIN Revenue', 'Revenue', 'Monthly Revenue', 'Ordered Product Sales', 'Ciro'] },
  { key: 'parentTrend', label: 'Parent trend', type: 'percent', aliases: ['Parent Level Trend', 'Parent Trend'] },
  { key: 'asinTrend', label: 'ASIN trend', type: 'percent', aliases: ['ASIN Trend', 'Sales Trend', 'Sales Trend (90 days)'] },
  { key: 'bsr', label: 'BSR', type: 'integer', aliases: ['BSR', 'Best Sellers Rank', 'Sales Rank'] },
  { key: 'fees', label: 'Amazon kesintisi', type: 'money', aliases: ['Fees', 'Fees $', 'Fees US$', 'Fee', 'FBA Fees'] },
  { key: 'fba', label: 'FBA', type: 'text', aliases: ['FBA'] },
  { key: 'fbm', label: 'FBM', type: 'text', aliases: ['FBM'] },
  { key: 'fbaSellers', label: 'FBA satıcı', type: 'integer', aliases: ['FBA Sellers'] },
  { key: 'fbmSellers', label: 'FBM satıcı', type: 'integer', aliases: ['FBM Sellers'] },
  { key: 'activeSellers', label: 'Aktif satıcı', type: 'integer', aliases: ['Active Sellers', 'Sellers', 'Number of Sellers'] },
  { key: 'weight', label: 'Ağırlık (lb)', type: 'number', aliases: ['Weight (lb)', 'Weight', 'Weight lb'] },
  { key: 'dimensions', label: 'Boyutlar', type: 'text', aliases: ['Dimensions', 'Dimensions (in)', 'Dimensions (L x W x H)'] },
  { key: 'sizeTier', label: 'Boyut sınıfı', type: 'text', aliases: ['Size Tier'] },
  { key: 'salesRankPct', label: 'Sıralama %', type: 'percent', aliases: ['Sales Rank %', 'Sales Rank Percent'] },
  { key: 'sellerCountry', label: 'Satıcı ülkesi', type: 'text', aliases: ['Seller Country/Region', 'Seller Country'] },
  { key: 'reviews', label: 'Yorum', type: 'integer', aliases: ['Reviews', 'Review Count', 'Ratings Count'] },
  { key: 'rating', label: 'Puan', type: 'number', aliases: ['Rating', 'Ratings', 'Star Rating'] },
  { key: 'variationCount', label: 'Varyasyon', type: 'integer', aliases: ['Variation Count', 'Variations'] },
  { key: 'bsrTopCategory', label: 'BSR kategorisi', type: 'text', aliases: ['BSR Top Category', 'Top Category'] },
  { key: 'creationDate', label: 'Oluşturulma', type: 'text', aliases: ['Creation Date', 'Date First Available'] },
  { key: 'sponsored', label: 'Sponsorlu', type: 'text', aliases: ['Sponsored'] },
  { key: 'bestSeller', label: 'Çok satan', type: 'text', aliases: ['Best Seller'] },
  { key: 'sellerAge', label: 'Satıcı yaşı (ay)', type: 'integer', aliases: ['Seller Age (mo)', 'Seller Age'] },
  { key: 'amazonCategory', label: 'Amazon kategorisi', type: 'text', aliases: ['Category', 'Amazon Category'] },
  { key: 'titleCharCount', label: 'Başlık uzunluğu', type: 'integer', aliases: ['Title Char. Count', 'Title Character Count'] },
  { key: 'imageCount', label: 'Görsel sayısı', type: 'integer', aliases: ['Images', 'Image Count'] },
  { key: 'reviewVelocity', label: 'Yorum hızı', type: 'integer', aliases: ['Review velocity', 'Review Velocity'] },
  { key: 'buyBox', label: 'Buy Box sahibi', type: 'text', aliases: ['Buy Box', 'Buy Box Owner'] },
  { key: 'fulfillment', label: 'Gönderim', type: 'text', aliases: ['Fulfillment', 'Fulfilment'] },
  { key: 'abaMostClicked', label: 'ABA en çok tıklanan', type: 'text', aliases: ['ABA Most Clicked'] },
  { key: 'seller', label: 'Satıcı', type: 'text', aliases: ['Seller', 'Buy Box Seller'] },
]

/** "Price  $" -> "price", "Seller Age (mo)" -> "sellerage", "Ürün Adı" -> "urunadi" */
export function normalizeHeader(value: unknown): string {
  return fold(value)
    .replace(/\((?:mo|lb|in|\$)\)/g, '')
    // "Price  US$" -> "price": sondaki para birimi eki atılır
    .replace(/\s+(?:us\$|usd)\s*$/, '')
    .replace(/[^a-z0-9#%]+/g, '')
}

const ALIAS_INDEX: Map<string, ProductField> = (() => {
  const m = new Map<string, ProductField>()
  for (const f of FIELDS)
    for (const a of f.aliases) {
      const k = normalizeHeader(a)
      if (k && !m.has(k)) m.set(k, f.key)
    }
  return m
})()

export function matchField(header: unknown): ProductField | null {
  const k = normalizeHeader(header)
  if (!k) return null
  return ALIAS_INDEX.get(k) ?? null
}

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]))
