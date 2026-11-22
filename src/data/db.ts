import Dexie, { type EntityTable } from 'dexie'
import {
  DEFAULT_SETTINGS,
  type CategoryEntry,
  type Product,
  type Report,
  type Settings,
} from '@/core/types'

/** Xray dosyasından çıkarılan ürün görseli (internetsiz gösterim ve Excel'e gömme için) */
export type ProductImage = { asin: string; data: Blob; type: string; updatedAt: string }

/**
 * Uygulamanın yerel veritabanı (bilgisayarda, internet gerektirmez).
 * Masaüstü uygulamada Tauri'nin uygulama klasöründe saklanır.
 */
export class AppDB extends Dexie {
  reports!: EntityTable<Report, 'id'>
  products!: EntityTable<Product, 'id'>
  categories!: EntityTable<CategoryEntry, 'asin'>
  kv!: EntityTable<{ key: string; value: unknown }, 'key'>
  images!: EntityTable<ProductImage, 'asin'>

  constructor() {
    super('benasse-analiz')
    this.version(1).stores({
      reports: '++id, date, brandKey, importedAt, [date+brandKey]',
      products: '++id, reportId, asin, brandKey, category',
      categories: '&asin, brandKey',
      kv: '&key',
    })
    // v2: aynı dosya uyarısı için dosya özeti, Excel'den çıkarılan görseller
    this.version(2).stores({
      reports: '++id, date, brandKey, importedAt, [date+brandKey], fileHash',
      images: '&asin',
    })
  }
}

export const db = new AppDB()

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings')
  const saved = (row?.value ?? {}) as Partial<Settings>
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    rule: { ...DEFAULT_SETTINGS.rule, ...(saved.rule ?? {}) },
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await db.kv.put({ key: 'settings', value: s })
}
