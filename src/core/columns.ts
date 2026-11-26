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
  | 'stock'
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
  { key: 'displayOrder', label: 'Display Order', type: 'text', aliases: ['Display Order', '#', 'No'] },
  { key: 'category', label: 'Category', type: 'text', aliases: ['Categori', 'Kategori', 'Urun Kategorisi', 'Product Category'] },
  { key: 'title', label: 'Product Details', type: 'text', aliases: ['Product Details', 'Title', 'Product Name', 'Product Title', 'Urun Adi'] },
  { key: 'asin', label: 'ASIN', type: 'text', aliases: ['ASIN', 'Item ID', 'Child ASIN', 'Product ID'] },
  { key: 'url', label: 'URL', type: 'text', aliases: ['URL', 'Product URL', 'Link'] },
  { key: 'imageUrl', label: 'Image URL', type: 'text', aliases: ['Image URL', 'Image Link', 'Image', 'Resim URL'] },
  { key: 'brandRaw', label: 'Brand', type: 'text', aliases: ['Brand', 'Marka', 'Manufacturer'] },
  { key: 'price', label: 'Price', type: 'money', aliases: ['Price', 'Price $', 'Price US$', 'Fiyat', 'Current Price'] },
  { key: 'parentSales', label: 'Parent Level Sales', type: 'integer', aliases: ['Parent Level Sales', 'Parent Sales'] },
  { key: 'sales', label: 'ASIN Sales', type: 'integer', aliases: ['ASIN Sales', 'Sales', 'Monthly Sales', 'Units Sold', 'Ordered Units', 'Units Ordered', 'Satis Adedi'] },
  { key: 'recentPurchases', label: 'Recent Purchases', type: 'integer', aliases: ['Recent Purchases', 'Bought in Past Month'] },
  { key: 'parentRevenue', label: 'Parent Level Revenue', type: 'money', aliases: ['Parent Level Revenue', 'Parent Revenue'] },
  { key: 'revenue', label: 'ASIN Revenue', type: 'money', aliases: ['ASIN Revenue', 'Revenue', 'Monthly Revenue', 'Ordered Product Sales', 'Ciro'] },
  { key: 'parentTrend', label: 'Parent Level Trend', type: 'percent', aliases: ['Parent Level Trend', 'Parent Trend'] },
  { key: 'asinTrend', label: 'ASIN Trend', type: 'percent', aliases: ['ASIN Trend', 'Sales Trend', 'Sales Trend (90 days)'] },
  { key: 'bsr', label: 'BSR', type: 'integer', aliases: ['BSR', 'Best Sellers Rank', 'Sales Rank'] },
  { key: 'stock', label: 'Stock', type: 'integer', aliases: ['Stock', 'Inventory', 'Stock Level', 'Available Stock', 'Units Available', 'Stok', 'Stok Adedi'] },
  { key: 'fees', label: 'Fees', type: 'money', aliases: ['Fees', 'Fees $', 'Fees US$', 'Fee', 'FBA Fees'] },
  { key: 'fba', label: 'FBA', type: 'text', aliases: ['FBA'] },
  { key: 'fbm', label: 'FBM', type: 'text', aliases: ['FBM'] },
  { key: 'fbaSellers', label: 'FBA Sellers', type: 'integer', aliases: ['FBA Sellers'] },
  { key: 'fbmSellers', label: 'FBM Sellers', type: 'integer', aliases: ['FBM Sellers'] },
  { key: 'activeSellers', label: 'Active Sellers', type: 'integer', aliases: ['Active Sellers', 'Sellers', 'Number of Sellers'] },
  { key: 'weight', label: 'Weight (lb)', type: 'number', aliases: ['Weight (lb)', 'Weight', 'Weight lb'] },
  { key: 'dimensions', label: 'Dimensions', type: 'text', aliases: ['Dimensions', 'Dimensions (in)', 'Dimensions (L x W x H)'] },
  { key: 'sizeTier', label: 'Size Tier', type: 'text', aliases: ['Size Tier'] },
  { key: 'salesRankPct', label: 'Sales Rank %', type: 'percent', aliases: ['Sales Rank %', 'Sales Rank Percent'] },
  { key: 'sellerCountry', label: 'Seller Country/Region', type: 'text', aliases: ['Seller Country/Region', 'Seller Country'] },
  { key: 'reviews', label: 'Reviews', type: 'integer', aliases: ['Reviews', 'Review Count', 'Ratings Count'] },
  { key: 'rating', label: 'Rating', type: 'number', aliases: ['Rating', 'Ratings', 'Star Rating'] },
  { key: 'variationCount', label: 'Variation Count', type: 'integer', aliases: ['Variation Count', 'Variations'] },
  { key: 'bsrTopCategory', label: 'BSR Top Category', type: 'text', aliases: ['BSR Top Category', 'Top Category'] },
  { key: 'creationDate', label: 'Creation Date', type: 'text', aliases: ['Creation Date', 'Date First Available'] },
  { key: 'sponsored', label: 'Sponsored', type: 'text', aliases: ['Sponsored'] },
  { key: 'bestSeller', label: 'Best Seller', type: 'text', aliases: ['Best Seller'] },
  { key: 'sellerAge', label: 'Seller Age (mo)', type: 'integer', aliases: ['Seller Age (mo)', 'Seller Age'] },
  { key: 'amazonCategory', label: 'Amazon Category', type: 'text', aliases: ['Category', 'Amazon Category'] },
  { key: 'titleCharCount', label: 'Title Char. Count', type: 'integer', aliases: ['Title Char. Count', 'Title Character Count'] },
  { key: 'imageCount', label: 'Images', type: 'integer', aliases: ['Images', 'Image Count'] },
  { key: 'reviewVelocity', label: 'Review Velocity', type: 'integer', aliases: ['Review velocity', 'Review Velocity'] },
  { key: 'buyBox', label: 'Buy Box', type: 'text', aliases: ['Buy Box', 'Buy Box Owner'] },
  { key: 'fulfillment', label: 'Fulfillment', type: 'text', aliases: ['Fulfillment', 'Fulfilment'] },
  { key: 'abaMostClicked', label: 'ABA Most Clicked', type: 'text', aliases: ['ABA Most Clicked'] },
  { key: 'seller', label: 'Seller', type: 'text', aliases: ['Seller', 'Buy Box Seller'] },
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
