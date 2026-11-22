import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, ArrowUpDown, DollarSign, Package, PieChart as PieIcon, ShoppingCart, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { brandKey, groupRevenue, parentOf } from '@/core/brands'
import { formatDateTR, shortDateTR } from '@/core/dates'
import { byCategory, categoriesIn, totalsOf } from '@/core/filter'
import { buildReportWorkbook } from '@/core/reports'
import type { Product, Report } from '@/core/types'
import { db, getSettings } from '@/data/db'
import { getProducts, loadImages } from '@/data/repo'
import { printPDF, saveExport } from '@/lib/export'
import { change, fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfigDrawer } from '@/components/config-drawer'
import { ExportMenu } from '@/components/export-menu'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { PrintHeader } from '@/components/print-header'
import { ProductImage } from '@/components/product-image'
import { Search } from '@/components/search'
import { StatCard } from '@/components/stat-card'
import { ThemeSwitch } from '@/components/theme-switch'
import { ChangesCard } from '@/features/dashboard/components/insights'

/** Donut'ta ayrı dilim olarak gösterilen en büyük kategori sayısı; gerisi "Diğer" */
const SLICES = 7
const OTHER = 'Diğer'
const colorAt = (i: number) => (i < SLICES ? `var(--cat-${i + 1})` : 'var(--cat-other)')

type SortKey = 'price' | 'sales' | 'revenue'
const SORT_VALUE: Record<SortKey, (p: Product) => number | null> = {
  price: (p) => p.price,
  sales: (p) => p.salesAdjusted,
  revenue: (p) => p.revenueCalc,
}

/** Tıklanınca sıralayan tablo başlığı; ok yönü sıralama yönünü gösterir */
function SortHead({ label, k, sort, onClick }: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: 'desc' | 'asc' }
  onClick: (k: SortKey) => void
}) {
  const active = sort.key === k
  const Icon = !active ? ArrowUpDown : sort.dir === 'desc' ? ArrowDown : ArrowUp
  return (
    <TableHead className='text-right'>
      <button type='button' onClick={() => onClick(k)}
        title={active && sort.dir === 'desc' ? 'Azdan çoğa sırala' : 'Çoktan aza sırala'}
        className={cn('inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted', active ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
        <Icon className='size-3.5' />
      </button>
    </TableHead>
  )
}

/** Her firmanın verilen tarihteki (ya da ondan önceki en yakın) raporu */
function reportsAt(all: Report[], date: string): Report[] {
  const by = new Map<string, Report>()
  for (const r of all) if (r.date <= date && (!by.has(r.brand) || by.get(r.brand)!.date < r.date)) by.set(r.brand, r)
  return [...by.values()]
}

export function FirmAnalysis({ brand: brandParam }: { brand?: string }) {
  const navigate = useNavigate()
  const reports = useLiveQuery(() => db.reports.orderBy('date').toArray())
  const settings = useLiveQuery(() => getSettings())
  const ownKeys = useMemo(() => new Set((settings?.ownBrands ?? []).map(brandKey)), [settings])

  // Firmalar, son raporun cirosuna göre büyükten küçüğe
  const companies = useMemo(() => {
    const last = new Map<string, Report>()
    for (const r of reports ?? []) last.set(r.brand, r)
    return [...last.values()].sort((a, b) => b.totals.revenue - a.totals.revenue).map((r) => r.brand)
  }, [reports])

  const brand = brandParam && companies.includes(brandParam) ? brandParam : companies[0]
  const brandReports = useMemo(() => (reports ?? []).filter((r) => r.brand === brand), [reports, brand])
  const [reportId, setReportId] = useState<number>()
  const [category, setCategory] = useState<string>()
  const selected = brandReports.find((r) => r.id === reportId) ?? brandReports[brandReports.length - 1]
  const idx = brandReports.findIndex((r) => r.id === selected?.id)
  const prev = idx > 0 ? brandReports[idx - 1] : undefined
  const own = selected ? ownKeys.has(selected.brandKey) : false

  const byReport = useLiveQuery(async () => {
    const m = new Map<number, Product[]>()
    for (const p of await getProducts(brandReports.map((r) => r.id!))) {
      if (!m.has(p.reportId)) m.set(p.reportId, [])
      m.get(p.reportId)!.push(p)
    }
    return m
  }, [brandReports.map((r) => r.id).join(',')])

  const products = useMemo(() => (selected && byReport?.get(selected.id!)) || [], [selected, byReport])
  const prevProducts = useMemo(() => (prev && byReport?.get(prev.id!)) || [], [prev, byReport])

  const now = totalsOf(products)
  const before = prev ? totalsOf(prevProducts) : null

  // Pazar payı: aynı tarihteki bütün firmaların raporlarına göre
  const market = useMemo(() => {
    if (!selected || !reports) return { share: null as number | null, sharePrev: null as number | null, rank: 0 }
    const at = reportsAt(reports, selected.date).sort((a, b) => b.totals.revenue - a.totals.revenue)
    const total = at.reduce((s, r) => s + r.totals.revenue, 0)
    const atPrev = prev ? reportsAt(reports, prev.date) : []
    const totalPrev = atPrev.reduce((s, r) => s + r.totals.revenue, 0)
    return {
      share: total ? selected.totals.revenue / total : null,
      sharePrev: prev && totalPrev ? prev.totals.revenue / totalPrev : null,
      rank: at.findIndex((r) => r.id === selected.id) + 1,
    }
  }, [reports, selected, prev])

  // Alt marka ilişkisi: ana markada grup toplamı, alt markada bağlı olduğu marka
  const parent = brand ? parentOf(brand) : undefined
  const group = useMemo(() => {
    if (!selected || !reports || !brand) return null
    const latest = reportsAt(reports, selected.date).map((r) => ({ company: r.brand, revenue: r.totals.revenue }))
    return groupRevenue(brand, latest)
  }, [reports, selected, brand])

  // Kategoriler: renk sırası ciroya göre; donut'ta ilk 7 + Diğer
  const cats = useMemo(() => categoriesIn(products).filter((c) => c.revenue > 0), [products])
  const colorOf = useMemo(() => new Map(cats.map((c, i) => [c.category, colorAt(i)])), [cats])
  const slices = useMemo(() => {
    const head = cats.slice(0, SLICES).map((c) => ({ name: c.category, value: c.revenue }))
    const rest = cats.slice(SLICES).reduce((s, c) => s + c.revenue, 0)
    return rest > 0 ? [...head, { name: OTHER, value: rest }] : head
  }, [cats])

  const trend = brandReports.map((r) => ({
    date: shortDateTR(r.date),
    ciro: Math.round(totalsOf(byReport?.get(r.id!) ?? []).revenue),
  }))

  const activeCat = category && colorOf.has(category) ? category : undefined
  // Ürün tablosu: Fiyat / Satış / Ciro başlığına tıklayınca çoktan aza, tekrar tıklayınca azdan çoğa
  const [sort, setSort] = useState<{ key: SortKey; dir: 'desc' | 'asc' }>({ key: 'revenue', dir: 'desc' })
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
  const top = useMemo(() => {
    const v = SORT_VALUE[sort.key]
    const sign = sort.dir === 'desc' ? -1 : 1
    // Değeri boş olan ürünler her iki yönde de en alta
    return [...byCategory(products, activeCat)]
      .sort((a, b) => {
        const x = v(a)
        const y = v(b)
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
        return sign * (x - y)
      })
      .slice(0, 20)
  }, [products, activeCat, sort])
  const prevByAsin = useMemo(() => new Map(prevProducts.map((p) => [p.asin, p])), [prevProducts])
  const pickCat = (c?: string) => setCategory(c && c !== OTHER && c !== activeCat ? c : undefined)

  const pickBrand = (b: string) => {
    setReportId(undefined)
    setCategory(undefined)
    navigate({ to: '/firma', search: { marka: b } })
  }

  const fileBase = selected ? `${brand} ${selected.date}` : 'Firma Analizi'
  const exportExcel = () =>
    saveExport(fileBase, async () => buildReportWorkbook(selected!, products, await loadImages(products.map((p) => p.asin))))

  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div className='no-print flex flex-wrap items-center gap-2'>
          <h1 className='me-auto text-2xl font-bold tracking-tight'>Firma Analizi</h1>
          {companies.length > 0 && (
            <>
              <Select value={brand} onValueChange={pickBrand}>
                <SelectTrigger className='w-52'><SelectValue /></SelectTrigger>
                <SelectContent className='max-h-80'>
                  {companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {selected && (
                <Select value={String(selected.id)} onValueChange={(v) => { setReportId(Number(v)); setCategory(undefined) }}>
                  <SelectTrigger className='w-44'><SelectValue /></SelectTrigger>
                  <SelectContent className='max-h-80'>
                    {[...brandReports].reverse().map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>{formatDateTR(r.date)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <ExportMenu
                note='PDF: bu sayfanın sunuma uygun hali (A4 yatay).'
                excel={selected ? exportExcel : undefined}
                pdf={selected ? () => printPDF(fileBase) : undefined}
              />
            </>
          )}
        </div>
        {selected && <PrintHeader title={`${brand} · Firma Analizi`} subtitle={`${formatDateTR(selected.date)} raporu`} />}

        {reports && !companies.length ? (
          <Card><CardContent className='py-16 text-center text-muted-foreground'>Henüz rapor yok. Dosya yükleyerek başlayın.</CardContent></Card>
        ) : !selected || !byReport ? (
          <p className='text-sm text-muted-foreground'>Yükleniyor…</p>
        ) : (
          <>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <StatCard icon={DollarSign} tone='blue' label='Ciro' value={fmt.money(now.revenue)} delta={before ? change(now.revenue, before.revenue) : null}>
                {group && <p>Grup cirosu ({group.subs.join(', ')} dahil): <span className='font-medium text-foreground'>{fmt.money(group.total)}</span></p>}
                {parent && <p>{parent} alt markası</p>}
              </StatCard>
              <StatCard icon={ShoppingCart} tone='green' label='Satış (adet)' value={fmt.int(now.sales)} delta={before ? change(now.sales, before.sales) : null} />
              <StatCard icon={PieIcon} tone='violet' label='Pazar payı' value={fmt.pct(market.share)}
                unit={market.rank ? `${market.rank}. sırada` : undefined}
                delta={market.share !== null && market.sharePrev !== null ? market.share - market.sharePrev : null} points />
              <StatCard icon={Package} tone='amber' label='Ürün sayısı' value={fmt.int(now.listings)} delta={before ? change(now.listings, before.listings) : null} />
            </div>

            <div className='grid gap-4 lg:grid-cols-5'>
              <Card className='lg:col-span-3'>
                <CardHeader><CardTitle>Kategorilere göre ciro</CardTitle></CardHeader>
                <CardContent className='flex-1 ps-0'>
                  <div className='h-full' style={{ minHeight: Math.max(220, cats.length * 36) }}>
                    <ResponsiveContainer width='100%' height='100%' initialDimension={{ width: 1, height: 1 }}>
                      <BarChart data={cats} layout='vertical' margin={{ left: 8, right: 16 }} barCategoryGap={6}>
                        <CartesianGrid horizontal={false} strokeOpacity={0.3} />
                        <XAxis type='number' fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmt.moneyCompact(v)} />
                        <YAxis type='category' dataKey='category' width={130} fontSize={12} tickLine={false} axisLine={false} interval={0} />
                        <Tooltip formatter={(v) => [fmt.money(Number(v)), 'Ciro']} cursor={{ fillOpacity: 0.08 }} />
                        <Bar dataKey='revenue' radius={[0, 4, 4, 0]} maxBarSize={24} className='cursor-pointer'
                          onClick={(d) => pickCat((d as unknown as { category: string }).category)}>
                          {cats.map((c) => (
                            <Cell key={c.category} fill={colorOf.get(c.category)} fillOpacity={activeCat && activeCat !== c.category ? 0.3 : 1} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className='lg:col-span-2'>
                <CardHeader><CardTitle>Kategori payları</CardTitle></CardHeader>
                <CardContent className='space-y-4'>
                  <div className='relative h-56'>
                    <ResponsiveContainer width='100%' height='100%' initialDimension={{ width: 1, height: 1 }}>
                      <PieChart>
                        <Pie data={slices} dataKey='value' nameKey='name' innerRadius='62%' outerRadius='95%' paddingAngle={1}
                          stroke='var(--card)' strokeWidth={2} className='cursor-pointer' onClick={(d) => pickCat(d.name)}>
                          {slices.map((s, i) => (
                            <Cell key={s.name} fill={colorAt(s.name === OTHER ? SLICES : i)} fillOpacity={activeCat && activeCat !== s.name ? 0.3 : 1} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, n) => [`${fmt.money(Number(v))} · ${fmt.pct(now.revenue ? Number(v) / now.revenue : null, 0)}`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
                      <span className='text-xs text-muted-foreground'>Toplam</span>
                      <span className='text-lg font-bold tabular-nums'>{fmt.moneyCompact(now.revenue)}</span>
                    </div>
                  </div>
                  <ul className='space-y-1.5 text-sm'>
                    {slices.map((s, i) => (
                      <li key={s.name}>
                        <button type='button' onClick={() => pickCat(s.name)} disabled={s.name === OTHER}
                          className={cn('flex w-full items-center gap-2 rounded px-1 text-start hover:bg-muted disabled:hover:bg-transparent',
                            activeCat && activeCat !== s.name && 'opacity-40')}>
                          <span className='size-3 shrink-0 rounded-sm' style={{ background: colorAt(s.name === OTHER ? SLICES : i) }} />
                          <span className='truncate'>{s.name}</span>
                          <span className='ms-auto font-medium tabular-nums'>{fmt.pct(now.revenue ? s.value / now.revenue : null, 0)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {brandReports.length > 1 && (
              <Card>
                <CardHeader><CardTitle>Ciro geçmişi</CardTitle></CardHeader>
                <CardContent className='h-64 ps-0'>
                  <ResponsiveContainer width='100%' height='100%' initialDimension={{ width: 1, height: 1 }}>
                    <LineChart data={trend}>
                      <CartesianGrid vertical={false} strokeOpacity={0.3} />
                      <XAxis dataKey='date' fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmt.moneyCompact(v)} />
                      <Tooltip formatter={(v) => [fmt.money(Number(v)), 'Ciro']} />
                      <Line dataKey='ciro' stroke={own ? 'var(--chart-1)' : 'var(--cat-1)'} strokeWidth={2} dot={{ r: 4 }} type='monotone' />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className='flex flex-row flex-wrap items-center gap-2'>
                <CardTitle className='me-auto'>Ürünler</CardTitle>
                {activeCat && (
                  <Button variant='secondary' size='sm' onClick={() => setCategory(undefined)}>
                    <span className='size-2.5 rounded-sm' style={{ background: colorOf.get(activeCat) }} />
                    {activeCat} <X />
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-12' />
                      <TableHead>Ürün</TableHead>
                      <SortHead label='Fiyat' k='price' sort={sort} onClick={toggleSort} />
                      <SortHead label='Satış' k='sales' sort={sort} onClick={toggleSort} />
                      <SortHead label='Ciro' k='revenue' sort={sort} onClick={toggleSort} />
                      {prev && <TableHead className='text-right' title={`${formatDateTR(prev.date)} raporuna göre ciro değişimi`}>Ciro değişimi</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top.map((p) => {
                      const o = prevByAsin.get(p.asin)
                      const d = o ? change(p.revenueCalc, o.revenueCalc) : null
                      return (
                        <TableRow key={p.id}>
                          <TableCell><ProductImage asin={p.asin} url={p.imageUrl} className='size-10 rounded border bg-white' /></TableCell>
                          <TableCell className='max-w-[28rem]'>
                            <Link to='/urun/$asin' params={{ asin: p.asin }} className='block truncate font-medium hover:underline' title={p.title}>{p.title || p.asin}</Link>
                            <span className='text-xs text-muted-foreground'>{p.category}</span>
                          </TableCell>
                          <TableCell className={cn('text-right tabular-nums', sort.key === 'price' && 'font-medium')}>{fmt.money2(p.price)}</TableCell>
                          <TableCell className={cn('text-right tabular-nums', sort.key === 'sales' && 'font-medium')}>{fmt.int(p.salesAdjusted)}</TableCell>
                          <TableCell className={cn('text-right tabular-nums', sort.key === 'revenue' && 'font-medium')}>{fmt.money(p.revenueCalc)}</TableCell>
                          {prev && (
                            <TableCell className={cn('text-right tabular-nums',
                              d === null ? 'text-muted-foreground' : d >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                              {d === null ? (o ? '–' : 'yeni') : fmt.delta(d)}
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                    {!top.length && (
                      <TableRow><TableCell colSpan={prev ? 6 : 5} className='py-8 text-center text-muted-foreground'>Ürün yok.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {prev && (
              <ChangesCard
                companies={[{ company: brand, own, last: selected, prev }]}
                byReport={new Map([[selected.id!, products], [prev.id!, prevProducts]])}
              />
            )}
          </>
        )}
      </Main>
    </>
  )
}
