// @vitest-environment node
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { getCategoryList, renameCategory, renamed, saveSheet, seedCategoriesIfNeeded } from './repo'
import { DEFAULT_SETTINGS } from '@/core/types'
import type { ParsedSheet } from '@/core/clean'

const product = (asin: string, category: string, reportId = 1) => ({
  reportId, asin, title: asin, brand: 'Benasse', brandKey: 'benasse', category, imageUrl: '',
  price: 10, salesRaw: 1, salesAdjusted: 1, revenue: 10, revenueCalc: 10, bsr: null, reviews: null, rating: null, seller: '',
})

describe('kategori adını değiştirme', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await db.categories.bulkPut([
      { asin: 'A1', category: 'Foam', brandKey: 'benasse' },
      { asin: 'A2', category: 'Foam Set', brandKey: 'benasse' },
    ])
    await db.products.bulkAdd([product('A1', 'Foam', 101), product('A1', 'Foam', 102), product('A2', 'Foam Set', 101)] as never)
    await db.kv.put({ key: 'category-list', value: ['Foam', 'Foam Set'] })
  })

  it('her yerde değişir, Foam Set etkilenmez', async () => {
    const r = await renameCategory('Foam', 'Köpük')
    expect(r).toEqual({ asins: 1, products: 2 })
    expect((await db.categories.get('A1'))!.category).toBe('Köpük')
    expect((await db.categories.get('A2'))!.category).toBe('Foam Set')
    expect((await db.products.where('asin').equals('A1').toArray()).map((p) => p.category)).toEqual(['Köpük', 'Köpük'])
    expect((await db.products.where('asin').equals('A2').first())!.category).toBe('Foam Set')
    expect(await getCategoryList()).toEqual(['Foam Set', 'Köpük'])
  })

  it('yeni raporda eski ad gelse de yeni ad kullanılır', async () => {
    await renameCategory('Foam', 'Köpük')
    const sheet = {
      fileName: 'yeni.xlsx', sheetName: 'Sheet1', marketplace: 'US', columnMap: {}, unmappedColumns: [], issues: [],
      products: [{ ...product('A9', 'Foam'), reportId: undefined }, { ...product('A8', 'Foam Set'), reportId: undefined }],
    } as unknown as ParsedSheet
    const id = await saveSheet(sheet, { brand: 'Benasse', date: '2026-12-01', settings: DEFAULT_SETTINGS })
    const cats = (await db.products.where('reportId').equals(id).toArray()).map((p) => p.category).sort()
    expect(cats).toEqual(['Foam Set', 'Köpük'])
    expect((await db.categories.get('A9'))!.category).toBe('Köpük')
  })

  it('kurulum kütüphanesindeki eski ad da çevrilir', async () => {
    await renameCategory('Foam', 'Köpük')
    globalThis.fetch = (async () => new Response(JSON.stringify({ entries: [{ asin: 'B1', category: 'Foam', brandKey: 'x' }], categoryList: ['Foam'] }))) as typeof fetch
    await seedCategoriesIfNeeded()
    expect((await db.categories.get('B1'))!.category).toBe('Köpük')
    expect(await getCategoryList()).not.toContain('Foam')
  })

  it('zincir ve geri dönüş', async () => {
    await renameCategory('Foam', 'Köpük')
    await renameCategory('Köpük', 'Sünger')
    expect(renamed((await db.kv.get('category-renames'))!.value as Record<string, string>, 'Foam')).toBe('Sünger')
    await renameCategory('Sünger', 'Foam')
    const map = (await db.kv.get('category-renames'))!.value as Record<string, string>
    expect(renamed(map, 'Foam')).toBe('Foam')
    expect(renamed(map, 'Köpük')).toBe('Foam')
    expect((await db.categories.get('A1'))!.category).toBe('Foam')
  })
})
