// @vitest-environment node
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addCategoryToList, deleteCategory, getCategoryList, getCategoryTree, renameCategory, seedCategoriesIfNeeded, setCategoryParent,
} from './repo'
import { byCategory, categoryOptions } from '@/core/filter'
import { flattenTree, pathOf } from '@/core/tree'
import type { Product } from '@/core/types'

const product = (asin: string, category: string, revenueCalc = 10) =>
  ({ reportId: 1, asin, title: asin, brand: 'Benasse', brandKey: 'benasse', category, revenueCalc, salesAdjusted: 1, isParent: false }) as unknown as Product

describe('kategori ağacı', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await db.categories.bulkPut([
      { asin: 'A1', category: 'Foam', brandKey: 'benasse' },
      { asin: 'A2', category: 'Glue', brandKey: 'benasse' },
    ])
    await db.products.bulkAdd([product('A1', 'Foam'), product('A2', 'Glue')] as never)
    await db.kv.put({ key: 'category-list', value: ['Foam', 'Glue'] })
  })

  it('alt kategori ekler, ağaç sırası ve yol doğru', async () => {
    await addCategoryToList('Gun Foam', 'Foam')
    await addCategoryToList('Straw Foam', 'Foam')
    await addCategoryToList('750 ml', 'Gun Foam')
    const tree = await getCategoryTree()
    const rows = flattenTree(tree, await getCategoryList())
    expect(rows.map((r) => `${r.depth}:${r.name}`)).toEqual(['0:Foam', '1:Gun Foam', '2:750 ml', '1:Straw Foam', '0:Glue'])
    expect(pathOf(tree, '750 ml')).toBe('Foam › Gun Foam › 750 ml')
  })

  it('aynı ad ve olmayan üst kategori reddedilir', async () => {
    await expect(addCategoryToList('foam', 'Glue')).rejects.toThrow(/zaten/)
    await expect(addCategoryToList('X', 'Yok')).rejects.toThrow(/bulunamadı/)
  })

  it('kendi altına taşınamaz, ana kategoriye alınabilir', async () => {
    await addCategoryToList('Gun Foam', 'Foam')
    await expect(setCategoryParent('Foam', 'Gun Foam')).rejects.toThrow()
    await setCategoryParent('Gun Foam', '')
    expect((await getCategoryTree())['Gun Foam'].parent).toBe('')
  })

  it('üst kategori filtresi alt kategorileri de kapsar', async () => {
    await addCategoryToList('Gun Foam', 'Foam')
    await addCategoryToList('750 ml', 'Gun Foam')
    const tree = await getCategoryTree()
    // Ara seviye (Gun Foam) üründe yok; zincir yine de kopmamalı
    const products = [product('A1', 'Foam', 5), product('B1', '750 ml', 7), product('A2', 'Glue', 100)]
    expect(byCategory(products, 'Foam', tree).map((p) => p.asin)).toEqual(['A1', 'B1'])
    expect(byCategory(products, '750 ml', tree).map((p) => p.asin)).toEqual(['B1'])
    expect(byCategory(products, 'Foam').map((p) => p.asin)).toEqual(['A1'])
    const opts = categoryOptions(products, tree)
    expect(opts.map((o) => [o.category, o.depth, o.revenue, o.isGroup])).toEqual([
      ['Foam', 0, 12, true], ['Gun Foam', 1, 7, true], ['750 ml', 2, 7, false], ['Glue', 0, 100, false],
    ])
  })

  it('ad değişince ağaç da değişir', async () => {
    await addCategoryToList('Gun Foam', 'Foam')
    await renameCategory('Foam', 'Köpük')
    expect((await getCategoryTree())['Gun Foam'].parent).toBe('Köpük')
    await renameCategory('Gun Foam', 'Tabancalı')
    const tree = await getCategoryTree()
    expect(tree['Tabancalı'].parent).toBe('Köpük')
    expect(tree['Gun Foam']).toBeUndefined()
  })

  it('üst kategori alt kategorisiyle birleşirse döngü oluşmaz', async () => {
    await addCategoryToList('Gun Foam', 'Foam')
    await renameCategory('Foam', 'Gun Foam')
    const tree = await getCategoryTree()
    expect(tree['Gun Foam'].parent).toBe('')
    expect(flattenTree(tree, await getCategoryList()).map((r) => r.name)).toEqual(['Glue', 'Gun Foam'])
  })

  it('yalnızca boş kategori silinir', async () => {
    await addCategoryToList('Gun Foam', 'Foam')
    await expect(deleteCategory('Foam')).rejects.toThrow(/kullanılıyor/)
    await addCategoryToList('Boş')
    await addCategoryToList('Boş Alt', 'Boş')
    await expect(deleteCategory('Boş')).rejects.toThrow(/alt kategori/)
    await deleteCategory('Boş Alt')
    await deleteCategory('Boş')
    expect(await getCategoryList()).toEqual(['Foam', 'Glue', 'Gun Foam'])
    expect((await getCategoryTree())['Boş Alt']).toBeUndefined()
  })

  it('kütüphanedeki eski ad eşlemesi kullanıcının kendi atamalarına da uygulanır', async () => {
    // Kullanıcı kütüphanede olmayan bir ASIN'i eski adla tanımlamış
    await db.categories.put({ asin: 'U1', category: 'Glue', brandKey: 'x', definedAt: '2026-11-20T00:00:00.000Z' })
    await db.products.add(product('U1', 'Glue') as never)
    globalThis.fetch = (async () => new Response(JSON.stringify({
      entries: [{ asin: 'A1', category: 'Gap Filler', brandKey: 'benasse', definedAt: '2026-11-23T10:00:00.000Z' }],
      categoryTree: { 'Köpük': { parent: '', at: '2026-11-23T10:00:00.000Z' }, 'Gap Filler': { parent: 'Köpük', at: '2026-11-23T10:00:00.000Z' } },
      categoryRenames: { Foam: 'Köpük', Glue: 'Yapıştırıcı', Yok: 'Köpük' },
    }))) as typeof fetch
    await seedCategoriesIfNeeded()
    expect((await db.categories.get('U1'))!.category).toBe('Yapıştırıcı')
    expect((await db.products.where('asin').equals('U1').first())!.category).toBe('Yapıştırıcı')
    expect((await db.categories.get('A1'))!.category).toBe('Gap Filler')
    const list = await getCategoryList()
    expect(list).not.toContain('Foam')
    expect(list).not.toContain('Glue')
    expect(pathOf(await getCategoryTree(), 'Gap Filler')).toBe('Köpük › Gap Filler')
  })

  it('kurulum kütüphanesi dosyası tutarlı: her atama ağaçta, her alt kategorinin üstü var', async () => {
    const { readFileSync } = await import('node:fs')
    const f = JSON.parse(readFileSync(new URL('../../public/seed/categories.json', import.meta.url), 'utf8')) as {
      entries: { asin: string; category: string }[]
      categoryTree: Record<string, { parent: string }>
      categoryRenames: Record<string, string>
    }
    const names = new Set(Object.keys(f.categoryTree))
    expect(f.entries.filter((e) => !names.has(e.category))).toEqual([])
    expect(Object.values(f.categoryTree).filter((n) => n.parent && !names.has(n.parent))).toEqual([])
    expect(Object.values(f.categoryRenames).filter((n) => !names.has(n))).toEqual([])
    expect(new Set(f.entries.map((e) => e.asin)).size).toBe(f.entries.length)
  })

  it('kurulum kütüphanesindeki ağaç uygulanır, daha yeni elle değişiklik ezilmez', async () => {
    await addCategoryToList('Gun Foam', 'Foam')
    await setCategoryParent('Gun Foam', '')
    globalThis.fetch = (async () => new Response(JSON.stringify({
      entries: [{ asin: 'B1', category: 'Straw Foam', brandKey: 'x', definedAt: '2026-11-23T10:00:00.000Z' }],
      categoryTree: {
        'Straw Foam': { parent: 'Foam', at: '2026-11-23T10:00:00.000Z' },
        'Gun Foam': { parent: 'Foam', at: '2020-01-01T00:00:00.000Z' },
      },
    }))) as typeof fetch
    await seedCategoriesIfNeeded()
    const tree = await getCategoryTree()
    expect(tree['Straw Foam'].parent).toBe('Foam')
    expect(tree['Gun Foam'].parent).toBe('')
    expect(await getCategoryList()).toContain('Straw Foam')
    expect((await db.categories.get('B1'))!.category).toBe('Straw Foam')
  })
})
