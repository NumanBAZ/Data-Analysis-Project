import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { DollarSign, FileUp, PieChart, ShoppingCart } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { brandKey, groupRevenue, parentOf } from '@/core/brands'
import { formatDateTR, shortDateTR } from '@/core/dates'
import { buildSheetsWorkbook, categoryRevenue } from '@/core/reports'
import type { Product, Report } from '@/core/types'
import { db, getSettings } from '@/data/db'
import { getProducts } from '@/data/repo'
import { printPDF, saveExport } from '@/lib/export'
import { change, fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BrandBadge } from '@/components/brand-badge'
import { ConfigDrawer } from '@/components/config-drawer'
import { ExportMenu } from '@/components/export-menu'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { PrintHeader } from '@/components/print-header'
import { ProductImage } from '@/components/product-image'
import { Segmented } from '@/components/segmented'
import { SORT_BY_OPTIONS, type SortBy } from '@/lib/sort'
import { Search } from '@/components/search'
import { StatCard } from '@/components/stat-card'
import { ThemeSwitch } from '@/components/theme-switch'
import { CategoryShareCard, useCompanyProducts, type CompanyRow } from './components/insights'

const OWN_COLOR = 'var(--chart-1)'
const RIVAL_COLOR = 'var(--chart-2)'
/** Çizgi grafikte firma renkleri (sabit sıra) */
const LINE_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)']

/** Pazarın kısa özeti. Tek firmanın grafikleri Firma Analizi sayfasında. */
export function Dashboard() {
  const navigate = useNavigate()
  const reports = useLiveQuery(() => db.reports.orderBy('date').toArray())
  const settings = useLiveQuery(() => getSettings())
  const ownKeys = useMemo(() => new Set((settings?.ownBrands ?? []).map(brandKey)), [settings])
  const ownGroup = settings?.ownGroup ?? 'Lotos Global'

  // Her firmanın en son ve bir önceki raporu
  const companies = useMemo<CompanyRow[]>(() => {
    const by = new Map<string, Report[]>()
    for (const r of reports ?? []) {
      if (!by.has(r.brand)) by.set(r.brand, [])
      by.get(r.brand)!.push(r)
    }
    return [...by]
      .map(([company, list]) => ({
        company,
        own: ownKeys.has(list[0].brandKey),
        last: list[list.length - 1],
        prev: list.length > 1 ? list[list.length - 2] : undefined,
      }))
      .sort((a, b) => b.last.totals.revenue - a.last.totals.revenue)
  }, [reports, ownKeys])

  const byReport = useCompanyProducts(companies)
  const latestIds = companies.map((c) => c.last.id!)
  const categories = useLiveQuery(async () => {
    const products = await getProducts(latestIds)
    return [...categoryRevenue(products)].sort((a, b) => b[1] - a[1])
  }, [latestIds.join(',')])

  // Firma sıralaması: ciroya göre çoktan aza ya da azdan çoğa (grafik ve tablo birlikte)
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')
  const sorted = order === 'desc' ? companies : [...companies].reverse()
  // Alt markası olan firmalar için grup toplamı (Ixir + Magic Chems, Kraken + Sprayman)
  const groups = useMemo(() => {
    const latest = companies.map((c) => ({ company: c.company, revenue: c.last.totals.revenue }))
    return new Map(companies.map((c) => [c.company, groupRevenue(c.company, latest)]))
  }, [companies])
  const orderToggle = (
    <Segmented value={order} onChange={setOrder} options={[{ value: 'desc', label: 'Çoktan aza' }, { value: 'asc', label: 'Azdan çoğa' }]} />
  )

  // Pazarın en çok satan ürünleri: her firmanın son raporundan
  const [topBy, setTopBy] = useState<SortBy>('revenue')
  const topProducts = useMemo(() => {
    const brandOf = new Map(companies.map((c) => [c.last.id!, c.company]))
    const all: (Product & { company: string })[] = []
    for (const c of companies) for (const p of byReport?.get(c.last.id!) ?? []) all.push({ ...p, company: brandOf.get(p.reportId)! })
    const key = (p: Product) => (topBy === 'revenue' ? p.revenueCalc || 0 : p.salesAdjusted || 0)
    return all.sort((a, b) => key(b) - key(a)).slice(0, 10)
  }, [companies, byReport, topBy])

  const trend = useMemo(() => {
    const dates = [...new Set((reports ?? []).map((r) => r.date))].sort()
    return dates.map((d) => {
      const row: Record<string, string | number> = { date: shortDateTR(d) }
      for (const r of reports ?? []) if (r.date === d) row[r.brand] = Math.round(r.totals.revenue)
      return row
    })
  }, [reports])

  const sum = (pick: (r: Report) => number, rows: CompanyRow[] = companies, prev = false) =>
    rows.reduce((a, c) => {
      const r = prev ? c.prev : c.last
      return a + (r ? pick(r) : 0)
    }, 0)
  const revenue = (r: Report) => r.totals.revenue
  const sales = (r: Report) => r.totals.sales
  const withPrev = companies.filter((c) => c.prev)
  const ownRows = companies.filter((c) => c.own)
  const total = sum(revenue)
  const own = sum(revenue, ownRows)
  const totalSales = sum(sales)
  // Pay değişimi (yüzde puan): yalnızca önceki raporu olan firmalarla
  const nowW = sum(revenue, withPrev)
  const prevW = sum(revenue, withPrev, true)
  const ownW = withPrev.filter((c) => c.own)
  const shareDelta = nowW && prevW ? sum(revenue, ownW) / nowW - sum(revenue, ownW, true) / prevW : null
  const revenueDelta = change(nowW, prevW)
  const lastDate = companies.reduce((m, c) => (c.last.date > m ? c.last.date : m), '')
  const catTotal = (categories ?? []).reduce((a, [, v]) => a + v, 0)
  const openFirm = (company: string) => navigate({ to: '/firma', search: { marka: company } })

  const fileBase = `Pazar Ozeti ${lastDate}`.trim()
  const exportExcel = () =>
    saveExport(fileBase, () =>
      buildSheetsWorkbook([
        {
          name: 'Firmalar',
          header: ['Firma', 'Grup', 'Son rapor', 'Ciro', 'Önceki ciro', 'Değişim', 'Pazar payı', 'Satış', 'Listing', 'Parent'],
          rows: [
            ...companies.map((c) => [
              c.company, c.own ? ownGroup : 'Rakip', c.last.date.split('-').reverse().join('.'),
              c.last.totals.revenue, c.prev?.totals.revenue ?? null, change(c.last.totals.revenue, c.prev?.totals.revenue),
              total ? c.last.totals.revenue / total : null, c.last.totals.sales, c.last.totals.listings, c.last.totals.parents,
            ]),
            ['TOPLAM', '', '', total, null, revenueDelta, 1, totalSales, sum((r) => r.totals.listings), sum((r) => r.totals.parents)],
          ],
          kinds: ['text', 'text', 'text', 'money', 'money', 'pct', 'pct', 'int', 'int', 'int'],
          widths: [20, 14, 12, 14, 14, 10, 11, 10, 9, 9],
          bold: (r) => r[0] === 'TOPLAM',
        },
        {
          name: 'Kategoriler',
          header: ['Kategori', 'Ciro', 'Pay'],
          rows: (categories ?? []).map(([c, v]) => [c, v, catTotal ? v / catTotal : null]),
          kinds: ['text', 'money', 'pct'],
          widths: [26, 14, 9],
        },
      ])
    )

  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div className='no-print flex flex-wrap items-center gap-2'>
          <div className='me-auto'>
            <h1 className='text-2xl font-bold tracking-tight'>Dashboard</h1>
            {lastDate && <p className='text-sm text-muted-foreground'>Son veri {formatDateTR(lastDate)}</p>}
          </div>
          <ExportMenu
            note='PDF: bu sayfanın sunuma uygun hali (A4 yatay).'
            excel={companies.length ? exportExcel : undefined}
            pdf={companies.length ? () => printPDF(fileBase) : undefined}
          />
          <Button asChild>
            <Link to='/yukle'><FileUp /> Dosya Yükle</Link>
          </Button>
        </div>
        <PrintHeader title='Pazar Özeti' subtitle={`${ownGroup} ve rakipler${lastDate ? ` · son veri ${formatDateTR(lastDate)}` : ''}`} />

        {reports && reports.length === 0 ? (
          <Card><CardContent className='py-16 text-center text-muted-foreground'>Henüz rapor yok. Dosya yükleyerek başlayın.</CardContent></Card>
        ) : (
          <>
            <div className='grid gap-4 sm:grid-cols-3'>
              <StatCard icon={DollarSign} tone='blue' label='Pazar cirosu' value={fmt.money(total)} delta={revenueDelta} />
              <StatCard icon={PieChart} tone='violet' label={`${ownGroup} payı`} value={fmt.pct(total ? own / total : null)} delta={shareDelta} points>
                <div className='flex h-2 overflow-hidden rounded-full bg-[var(--chart-2)]/30'>
                  <div className='h-2 bg-[var(--chart-1)]' style={{ width: `${total ? (own / total) * 100 : 0}%` }} />
                </div>
              </StatCard>
              <StatCard icon={ShoppingCart} tone='green' label='Toplam satış (adet)' value={fmt.int(totalSales)}
                delta={change(sum(sales, withPrev), sum(sales, withPrev, true))} />
            </div>

            <div className='grid gap-4 lg:grid-cols-7'>
              <Card className='lg:col-span-4'>
                <CardHeader className='flex flex-row flex-wrap items-center gap-2'>
                  <CardTitle className='me-auto'>Firmalara göre ciro</CardTitle>
                  {orderToggle}
                </CardHeader>
                <CardContent className='min-h-80 flex-1 ps-0'>
                  <ResponsiveContainer width='100%' height='100%' initialDimension={{ width: 1, height: 1 }}>
                    <BarChart data={sorted.map((c) => ({ name: c.company, value: Math.round(c.last.totals.revenue) }))}>
                      <CartesianGrid vertical={false} strokeOpacity={0.3} />
                      <XAxis dataKey='name' fontSize={12} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor='end' height={50} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmt.moneyCompact(v)} />
                      <Tooltip formatter={(v) => [fmt.money(Number(v)), 'Ciro']} cursor={{ fillOpacity: 0.08 }} />
                      <Bar dataKey='value' radius={[4, 4, 0, 0]} maxBarSize={48} className='cursor-pointer'
                        onClick={(d) => openFirm((d as unknown as { name: string }).name)}>
                        {sorted.map((c) => <Cell key={c.company} fill={c.own ? OWN_COLOR : RIVAL_COLOR} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <div className='lg:col-span-3'>
                <CategoryShareCard companies={companies} byReport={byReport} />
              </div>
            </div>

            <Card>
              <CardHeader className='flex flex-row flex-wrap items-center gap-2'>
                <CardTitle className='me-auto'>En çok satan ürünler</CardTitle>
                <Segmented value={topBy} onChange={setTopBy} options={SORT_BY_OPTIONS} />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-8' />
                      <TableHead className='w-12' />
                      <TableHead>Product Details</TableHead>
                      <TableHead>Firma</TableHead>
                      <TableHead className='text-right'>ASIN Sales</TableHead>
                      <TableHead className='text-right'>ASIN Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map((p, i) => (
                      <TableRow key={p.id}>
                        <TableCell className='text-muted-foreground tabular-nums'>{i + 1}.</TableCell>
                        <TableCell><ProductImage asin={p.asin} url={p.imageUrl} className='size-10 rounded border bg-white' /></TableCell>
                        <TableCell className='max-w-[26rem]'>
                          <Link to='/urun/$asin' params={{ asin: p.asin }} className='block truncate font-medium hover:underline' title={p.title}>{p.title || p.asin}</Link>
                          <span className='text-xs text-muted-foreground'>{p.category}</span>
                        </TableCell>
                        <TableCell><BrandBadge brand={p.company} /></TableCell>
                        <TableCell className={cn('text-right tabular-nums', topBy === 'sales' && 'font-medium')}>{fmt.int(p.salesAdjusted)}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', topBy === 'revenue' && 'font-medium')}>{fmt.money(p.revenueCalc)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {trend.length > 1 && (
              <Card>
                <CardHeader><CardTitle>Ciro geçmişi</CardTitle></CardHeader>
                <CardContent className='h-80 ps-0'>
                  <ResponsiveContainer width='100%' height='100%' initialDimension={{ width: 1, height: 1 }}>
                    <LineChart data={trend}>
                      <CartesianGrid vertical={false} strokeOpacity={0.3} />
                      <XAxis dataKey='date' fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmt.moneyCompact(v)} />
                      <Tooltip formatter={(v) => fmt.money(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {companies.slice(0, LINE_COLORS.length).map((c, i) => (
                        <Line key={c.company} dataKey={c.company} stroke={LINE_COLORS[i]}
                          strokeWidth={c.own ? 3 : 2} dot={{ r: 3 }} connectNulls type='monotone' />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className='flex flex-row flex-wrap items-center gap-2'>
                <CardTitle className='me-auto'>Firmalar</CardTitle>
                {orderToggle}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Firma</TableHead>
                      <TableHead>Son rapor</TableHead>
                      <TableHead className='text-right'>Ciro</TableHead>
                      <TableHead className='text-right'>Değişim</TableHead>
                      <TableHead className='text-right'>Pay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((c) => {
                      const d = change(c.last.totals.revenue, c.prev?.totals.revenue)
                      return (
                        <TableRow key={c.company} className='cursor-pointer' onClick={() => openFirm(c.company)}>
                          <TableCell className='font-medium'>
                            <BrandBadge brand={c.company} /> {c.own && <Badge variant='secondary' className='ms-1'>Biz</Badge>}
                            {parentOf(c.company) && <span className='ms-1.5 text-xs font-normal text-muted-foreground'>{parentOf(c.company)} alt markası</span>}
                          </TableCell>
                          <TableCell>{formatDateTR(c.last.date)}</TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {fmt.money(c.last.totals.revenue)}
                            {groups.get(c.company) && (
                              <span className='block text-xs text-muted-foreground'>
                                Grup {fmt.money(groups.get(c.company)!.total)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className={cn('text-right tabular-nums',
                            d === null ? 'text-muted-foreground' : d >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                            {d === null ? '–' : fmt.delta(d)}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>{fmt.pct(total ? c.last.totals.revenue / total : null)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </Main>
    </>
  )
}
