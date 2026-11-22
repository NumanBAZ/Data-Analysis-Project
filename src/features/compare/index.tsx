import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeftRight } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDateTR } from '@/core/dates'
import { ALL, byCategory, categoriesIn, categoryOf, totalsOf } from '@/core/filter'
import { buildSheetsWithProducts, type SheetSpec } from '@/core/reports'
import type { Product, Report } from '@/core/types'
import { db } from '@/data/db'
import { getProducts, loadImages } from '@/data/repo'
import { printPDF, saveExport } from '@/lib/export'
import { change, fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfigDrawer } from '@/components/config-drawer'
import { ExportMenu } from '@/components/export-menu'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { PrintHeader } from '@/components/print-header'
import { ProductImage } from '@/components/product-image'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { BrandBadge } from '@/components/brand-badge'

type Pair = { asin: string; a?: Product; b?: Product; diff: number }
type SidePick = { company?: string; reportId?: string; category: string }
type Side = { company: string; report?: Report; category: string; label: string; short: string }

const COLOR_A = 'var(--chart-2)'
const COLOR_B = 'var(--chart-1)'

const sortTR = (x: string, y: string) => x.localeCompare(y, 'tr')

export function Compare() {
  const reports = useLiveQuery(() => db.reports.orderBy('date').toArray())
  const companies = useMemo(() => [...new Set((reports ?? []).map((r) => r.brand))].sort(sortTR), [reports])
  const reportsOf = (c: string) => (reports ?? []).filter((r) => r.brand === c)

  const [pa, setPa] = useState<SidePick>({ category: ALL })
  const [pb, setPb] = useState<SidePick>({ category: ALL })
  const [sameCat, setSameCat] = useState(true)

  // Varsayılan: ilk firmanın son iki raporu (eski → A, yeni → B).
  // A'da tarih seçilmemişse ve B aynı firmaysa, A = B'den bir önceki rapor.
  const resolve = (p: SidePick, which: 'a' | 'b', other?: Side): Side => {
    const company = p.company ?? companies[0] ?? ''
    const list = reportsOf(company)
    let fallback = list[list.length - 1]
    if (which === 'a' && other?.report && other.company === company) {
      const i = list.findIndex((r) => r.id === other.report!.id)
      if (i > 0) fallback = list[i - 1]
    }
    const report = list.find((r) => String(r.id) === p.reportId) ?? fallback
    const category = which === 'b' && sameCat ? pa.category : p.category
    const cat = category === ALL ? '' : ` · ${category}`
    return {
      company,
      report,
      category,
      label: `${company} · ${report ? formatDateTR(report.date) : '–'}${cat}`,
      short: `${company} ${report ? formatDateTR(report.date).replace(/ \d{4}$/, '') : ''}`,
    }
  }
  const B = resolve(pb, 'b')
  const A = resolve(pa, 'a', B)
  const sameCompany = A.company === B.company

  const data = useLiveQuery(async () => {
    if (!A.report || !B.report) return null
    const [a, b] = await Promise.all([getProducts([A.report.id!]), getProducts([B.report.id!])])
    return { a, b }
  }, [A.report?.id, B.report?.id, A.report?.totals.revenue, B.report?.totals.revenue])

  const result = useMemo(() => {
    if (!data) return null
    const fa = byCategory(data.a, A.category)
    const fb = byCategory(data.b, B.category)
    const ta = totalsOf(fa)
    const tb = totalsOf(fb)
    const ca = new Map(categoriesIn(fa).map((c) => [c.category, c]))
    const cb = new Map(categoriesIn(fb).map((c) => [c.category, c]))
    const cats = [...new Set([...ca.keys(), ...cb.keys()])]
      .map((c) => ({ c, a: ca.get(c)?.revenue ?? 0, b: cb.get(c)?.revenue ?? 0, na: ca.get(c)?.count ?? 0, nb: cb.get(c)?.count ?? 0 }))
      .sort((x, y) => y.b + y.a - (x.b + x.a))

    // ASIN bazında eşleştirme (aynı firmanın iki tarihi için anlamlı)
    const ma = new Map(fa.map((p) => [p.asin, p]))
    const mb = new Map(fb.map((p) => [p.asin, p]))
    const pairs: Pair[] = [...new Set([...ma.keys(), ...mb.keys()])].map((asin) => {
      const a = ma.get(asin)
      const b = mb.get(asin)
      return { asin, a, b, diff: (b?.revenueCalc ?? 0) - (a?.revenueCalc ?? 0) }
    })
    const top = (list: Product[]) => [...list].sort((x, y) => y.revenueCalc - x.revenueCalc)
    return {
      fa, fb, ta, tb, cats,
      added: pairs.filter((p) => !p.a).sort((x, y) => y.diff - x.diff),
      lost: pairs.filter((p) => !p.b).sort((x, y) => x.diff - y.diff),
      both: pairs.filter((p) => p.a && p.b),
      price: pairs.filter((p) => p.a?.price != null && p.b?.price != null && p.a.price !== p.b.price),
      topA: top(fa),
      topB: top(fb),
    }
  }, [data, A.category, B.category])

  // Kategori seçicilerinde yalnızca o raporda bulunan kategoriler
  const catsA = useMemo(() => categoriesIn(data?.a ?? []), [data])
  const catsB = useMemo(() => categoriesIn(data?.b ?? []), [data])
  const catsBoth = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of [...catsA, ...catsB]) m.set(c.category, (m.get(c.category) ?? 0) + c.revenue)
    return [...m].sort((x, y) => y[1] - x[1]).map(([category]) => category)
  }, [catsA, catsB])

  const swap = () => {
    setPa({ company: B.company, reportId: B.report ? String(B.report.id) : undefined, category: B.category })
    setPb({ company: A.company, reportId: A.report ? String(A.report.id) : undefined, category: A.category })
  }

  const fileBase = `Karsilastirma ${A.short} vs ${B.short}${A.category !== ALL && A.category === B.category ? ` ${A.category}` : ''}`

  const exportExcel = async () => {
    if (!result) return
    await saveExport(fileBase, async () => {
      const r = result
      const sideRow = (name: string, s: Side, t: typeof r.ta) => [
        name, s.company, s.report ? formatDateTR(s.report.date) : '', s.category === ALL ? 'Bütün kategoriler' : s.category,
        t.revenue, t.sales, t.listings, t.parents, t.avgPrice,
      ]
      const pct = (b: number, a: number) => fmt.delta(change(b, a))
      const sheets: SheetSpec[] = [
        {
          name: 'Özet',
          header: ['Taraf', 'Firma', 'Tarih', 'Kategori', 'Ciro', 'Satış', 'Listing', 'Parent', 'Ort. fiyat'],
          rows: [
            sideRow('A', A, r.ta),
            sideRow('B', B, r.tb),
            ['Fark (B − A)', '', '', '', r.tb.revenue - r.ta.revenue, r.tb.sales - r.ta.sales, r.tb.listings - r.ta.listings, r.tb.parents - r.ta.parents, (r.tb.avgPrice ?? 0) - (r.ta.avgPrice ?? 0)],
            ['Değişim %', '', '', '', pct(r.tb.revenue, r.ta.revenue), pct(r.tb.sales, r.ta.sales), pct(r.tb.listings, r.ta.listings), pct(r.tb.parents, r.ta.parents), pct(r.tb.avgPrice ?? 0, r.ta.avgPrice ?? 0)],
          ],
          kinds: ['text', 'text', 'text', 'text', 'money', 'int', 'int', 'int', 'money'],
          widths: [14, 18, 16, 22, 14, 10, 9, 9, 11],
          bold: (row) => String(row[0]).startsWith('Fark') || String(row[0]).startsWith('Değişim'),
        },
        {
          name: 'Kategoriler',
          header: ['Kategori', `A ciro (${A.short})`, 'A ürün', `B ciro (${B.short})`, 'B ürün', 'Fark', 'Değişim %'],
          rows: r.cats.map((c) => [c.c, c.a, c.na, c.b, c.nb, c.b - c.a, change(c.b, c.a)]),
          kinds: ['text', 'money', 'int', 'money', 'int', 'money', 'pct'],
          widths: [24, 18, 8, 18, 8, 14, 11],
        },
      ]
      if (sameCompany) {
        const status = (p: Pair) => (!p.a ? 'Yeni' : !p.b ? 'Kaybolan' : 'Ortak')
        sheets.push({
          name: 'ASIN değişimi',
          header: ['ASIN', 'Ürün', 'Kategori', 'Durum', 'Fiyat A', 'Fiyat B', 'Satış A', 'Satış B', 'Ciro A', 'Ciro B', 'Fark'],
          rows: [...r.added, ...r.lost, ...[...r.both].sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))].map((p) => {
            const x = (p.b ?? p.a)!
            return [p.asin, x.title, categoryOf(x), status(p), p.a?.price, p.b?.price, p.a?.salesAdjusted, p.b?.salesAdjusted, p.a?.revenueCalc, p.b?.revenueCalc, p.diff]
          }),
          kinds: ['text', 'text', 'text', 'text', 'money', 'money', 'int', 'int', 'money', 'money', 'money'],
          widths: [13, 60, 18, 10, 10, 10, 9, 9, 13, 13, 13],
          freeze: { row: 1, col: 2 },
        })
      }
      const images = await loadImages([...r.fa, ...r.fb].map((p) => p.asin))
      return buildSheetsWithProducts(sheets, [
        { name: `A ${A.short}`, products: r.fa },
        { name: `B ${B.short}`, products: r.fb },
      ], images)
    })
  }

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div className='no-print flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Karşılaştır</h2>
            <p className='text-muted-foreground no-print'>
              İki tarafı ayrı ayrı seçin: aynı firmanın iki tarihi, iki farklı firma ya da firmaların belirli kategorileri (örn. Akfix Foam ↔ Magic Chems Foam).
            </p>
          </div>
          <ExportMenu
            note='Seçili iki taraf ve kategori filtreleriyle aktarılır.'
            excel={result ? exportExcel : undefined}
            pdf={result ? () => printPDF(fileBase) : undefined}
          />
        </div>
        <PrintHeader title={`${A.label}  ↔  ${B.label}`} subtitle='Karşılaştırma raporu' />

        {/* Taraf seçimi */}
        <div className='no-print grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]'>
          <SidePanel
            tag='A' color={COLOR_A} side={A} companies={companies} reports={reportsOf(A.company)} cats={catsA}
            onCompany={(c) => setPa({ company: c, category: pa.category })}
            onReport={(id) => setPa({ ...pa, company: A.company, reportId: id })}
            onCategory={(c) => setPa({ ...pa, company: A.company, reportId: A.report ? String(A.report.id) : undefined, category: c })}
            catOptions={sameCat ? catsBoth : undefined}
          />
          <div className='flex items-center justify-center'>
            <Button variant='outline' size='icon' onClick={swap} title='Tarafları değiştir' aria-label='Tarafları değiştir'>
              <ArrowLeftRight />
            </Button>
          </div>
          <SidePanel
            tag='B' color={COLOR_B} side={B} companies={companies} reports={reportsOf(B.company)} cats={catsB}
            onCompany={(c) => setPb({ company: c, category: pb.category })}
            onReport={(id) => setPb({ ...pb, company: B.company, reportId: id })}
            onCategory={(c) => setPb({ ...pb, company: B.company, reportId: B.report ? String(B.report.id) : undefined, category: c })}
            categoryLocked={sameCat}
          />
        </div>
        <div className='no-print flex items-center gap-2 text-sm'>
          <Switch id='same-cat' checked={sameCat} onCheckedChange={(v) => {
            setSameCat(v)
            if (!v) setPb({ ...pb, company: B.company, reportId: B.report ? String(B.report.id) : undefined, category: pa.category })
          }} />
          <Label htmlFor='same-cat' className='font-normal'>İki tarafta aynı kategori</Label>
          <span className='text-muted-foreground'>· Kapatırsanız iki tarafa farklı kategori seçebilirsiniz.</span>
        </div>

        {A.report && B.report && A.report.id === B.report.id && A.category === B.category && (
          <p className='text-sm text-amber-600'>İki tarafta aynı rapor ve aynı kategori seçili.</p>
        )}

        {result && A.report && B.report && (
          <>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <VsCard label='Ciro' a={result.ta.revenue} b={result.tb.revenue} f={fmt.money} A={A} B={B} />
              <VsCard label='Satış (adet)' a={result.ta.sales} b={result.tb.sales} f={fmt.int} A={A} B={B} />
              <VsCard label='Listing' a={result.ta.listings} b={result.tb.listings} f={fmt.int} A={A} B={B} />
              <VsCard label='Ortalama fiyat' a={result.ta.avgPrice ?? 0} b={result.tb.avgPrice ?? 0} f={fmt.money2} A={A} B={B} />
            </div>

            {sameCompany && (
              <p className='text-sm text-muted-foreground'>
                ASIN hareketi: <span className='font-medium text-emerald-600'>+{result.added.length} yeni</span> ·{' '}
                <span className='font-medium text-red-600'>−{result.lost.length} kaybolan</span> · {result.both.length} ortak ürün · {result.price.length} fiyat değişti
              </p>
            )}

            {result.cats.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Kategorilere göre ciro</CardTitle>
                  <CardDescription>{A.short} ↔ {B.short}</CardDescription>
                </CardHeader>
                <CardContent className='h-72 ps-0'>
                  <ResponsiveContainer width='100%' height='100%' initialDimension={{ width: 1, height: 1 }}>
                    <BarChart data={result.cats.slice(0, 12).map((c) => ({ name: c.c, A: Math.round(c.a), B: Math.round(c.b) }))}>
                      <CartesianGrid vertical={false} strokeOpacity={0.3} />
                      <XAxis dataKey='name' fontSize={12} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor='end' height={50} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmt.moneyCompact(v)} />
                      <Tooltip formatter={(v) => fmt.money(Number(v))} cursor={{ fillOpacity: 0.1 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === 'A' ? `A · ${A.short}` : `B · ${B.short}`)} />
                      <Bar dataKey='A' fill={COLOR_A} radius={[4, 4, 0, 0]} />
                      <Bar dataKey='B' fill={COLOR_B} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className='text-base'>Kategoriler</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kategori</TableHead>
                      <TableHead className='text-right'>A · {A.short}</TableHead>
                      <TableHead className='text-right'>B · {B.short}</TableHead>
                      <TableHead className='text-right'>Fark</TableHead>
                      <TableHead className='text-right'>Değişim</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.cats.map((c) => (
                      <TableRow key={c.c}>
                        <TableCell>{c.c}</TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.money(c.a)} <span className='text-xs text-muted-foreground'>({c.na})</span></TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.money(c.b)} <span className='text-xs text-muted-foreground'>({c.nb})</span></TableCell>
                        <TableCell className={cn('text-right tabular-nums', tone(c.b - c.a))}>{fmt.money(c.b - c.a)}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', tone(c.b - c.a))}>{fmt.delta(change(c.b, c.a))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {sameCompany ? (
              <Tabs defaultValue='movers'>
                <TabsList className='no-print'>
                  <TabsTrigger value='movers'>Ciro değişimi</TabsTrigger>
                  <TabsTrigger value='added'>Yeni ({result.added.length})</TabsTrigger>
                  <TabsTrigger value='lost'>Kaybolan ({result.lost.length})</TabsTrigger>
                  <TabsTrigger value='price'>Fiyat ({result.price.length})</TabsTrigger>
                </TabsList>
                <TabsContent value='movers'>
                  <PairTable rows={[...result.both].sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)).slice(0, 100)} />
                </TabsContent>
                <TabsContent value='added'><PairTable rows={result.added} /></TabsContent>
                <TabsContent value='lost'><PairTable rows={result.lost} /></TabsContent>
                <TabsContent value='price'>
                  <PairTable rows={[...result.price].sort((x, y) => Math.abs(y.b!.price! - y.a!.price!) - Math.abs(x.b!.price! - x.a!.price!))} />
                </TabsContent>
              </Tabs>
            ) : (
              <div className='grid gap-4 xl:grid-cols-2'>
                <TopList tag='A' color={COLOR_A} side={A} products={result.topA} />
                <TopList tag='B' color={COLOR_B} side={B} products={result.topB} />
              </div>
            )}
          </>
        )}
      </Main>
    </>
  )
}

const tone = (d: number) => (d > 0 ? 'text-emerald-600' : d < 0 ? 'text-red-600' : '')

function Tag({ tag, color }: { tag: string; color: string }) {
  return (
    <span className='inline-flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white' style={{ background: color }}>
      {tag}
    </span>
  )
}

function SidePanel({ tag, color, side, companies, reports, cats, catOptions, categoryLocked, onCompany, onReport, onCategory }: {
  tag: string
  color: string
  side: Side
  companies: string[]
  reports: Report[]
  cats: { category: string; revenue: number; count: number }[]
  /** Aynı kategori modunda iki raporun kategorileri birlikte */
  catOptions?: string[]
  categoryLocked?: boolean
  onCompany: (c: string) => void
  onReport: (id: string) => void
  onCategory: (c: string) => void
}) {
  const count = new Map(cats.map((c) => [c.category, c.count]))
  const options = catOptions ?? cats.map((c) => c.category)
  return (
    <Card className='gap-3 py-4'>
      <CardContent className='space-y-3'>
        <div className='flex items-center gap-2'>
          <Tag tag={tag} color={color} />
          <span className='truncate font-medium'>{side.label}</span>
        </div>
        <div className='grid gap-2 sm:grid-cols-3'>
          <div className='space-y-1'>
            <Label className='text-xs'>Firma</Label>
            <Select value={side.company} onValueChange={onCompany}>
              <SelectTrigger className='w-full'><SelectValue placeholder='Seçin' /></SelectTrigger>
              <SelectContent>{companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Rapor tarihi</Label>
            <Select value={side.report ? String(side.report.id) : ''} onValueChange={onReport}>
              <SelectTrigger className='w-full'><SelectValue placeholder='Seçin' /></SelectTrigger>
              <SelectContent>
                {[...reports].reverse().map((r) => <SelectItem key={r.id} value={String(r.id)}>{formatDateTR(r.date)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <Label className='text-xs'>Kategori{categoryLocked ? ' (A ile aynı)' : ''}</Label>
            <Select value={side.category} onValueChange={onCategory} disabled={categoryLocked}>
              <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
              <SelectContent className='max-h-80'>
                <SelectItem value={ALL}>Bütün kategoriler</SelectItem>
                {options.map((c) => (
                  <SelectItem key={c} value={c}>{c}{count.has(c) ? ` (${count.get(c)})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function VsCard({ label, a, b, f, A, B }: { label: string; a: number; b: number; f: (n: number) => string; A: Side; B: Side }) {
  const d = change(b, a)
  const max = Math.max(a, b) || 1
  return (
    <Card className='gap-2'>
      <CardHeader className='pb-0'><CardDescription>{label}</CardDescription></CardHeader>
      <CardContent className='space-y-2'>
        {([['A', COLOR_A, A, a], ['B', COLOR_B, B, b]] as const).map(([t, c, s, v]) => (
          <div key={t} className='space-y-1'>
            <div className='flex items-baseline justify-between gap-2'>
              <span className='flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
                <Tag tag={t} color={c} /> <span className='truncate'>{s.short}</span>
              </span>
              <span className='text-lg font-bold tabular-nums'>{f(v)}</span>
            </div>
            <div className='h-1.5 rounded bg-muted'>
              <div className='h-1.5 rounded' style={{ width: `${(v / max) * 100}%`, background: c }} />
            </div>
          </div>
        ))}
        <p className='border-t pt-2 text-xs text-muted-foreground'>
          B, A'ya göre <span className={cn('font-medium tabular-nums', tone(b - a))}>{fmt.delta(d)}</span>
        </p>
      </CardContent>
    </Card>
  )
}

function TopList({ tag, color, side, products }: { tag: string; color: string; side: Side; products: Product[] }) {
  const total = products.reduce((s, p) => s + (p.revenueCalc || 0), 0) || 1
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'><Tag tag={tag} color={color} /> En çok satanlar</CardTitle>
        <CardDescription>{side.label} · {products.length} ürün</CardDescription>
      </CardHeader>
      <CardContent>
        {!products.length ? <p className='py-6 text-center text-sm text-muted-foreground'>Ürün yok.</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-16' />
                <TableHead>Ürün</TableHead>
                <TableHead className='text-right'>Fiyat</TableHead>
                <TableHead className='text-right'>Satış</TableHead>
                <TableHead className='text-right'>Ciro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.slice(0, 20).map((p) => (
                <TableRow key={p.id}>
                  <TableCell><ProductImage asin={p.asin} url={p.imageUrl} className='size-14 min-w-14 rounded-md border bg-white p-0.5' /></TableCell>
                  <TableCell className='max-w-[13rem] whitespace-normal'>
                    <Link to='/urun/$asin' params={{ asin: p.asin }} className='line-clamp-2 text-sm font-medium hover:underline' title={p.title}>{p.title}</Link>
                    <div className='mt-0.5 flex items-center gap-2 text-xs text-muted-foreground'><span className='font-mono'>{p.asin}</span><span>{categoryOf(p)}</span></div>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{fmt.money2(p.price)}</TableCell>
                  <TableCell className='text-right tabular-nums'>{fmt.int(p.salesAdjusted)}</TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {fmt.money(p.revenueCalc)}
                    <div className='text-xs text-muted-foreground'>{fmt.pct(p.revenueCalc / total, 0)}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {products.length > 20 && <p className='mt-2 text-xs text-muted-foreground'>İlk 20 ürün gösteriliyor; hepsi Excel'de.</p>}
      </CardContent>
    </Card>
  )
}

function PairTable({ rows }: { rows: Pair[] }) {
  if (!rows.length) return <p className='py-6 text-center text-sm text-muted-foreground'>Kayıt yok.</p>
  return (
    <div className='overflow-x-auto rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-28 min-w-28' />
            <TableHead>Ürün</TableHead>
            <TableHead className='text-right'>Fiyat</TableHead>
            <TableHead className='text-right'>Satış</TableHead>
            <TableHead className='text-right'>Ciro</TableHead>
            <TableHead className='text-right'>Fark</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const p = (r.b ?? r.a)!
            return (
              <TableRow key={r.asin}>
                <TableCell><ProductImage asin={r.asin} url={p.imageUrl} className='size-24 min-w-24 rounded-md border bg-white p-1' /></TableCell>
                <TableCell className='max-w-[28rem]'>
                  <Link to='/urun/$asin' params={{ asin: r.asin }} className='line-clamp-1 font-medium hover:underline' title={p.title}>{p.title}</Link>
                  <div className='mt-0.5 flex items-center gap-2 text-xs text-muted-foreground'><span className='font-mono'>{r.asin}</span><BrandBadge brand={p.brand} /><span>{p.category}</span></div>
                </TableCell>
                <TableCell className='text-right tabular-nums'>{arrow(r.a?.price, r.b?.price, fmt.money2)}</TableCell>
                <TableCell className='text-right tabular-nums'>{arrow(r.a?.salesAdjusted, r.b?.salesAdjusted, fmt.int)}</TableCell>
                <TableCell className='text-right tabular-nums'>{arrow(r.a?.revenueCalc, r.b?.revenueCalc, fmt.money)}</TableCell>
                <TableCell className={cn('text-right font-medium tabular-nums', tone(r.diff))}>{fmt.money(r.diff)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function arrow(a: number | null | undefined, b: number | null | undefined, f: (n: number | null | undefined) => string) {
  if (a == null) return <>{f(b)}</>
  if (b == null) return <span className='text-muted-foreground'>{f(a)} → –</span>
  if (a === b) return <>{f(b)}</>
  return <><span className='text-muted-foreground'>{f(a)} →</span> {f(b)}</>
}
