import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { brandKey, createBrandResolver } from './brands'
import { applyRules, cleanSheet, computeTotals } from './clean'
import { matchField } from './columns'
import { guessDate } from './dates'
import { parseCell, parseUSNumber } from './number'
import { DEFAULT_SETTINGS, type Product, type Report } from './types'
import { parseWorkbook } from './workbook'

describe('ABD sayı formatı', () => {
  it.each([
    ['$1,234.56', 1234.56],
    ['1,234', 1234],
    ['1.234', 1.234],
    ['12,345,678.9', 12345678.9],
    ['$0.99', 0.99],
    ['(1,200.50)', -1200.5],
    ['-$45.10', -45.1],
    ['12.5%', 12.5],
    ['1.2K', 1200],
    [' 3,500 ', 3500],
    [42, 42],
  ])('%s -> %s', (input, expected) => {
    expect(parseUSNumber(input)).toBeCloseTo(expected as number, 6)
  })

  it.each(['N/A', '-', '', null, 'abc', '1.234,56', '12,5', '1,23,456'])(
    '%s çevrilemez (null)',
    (input) => {
      expect(parseUSNumber(input)).toBeNull()
    }
  )
})

describe('marka birleştirme', () => {
  const resolve = createBrandResolver()
  it('büyük/küçük harf ve boşluk farkı aynı markaya iner', () => {
    for (const s of ['AKFIX', 'akfix', ' Akfix ', 'Ak-Fix'])
      expect(resolve(s).brand).toBe('Akfix')
  })
  it('Türkçe I/İ doğru sadeleşir', () => {
    expect(brandKey('IXIR')).toBe('ixir')
    expect(resolve('İXİR').brand).toBe('Ixir')
  })
  it("kesme işaretli ve boşluklu markalar (V4'te çalışmıyordu)", () => {
    expect(resolve("Y'ALLCANDIY").brand).toBe("Y'allcandiy")
    expect(resolve('yallcandiy').brand).toBe("Y'allcandiy")
    expect(resolve('MAGIC CHEMS').brand).toBe('Magic Chems')
    expect(resolve('magicchems').brand).toBe('Magic Chems')
  })
  it('alt markalar ana markaya bağlanır', () => {
    expect(resolve('LOTUS').brand).toBe('Kraken')
    expect(resolve('Famemart').brand).toBe('Ixir')
  })
  it('bilinmeyen markalar düzgün yazılır', () => {
    expect(resolve('GORILLA GLUE').brand).toBe('Gorilla Glue')
  })
})

describe('sütun tanıma', () => {
  it.each([
    ['Price  $', 'price'],
    ['ASIN Sales', 'sales'],
    ['Parent Level Sales', 'parentSales'],
    ['Weight (lb)', 'weight'],
    ['Seller Age (mo)', 'sellerAge'],
    ['Sales Rank %', 'salesRankPct'],
    ['BSR', 'bsr'],
    ['Categori', 'category'],
    ['Product Details', 'title'],
  ])('%s -> %s', (h, f) => expect(matchField(h)).toBe(f))
})

describe('tarih tanıma', () => {
  it.each([
    ['5 OCAK26.xlsx', '2026-01-05'],
    ['16jan26', '2026-01-16'],
    ['12oct23', '2023-10-12'],
    ['5 Ocak 2026.xlsx', '2026-01-05'],
    ['31Ağu25', '2025-08-31'],
    ['2026-03-09 export.csv', '2026-03-09'],
    ['09.03.2026.xlsx', '2026-03-09'],
    ['Top 100 urun 5 Ocak 2026.xlsx', '2026-01-05'],
    ['Kraken 12 products 3 mart 26', '2026-03-03'],
  ])('%s -> %s', (s, d) => expect(guessDate(s)?.date).toBe(d))

  it('yılsız tarihte yıl tahmin edildiği belirtilir', () => {
    expect(guessDate('16 ocak.XLSX', 2026)).toEqual({ date: '2026-01-16', yearGuessed: true })
  })
})

describe('kirli tablo temizleme', () => {
  const rows = [
    ['Helium 10 Xray export'],
    [],
    ['Display Order', 'Product Details', 'ASIN', 'Brand', 'Price $', 'ASIN Sales', 'Recent Purchases', 'Garip Sütun'],
    ['1.', 'Foam A', 'B000000001', 'AKFIX', '$10.00', '1,000', '500', 'x'],
    ['1.1', 'Foam A 2pk', 'B000000002', 'akfix', '$20.00', '50', '200', ''],
    ['2.', 'Glue', 'B000000003', 'Akfix ', 'N/A', '10', '-', ''],
    [null, 'TOTAL', null, null, null, null, null, null],
    [],
    ['', '', '', '', '', '', '', ''],
  ]
  const sheet = cleanSheet(rows, { fileName: '16 ocak 2026.xlsx', sheetName: 'Sheet1' })

  it('başlık satırını bulur ve ürünleri okur', () => {
    expect(sheet.headerRowIndex).toBe(2)
    expect(sheet.products).toHaveLength(3)
    expect(sheet.brand).toBe('Akfix')
    expect(sheet.date).toBe('2026-01-16')
  })
  it('özet satırını atlar, tanınmayan sütunu saklar', () => {
    expect(sheet.products.some((p) => p.title === 'TOTAL')).toBe(false)
    expect(sheet.products[0].extra['Garip Sütun']).toBe('x')
  })
  it('parent satırlarını sayar', () => {
    expect(sheet.products.filter((p) => p.isParent)).toHaveLength(2)
  })
  it('Recent Purchases kuralı rakiplere uygulanır, kendi markamıza uygulanmaz', () => {
    const rival = applyRules(sheet.products, 'benasse', DEFAULT_SETTINGS.rule) // rakip
    expect(rival.adjusted).toBe(1)
    expect(rival.products[1].salesAdjusted).toBeCloseTo(220)
    expect(rival.products[1].revenueCalc).toBeCloseTo(4400)
    expect(rival.products[1].sales).toBe(50) // ham değer korunur
    const own = applyRules(sheet.products, 'kraken', DEFAULT_SETTINGS.rule) // bizim marka
    expect(own.adjusted).toBe(0)
  })
})

const SAMPLES = join(__dirname, '..', '..', 'samples')
describe.skipIf(!existsSync(SAMPLES))('V4 verisinden üretilen örnek dosyalar', () => {
  // V4 veritabanında kayıtlı 16 Ocak 2026 toplam cirolar
  it.each([
    ['Akfix 16 ocak 2026.xlsx', 'Akfix', 68893.56, 135],
    ['Benasse 16 ocak 2026.xlsx', 'Benasse', 487176.05, 401],
    ['Yallcandiy 16 ocak 2026.xlsx', "Y'allcandiy", 350440.61, 86],
  ])('%s toplamı V4 ile aynı', (file, brand, v4Total, count) => {
    const data = readFileSync(join(SAMPLES, file))
    const [sheet] = parseWorkbook(data, file)
    expect(sheet.skipped).toBeUndefined()
    expect(sheet.brand).toBe(brand)
    expect(sheet.date).toBe('2026-01-16')
    expect(sheet.marketplace).toBe('Amazon')
    expect(sheet.products).toHaveLength(count)
    const { products } = applyRules(sheet.products, sheet.brandKey, DEFAULT_SETTINGS.rule)
    expect(computeTotals(products).revenue).toBeCloseTo(v4Total, 0)
  })
})

describe('boşluk türleri', () => {
  it('bölünmez boşluk ve sıfırlar korunur', () => {
    expect(parseUSNumber('$1,000.50')).toBe(1000.5)
    expect(parseUSNumber('1\u00a0000')).toBe(1000)
    expect(parseUSNumber('\u00a0$2,000\u00a0')).toBe(2000)
  })
})

describe("Türkçe Excel'den geçmiş hücreler", () => {
  it.each([
    ['4,3', false, 4.3, true],
    ['5.473.145', true, 5473145, true],
    ['54.329', true, 54329, true], // BSR kesirli olamaz
    ['54.329', false, 54.329, false], // kesirli alanda ABD biçimi geçerli
    ['1.234,56', false, 1234.56, true],
    ['4.5', false, 4.5, false],
    ['12,345', true, 12345, false], // ABD binlik
  ])('%s (tam sayı: %s) -> %s', (input, integer, expected, fixed) => {
    const r = parseCell(input, integer as boolean)
    expect(r.value).toBeCloseTo(expected as number, 6)
    expect(r.fixedTurkish).toBe(fixed)
  })
})

const REAL = join(__dirname, '..', '..', '..', 'excel file')
describe.skipIf(!existsSync(REAL))('gerçek Helium 10 dosyaları', () => {
  it('Ixır Magic Chems: sütunlar, firmalar ve ciro', () => {
    const file = 'Ixır Magic Chems.xlsx'
    const [sheet] = parseWorkbook(readFileSync(join(REAL, file)), file)
    expect(sheet.skipped).toBeUndefined()
    expect(sheet.products).toHaveLength(137)
    for (const f of ['price', 'sales', 'revenue', 'fees', 'rating', 'reviews', 'amazonCategory', 'buyBox', 'fulfillment', 'dimensions'])
      expect(sheet.columnMap).toHaveProperty(f)
    expect(sheet.columnMap).not.toHaveProperty('category') // "Category" Amazon kategorisidir
    const byCompany = Object.fromEntries(sheet.brandCounts.map((b) => [b.brand, b.count]))
    expect(byCompany['Ixir']).toBe(84) // ixirpro + FameMart'ın sattığı Luft Werkzeuge
    expect(byCompany['Magic Chems']).toBe(53)
    const revenue = sheet.products.reduce((s, p) => s + (p.revenue ?? 0), 0)
    expect(revenue).toBeCloseTo(1044068.74, 1)
    expect(sheet.products.filter((p) => p.isParent)).toHaveLength(20)
  })
  it("Y'allcan DIY", () => {
    const file = "Y'allcan DIY.xlsx"
    const [sheet] = parseWorkbook(readFileSync(join(REAL, file)), file)
    expect(sheet.products).toHaveLength(36)
    // MRealeazy'yi satan ECOM LABZ tanınmıyor -> dosyanın ana firmasına bağlanır
    expect(sheet.brandCounts).toEqual([{ brand: "Y'allcandiy", count: 36 }])
  })
})

describe.skipIf(!existsSync(REAL))('Lotos Global ve rakipler', () => {
  it('Kraken & Sprayman: Kraken ve Sprayman ayrı firma, ikisi de bizim', () => {
    const file = 'Kraken & Sprayman.xlsx'
    const [sheet] = parseWorkbook(readFileSync(join(REAL, file)), file)
    expect(sheet.products).toHaveLength(388)
    // Sprayman, Kraken'in alt markası ama ayrı firma olarak izlenir
    expect(sheet.brandCounts).toEqual([{ brand: 'Kraken', count: 323 }, { brand: 'Sprayman', count: 65 }])
  })
  it('Benasse.xlsx: alt markalar ve satıcısız ürünler Benasse (rakip)', () => {
    const file = 'Benasse.xlsx'
    const [sheet] = parseWorkbook(readFileSync(join(REAL, file)), file)
    expect(sheet.brandCounts).toEqual([{ brand: 'Benasse', count: 67 }])
  })
  it('Recent Purchases kuralı bizim markalara uygulanmaz, Benasse artık rakip', () => {
    expect(DEFAULT_SETTINGS.rule.excludeBrandKeys).toEqual(['kraken', 'sprayman', 'stanley', 'akfix'])
    expect(DEFAULT_SETTINGS.rule.excludeBrandKeys).not.toContain('benasse')
  })
})

describe('Excel raporları (gerçek dosyalarla)', () => {
  it.skipIf(!existsSync(REAL))('özet, yıllık ve tek rapor Excel’i üretilir ve geri okunur', async () => {
    const XLSX = await import('xlsx')
    const { buildAnnualWorkbook, buildReportWorkbook, buildSummaryWorkbook } = await import('./reports')
    const files = ['Stanley.xlsx', 'Benasse.xlsx']
    const reports: Report[] = []
    const byId = new Map<number, Product[]>()
    const images = new Map<string, { data: Uint8Array; type: string }>()
    files.forEach((file, i) => {
      const [sheet] = parseWorkbook(readFileSync(join(REAL, file)), file)
      // Gömülü görseller ASIN'e bağlanmalı
      expect(sheet.images?.size ?? 0).toBeGreaterThan(sheet.products.length * 0.8)
      for (const [k, v] of sheet.images ?? []) images.set(k, v)
      for (const [j, date] of ['2026-11-01', '2026-11-08'].entries()) {
        const id = i * 10 + j + 1
        const products = applyRules(sheet.products, brandKey(file), DEFAULT_SETTINGS.rule).products
          .map((p) => ({ ...p, id: undefined, reportId: id, revenueCalc: p.revenueCalc * (j ? 1.1 : 1) }))
        byId.set(id, products as Product[])
        reports.push({ id, name: file, fileName: file, sheetName: '', date, brand: file.replace('.xlsx', ''),
          brandKey: brandKey(file), marketplace: 'Amazon', importedAt: '', source: 'upload',
          totals: computeTotals(products), columnMap: {}, unmappedColumns: [], issues: [] })
      }
    })

    const summary = XLSX.read(await buildSummaryWorkbook(reports, byId))
    expect(summary.SheetNames).toEqual(['Total', 'List'])
    const total = XLSX.utils.sheet_to_json<unknown[]>(summary.Sheets.Total, { header: 1 })
    expect(total[0]).toEqual(['Company', 'Diff', 'Diff %', '01.11.2026', '08.11.2026'])
    expect(total.at(-1)?.[0]).toBe('TOTAL')

    const stanley = reports.filter((r) => r.brand === 'Stanley')
    const annual = XLSX.read(await buildAnnualWorkbook(stanley, byId, images))
    expect(annual.SheetNames).toEqual(['Sum', '8Nov26', '1Nov26'])
    const sum = XLSX.utils.sheet_to_json<unknown[]>(annual.Sheets.Sum, { header: 1 })
    expect(sum.map((r) => r[0])).toContain('Number of Listings')
    expect(byId.get(2)!.every((p) => p.imageUrl.startsWith('https://'))).toBe(true)
    // Görseller dosyaya gömülü (xl/media)
    const zip = XLSX.CFB.read(await buildAnnualWorkbook(stanley, byId, images), { type: 'array' })
    expect(zip.FullPaths.filter((p) => p.includes('/media/')).length).toBeGreaterThan(100)

    const single = XLSX.read(await buildReportWorkbook(stanley[0], byId.get(stanley[0].id!)!, images))
    expect(single.SheetNames).toEqual(['Özet', 'Ürünler'])
  }, 120000)
})

describe('Kategori önerisi', () => {
  it('ürün adından en olası kategoriyi önerir', async () => {
    const { suggestCategory, trainCategoryModel } = await import('./suggest')
    const model = trainCategoryModel([
      { title: 'Spray Foam Sealant Window Door 12oz', category: 'Foam' },
      { title: 'Expanding Polyurethane Foam Gap Filler', category: 'Foam' },
      { title: 'Super Glue for Plastic Repair CA Glue', category: 'Glue' },
      { title: 'Leather Glue Instant Bond', category: 'Glue' },
      { title: 'Aquarium Silicone Sealant Clear', category: 'Sealant' },
    ])
    expect(suggestCategory(model, 'Low Expansion Foam Insulating Spray')?.category).toBe('Foam')
    expect(suggestCategory(model, 'Ceramic Glue Pottery Repair')?.category).toBe('Glue')
    expect(suggestCategory(model, 'zzz qqq')).toBeNull()
  })
})

describe('Beest markaları', () => {
  it('Petra ve Petramax Beest olarak birleşir', () => {
    const resolve = createBrandResolver()
    expect(resolve('PETRAMAX').brand).toBe('Beest')
    expect(resolve('Petra').brand).toBe('Beest')
    expect(resolve('BEEST').brand).toBe('Beest')
  })
  it.skipIf(!existsSync(join(REAL, 'Beest.xlsx')))('Beest.xlsx tek firma olarak okunur', () => {
    const [sheet] = parseWorkbook(readFileSync(join(REAL, 'Beest.xlsx')), 'Beest.xlsx')
    const brands = new Set(sheet.products.map((p) => p.brand))
    expect(brands.has('Beest')).toBe(true)
    expect([...brands].some((b) => /petra/i.test(b))).toBe(false)
  })
})

describe('V4 JSON kategori kütüphanesi', () => {
  const SEED = join(__dirname, '..', '..', 'public', 'seed', 'categories.json')
  it.skipIf(!existsSync(SEED))('her ASIN tek ve geçerli, V4 veritabanıyla çelişmiyor', () => {
    const seed = JSON.parse(readFileSync(SEED, 'utf8')) as { entries: { asin: string; category: string; definedAt?: string }[] }
    const asins = seed.entries.map((e) => e.asin)
    expect(new Set(asins).size).toBe(asins.length)
    expect(asins.every((a) => /^[A-Z0-9]{10}$/.test(a))).toBe(true)
    expect(seed.entries.some((e) => e.category === 'Ballon Shine')).toBe(false)
    // Elle düzeltilenler (örn. Fire Block) V4'ten bilerek farklı
    const lib = new Map(seed.entries.filter((e) => !e.definedAt).map((e) => [e.asin, e.category]))
    const v4 = JSON.parse(readFileSync(join(__dirname, '..', '..', 'test-data', 'v4.json'), 'utf8')) as {
      reports: { products: { asin: string; category?: string }[] }[]
    }
    for (const r of v4.reports)
      for (const p of r.products)
        if (p.category && p.category !== 'Tanımlanmamış' && lib.has(p.asin)) expect(lib.get(p.asin)).toBe(p.category)
  })
})
