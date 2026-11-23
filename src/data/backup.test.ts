// @vitest-environment node
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createBackupFiles, readBackupFolder, restoreBackup } from './backup'
import { db } from './db'

describe('klasör yedeği', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await db.reports.bulkAdd([
      { id: 1, name: 'R1', brand: 'Benasse', date: '2026-11-01', brandKey: 'benasse' },
      { id: 2, name: 'R2', brand: 'Kraken/Sprayman', date: '2026-11-02', brandKey: 'kraken' },
    ] as never[])
    const many = Array.from({ length: 2500 }, (_, i) => ({ reportId: 2, asin: `B${i}`, title: 't' }))
    await db.products.bulkAdd([{ reportId: 1, asin: 'A1', title: 'x' }, ...many] as never[])
    await db.categories.bulkAdd(Array.from({ length: 1500 }, (_, i) => ({ asin: `B${i}`, category: 'Foam', brandKey: 'kraken' })))
    await db.kv.bulkAdd([{ key: 'settings', value: { ownGroup: 'Lotos Global' } }, { key: 'category-tree', value: { Foam: { parent: null } } }])
    await db.images.add({ asin: 'A1', type: 'image/png', updatedAt: 'x', data: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) })
  })

  it('ayrı dosyalara böler ve aynen geri yükler', async () => {
    const { files } = await createBackupFiles()
    const paths = files.map((f) => f.path)
    expect(paths).toContain('asin-kategorileri/01.jsonl')
    expect(paths).toContain('asin-kategorileri/02.jsonl')
    expect(paths).toContain('raporlar/urunler/001 Benasse 2026-11-01.jsonl')
    expect(paths).toContain('raporlar/urunler/002 Kraken-Sprayman 2026-11-02-3.jsonl')
    expect(paths).toContain('gorseller/A1.png')
    expect(paths).toContain('yedek.json')
    // Hiçbir .jsonl 1000 satırı geçmez
    for (const f of files.filter((f) => f.path.endsWith('.jsonl'))) {
      expect(new TextDecoder().decode(f.data).trim().split('\n').length).toBeLessThanOrEqual(1000)
    }

    const map = new Map(files.map((f) => [f.path, f.data]))
    await Promise.all(db.tables.map((t) => t.clear()))
    await restoreBackup(readBackupFolder(map))
    expect(await db.reports.count()).toBe(2)
    expect(await db.products.count()).toBe(2501)
    expect(await db.categories.count()).toBe(1500)
    expect((await db.kv.get('category-tree'))?.value).toEqual({ Foam: { parent: null } })
    expect((await db.kv.get('settings'))?.value).toEqual({ ownGroup: 'Lotos Global' })
    const img = await db.images.get('A1')
    expect([...new Uint8Array(await img!.data.arrayBuffer())]).toEqual([1, 2, 3])
  })

  it('eksik dosya varsa uyarır', async () => {
    const { files } = await createBackupFiles()
    const map = new Map(files.filter((f) => !f.path.startsWith('raporlar/urunler/001')).map((f) => [f.path, f.data]))
    expect(() => readBackupFolder(map)).toThrow(/eksik/)
  })
})
