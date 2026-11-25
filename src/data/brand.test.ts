// @vitest-environment node
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { applyBrandOverrides, getBrandOverrides, restoreAsinBrand, setAsinBrand } from './repo'
import type { Product } from '@/core/types'

const product = (asin: string, reportId: number) =>
  ({ reportId, asin, title: asin, brand: 'Benasse', brandKey: 'benasse', category: 'Foam', revenueCalc: 10 }) as unknown as Product

describe('ASIN marka ataması', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await db.products.bulkAdd([product('A1', 1), product('A1', 2), product('B2', 1)])
  })

  it('bütün raporlarda değiştirir, ASIN e kaydeder ve geri alınabilir', async () => {
    const before = await setAsinBrand('A1', 'Kraken')
    const a1 = await db.products.where('asin').equals('A1').toArray()
    expect(a1.map((p) => [p.brand, p.brandKey])).toEqual([['Kraken', 'kraken'], ['Kraken', 'kraken']])
    expect(a1[0].edits?.brand?.from).toBe('Benasse')
    expect((await db.products.where('asin').equals('B2').first())?.brand).toBe('Benasse')
    expect((await getBrandOverrides()).A1.brand).toBe('Kraken')

    await restoreAsinBrand(before)
    const back = await db.products.where('asin').equals('A1').toArray()
    expect(back.map((p) => p.brand)).toEqual(['Benasse', 'Benasse'])
    expect(back[0].edits).toBeUndefined()
    expect((await getBrandOverrides()).A1).toBeUndefined()
  })

  it('yeni yüklemede elle verilen marka kullanılır', async () => {
    await setAsinBrand('A1', 'Kraken')
    const out = applyBrandOverrides([product('A1', 0), product('B2', 0)], await getBrandOverrides())
    expect(out.map((p) => p.brandKey)).toEqual(['kraken', 'benasse'])
  })
})
