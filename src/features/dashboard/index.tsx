import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { DollarSign, FileUp, Package, PieChart, ShoppingCart } from 'lucide-react'
import { StatCard } from '@/components/stat-card'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { brandKey, PARENT_BRANDS } from '@/core/brands'
import { formatDateTR, shortDateTR } from '@/core/dates'
import { buildReportWorkbook, buildSheetsWorkbook, categoryRevenue } from '@/core/reports'
import type { Product, Report } from '@/core/types'
import { db, getSettings } from '@/data/db'
import { getProducts, loadImages } from '@/data/repo'
import { ALL, byCategory, categoriesIn } from '@/core/filter'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BrandView } from './components/brand-view'
import { change, fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { BrandBadge } from '@/components/brand-badge'
import { ExportMenu } from '@/components/export-menu'
import { CategoryShareCard, ChangesCard, useCompanyProducts, type CompanyRow } from './components/insights'
import { PrintHeader } from '@/components/print-header'
import { printPDF, saveExport } from '@/lib/export'

const OWN_COLOR = 'var(--chart-1)'
const RIVAL_COLOR = 'var(--chart-2)'
/** Çizgi grafikte firma renkleri */
const LINE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#475569', '#ea580c']


export function Dashboard() {
  const reports = useLiveQuery(() => db.reports.orderBy('date').toArray())
  const settings = useLiveQuery(() => getSettings())
  const ownKeys = useMemo(() => new Set((settings?.ownBrands ?? []).map(brandKey)), [settings])

  // Her firmanın en son ve bir önceki raporu
  const companies = useMemo<CompanyRow[]>(() => {
    const by = new Map<string, Report[]>()
    for (const r of reports ?? []) {
      if (!by.has(r.brand)) by.set(r.brand, [])
      by.get(r.brand)!.push(r)
    }
    return [...by].map(([company, list]) => ({
      company,
      own: ownKeys.has(list[0].brandKey),
      last: list[list.length - 1],
      prev: list.length > 1 ? list[list.length - 2] : undefined,
    })).sort((a, b) => b.last.totals.revenue - a.last.totals.revenue)
  }, [reports, ownKeys])

  // Tek marka görünümü: marka + rapor + (isteğe bağlı) kategori. Marka boşsa genel pazar.
  const [brand, setBrand] = useState('')
  const [reportId, setReportId] = useState<number>()
  const [category, setCategory] = useState(ALL)
  const brandRow = companies.find((c) => c.company === brand)
  const brandReports = useMemo(() => (reports ?? []).filter((r) => r.brand === brand), [reports, brand])
  const selected = brandReports.find((r) => r.id === reportId) ?? brandRow?.last
  const brandProducts = useLiveQuery(async () => {
    const m = new Map<number, Product[]>()
    if (!brandReports.length) return m
    for (const p of await getProducts(brandReports.map((r) => r.id!))) {
      if (!m.has(p.reportId)) m.set(p.reportId, [])
      m.get(p.reportId)!.push(p)
    }
    return m
  }, [brandReports.map((r) => r.id).join(',')])
  const brandCats = useMemo(() => (selected && brandProducts ? categoriesIn(brandProducts.get(selected.id!) ?? []) : []), [selected, brandProducts])
  const pickBrand = (b: string) => { setBrand(b === ALL ? '' : b); setReportId(undefined); setCategory(ALL) }
  const brandMode = !!(brandRow && selected)

  const byReport = useCompanyProducts(companies)
  const latestIds = useMemo(() => companies.map((c) => c.last.id!), [companies])
  const categories = useLiveQuery(async () => {
    const products = await getProducts(latestIds)
    return [...categoryRevenue(products)].sort((a, b) => b[1] - a[1])
  }, [latestIds.join(',')])

  const trend = useMemo(() => {
    const dates = [...new Set((reports ?? []).map((r) => r.date))].sort()
    return dates.map((d) => {
      const row: Record<string, string | number> = { date: shortDateTR(d) }
      for (const r of reports ?? []) if (r.date === d) row[r.brand] = Math.round(r.totals.revenue)
      return row
    })
  }, [reports])

  const sum = (pick: (r: Report) => number, rows = companies, prev = false) =>
    rows.reduce((a, c) => a + ((prev ? c.prev : c.last) ? pick((prev ? c.prev : c.last)!) : 0), 0)
  const withPrev = companies.filter((c) => c.prev)
  const total = sum((r) => r.totals.revenue)
  const own = sum((r) => r.totals.revenue, companies.filter((c) => c.own))
  const prevOf = (pick: (r: Report) => number) => sum(pick, withPrev, true)
  const nowOf = (pick: (r: Report) => number) => sum(pick, withPrev)
  const totalSales = sum((r) => r.totals.sales)
  const ownSales = sum((r) => r.totals.sales, companies.filter((c) => c.own))
  const listings = sum((r) => r.totals.listings)
  const ownListings = sum((r) => r.totals.listings, companies.filter((c) => c.own))
  // Pay değişimi (yüzde puan): yalnızca önceki raporu olan firmalarla
  const shareNow = nowOf((r) => r.totals.revenue) ? sum((r) => r.totals.revenue, withPrev.filter((c) => c.own)) / nowOf((r) => r.totals.revenue) : null
  const sharePrev = prevOf((r) => r.totals.revenue) ? sum((r) => r.totals.revenue, withPrev.filter((c) => c.own), true) / prevOf((r) => r.totals.revenue) : null
  const shareDelta = shareNow !== null && sharePrev !== null ? shareNow - sharePrev : null
  const ownGroup = settings?.ownGroup ?? 'Lotos Global'
  const kpis = [
    {
      label: 'Pazar cirosu',
      value: fmt.money(total),
      delta: change(sum((r) => r.totals.revenue, withPrev), sum((r) => r.totals.revenue, withPrev, true)),
    },
    {
      label: `${settings?.ownGroup ?? 'Lotos Global'} payı`,
      value: fmt.pct(total ? own / total : null),
      sub: fmt.money(own),
    },
    {
      label: 'Toplam satış (adet)',
      value: fmt.int(sum((r) => r.totals.sales)),
      delta: change(sum((r) => r.totals.sales, withPrev), sum((r) => r.totals.sales, withPrev, true)),
    },
    {
      label: 'Listing / Parent',
      value: `${fmt.int(sum((r) => r.totals.listings))} / ${fmt.int(sum((r) => r.totals.parents))}`,
      sub: `${companies.length} firma`,
    },
  ]
  const lastDate = companies.reduce((m, c) => (c.last.date > m ? c.last.date : m), '')
  const catTotal = (categories ?? []).reduce((a, [, v]) => a + v, 0)

  const catName = category === ALL ? '' : category
  const fileBase = brandMode
    ? `${brand} ${selected!.date}${catName ? ` ${catName}` : ''}`
    : `Pazar Ozeti ${lastDate || ''}`.trim()
  const exportBrandExcel = () =>
    saveExport(fileBase, async () => {
      const ps = byCategory(brandProducts?.get(selected!.id!) ?? [], category)
      return buildReportWorkbook(selected!, ps, await loadImages(ps.map((p) => p.asin)), { category: catName })
    })
  const exportExcel = () =>
    saveExport(fileBase, () =>
      buildSheetsWorkbook([
        {
          name: 'Firmalar',
          header: ['Firma', 'Grup', 'Son rapor', 'Ciro', 'Önceki ciro', 'Değişim', 'Pazar payı', 'Satış', 'Listing', 'Parent'],
          rows: [
            ...companies.map((c) => [
              c.company, c.own ? (settings?.ownGroup ?? 'Lotos Global') : 'Rakip', c.last.date.split('-').reverse().join('.'),
              c.last.totals.revenue, c.prev?.totals.revenue ?? null, change(c.last.totals.revenue, c.prev?.totals.revenue),
              total ? c.last.totals.revenue / total : null, c.last.totals.sales, c.last.totals.listings, c.last.totals.parents,
            ]),
            ['TOPLAM', '', '', total, null, kpis[0].delta ?? null, 1, sum((r) => r.totals.sales), sum((r) => r.totals.listings), sum((r) => r.totals.parents)],
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
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div className='no-print flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Dashboard</h1>
            <p className='text-muted-foreground'>
              {brandMode
                ? `${brand} · ${formatDateTR(selected!.date)} raporu${catName ? ` · ${catName}` : ''}. Değişim, markanın bir önceki raporuna göre.`
                : `Her firmanın en son raporu${lastDate ? ` · son yükleme ${formatDateTR(lastDate)}` : ''}. Değişim, bir önceki raporuna göre.`}
            </p>
          </div>
          <div className='no-print flex gap-2'>
            <ExportMenu
              note='PDF: bu sayfanın sunuma uygun hali (A4 yatay). Yazıcı olarak "PDF olarak kaydet" seçin.'
              excel={brandMode ? exportBrandExcel : companies.length ? exportExcel : undefined}
              pdf={companies.length ? () => printPDF(fileBase) : undefined}
            />
            <Button asChild>
              <Link to='/yukle'><FileUp /> Dosya Yükle</Link>
            </Button>
          </div>
        </div>
        {companies.length > 0 && (
          <div className='no-print flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2'>
            <span className='ps-1 text-sm font-medium text-muted-foreground'>Görünüm:</span>
            <Select value={brand || ALL} onValueChange={pickBrand}>
              <SelectTrigger className='w-56'><SelectValue /></SelectTrigger>
              <SelectContent className='max-h-80'>
                <SelectItem value={ALL}>Genel pazar (bütün firmalar)</SelectItem>
                {companies.map((c) => <SelectItem key={c.company} value={c.company}>{c.company}{c.own ? ' (biz)' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
            {brandMode && (
              <>
                <Select value={String(selected!.id)} onValueChange={(v) => { setReportId(Number(v)); setCategory(ALL) }}>
                  <SelectTrigger className='w-60'><SelectValue /></SelectTrigger>
                  <SelectContent className='max-h-80'>
                    {[...brandReports].reverse().map((r, i) => (
                      <SelectItem key={r.id} value={String(r.id)}>{formatDateTR(r.date)}{i === 0 ? ' (en son)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className='w-56'><SelectValue /></SelectTrigger>
                  <SelectContent className='max-h-80'>
                    <SelectItem value={ALL}>Bütün kategoriler</SelectItem>
                    {brandCats.map((c) => <SelectItem key={c.category} value={c.category}>{c.category} ({c.count})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant='ghost' size='sm' onClick={() => pickBrand(ALL)}>Genel pazara dön</Button>
              </>
            )}
          </div>
        )}
        <PrintHeader
          title={brandMode ? `${brand} · Marka Özeti` : 'Pazar Özeti'}
          subtitle={brandMode
            ? `${formatDateTR(selected!.date)} raporu · ${catName || 'bütün kategoriler'}`
            : `${settings?.ownGroup ?? 'Lotos Global'} ve rakipler · her firmanın en son raporu${lastDate ? ` · son veri ${formatDateTR(lastDate)}` : ''}`}
        />

        {reports && reports.length === 0 ? (
          <Card><CardContent className='py-16 text-center text-muted-foreground'>Henüz rapor yok. Dosya yükleyerek başlayın.</CardContent></Card>
        ) : brandMode ? (
          brandProducts ? (
            <BrandView brand={brand} own={brandRow!.own} brandReports={brandReports} selected={selected!}
              category={category} byReport={brandProducts} allReports={reports ?? []} ownKeys={ownKeys} />
          ) : <p className='text-sm text-muted-foreground'>Yükleniyor…</p>
        ) : (
          <>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <StatCard icon={DollarSign} tone='blue' label='Pazar cirosu' value={fmt.money(total)} delta={kpis[0].delta}>
                <p>Önceki rapor: {fmt.money(withPrev.length ? prevOf((r) => r.totals.revenue) : null)}</p>
                <p>{companies.length} firmanın en son raporu</p>
              </StatCard>
              <StatCard icon={PieChart} tone='violet' label={`${ownGroup} payı`} value={fmt.pct(total ? own / total : null)} delta={shareDelta} points>
                <div className='flex h-2 overflow-hidden rounded-full bg-[var(--chart-2)]/30'>
                  <div className='h-2 bg-[var(--chart-1)]' style={{ width: `${total ? (own / total) * 100 : 0}%` }} />
                </div>
                <p className='flex justify-between'><span>Biz {fmt.money(own)}</span><span>Rakipler {fmt.money(total - own)}</span></p>
              </StatCard>
              <StatCard icon={ShoppingCart} tone='green' label='Toplam satış (adet)' value={fmt.int(totalSales)} delta={kpis[2].delta}>
                <p>Ortalama fiyat {fmt.money2(totalSales ? total / totalSales : null)}</p>
                <p>{ownGroup}: {fmt.int(ownSales)} adet ({fmt.pct(totalSales ? ownSales / totalSales : null, 0)})</p>
              </StatCard>
              <StatCard icon={Package} tone='amber' label='Ürün (listing)' value={fmt.int(listings)} unit={`/ ${fmt.int(sum((r) => r.totals.parents))} parent`}
                delta={change(nowOf((r) => r.totals.listings), withPrev.length ? prevOf((r) => r.totals.listings) : null)}>
                <p>Ürün başına ciro {fmt.money(listings ? total / listings : null)}</p>
                <p>{ownGroup}: {fmt.int(ownListings)} ürün · {companies.length} firma</p>
              </StatCard>
            </div>

            <div className='grid gap-4 lg:grid-cols-7'>
              <Card className='lg:col-span-4'>
                <CardHeader>
                  <CardTitle>Firmalara göre ciro</CardTitle>
                  <CardDescription>En son rapor · koyu renk {settings?.ownGroup ?? 'Lotos Global'}</CardDescription>
                </CardHeader>
                <CardContent className='h-80 ps-0'>
                  <ResponsiveContainer width='100%' height='100%' initialDimension={{ width: 1, height: 1 }}>
                    <BarChart data={companies.map((c) => ({ name: c.company, value: Math.round(c.last.totals.revenue), own: c.own }))}>
                      <CartesianGrid vertical={false} strokeOpacity={0.3} />
                      <XAxis dataKey='name' fontSize={12} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor='end' height={50} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmt.moneyCompact(v)} />
                      <Tooltip formatter={(v) => fmt.money(Number(v))} cursor={{ fillOpacity: 0.1 }} />
                      <Bar dataKey='value' name='Ciro' radius={[4, 4, 0, 0]}>
                        {companies.map((c) => <Cell key={c.company} fill={c.own ? OWN_COLOR : RIVAL_COLOR} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className='lg:col-span-3'>
                <CardHeader>
                  <CardTitle>Kategorilere göre ciro</CardTitle>
                  <CardDescription>Bütün firmaların son raporu</CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {(categories ?? []).slice(0, 10).map(([cat, v]) => (
                    <div key={cat} className='space-y-1'>
                      <div className='flex justify-between text-sm'>
                        <span className='truncate'>{cat}</span>
                        <span className='tabular-nums text-muted-foreground'>{fmt.money(v)} · {fmt.pct(catTotal ? v / catTotal : null, 0)}</span>
                      </div>
                      <div className='h-2 rounded bg-muted'>
                        <div className='h-2 rounded bg-primary' style={{ width: `${catTotal ? (v / catTotal) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                  {(categories ?? []).length > 10 && (
                    <p className='text-xs text-muted-foreground'>+{categories!.length - 10} kategori daha</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className='grid gap-4 lg:grid-cols-2'>
              <CategoryShareCard companies={companies} byReport={byReport} />
              <ChangesCard companies={companies} byReport={byReport} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Ciro geçmişi</CardTitle>
                <CardDescription>Her firmanın yüklenen bütün raporları</CardDescription>
              </CardHeader>
              <CardContent className='h-80 ps-0'>
                <ResponsiveContainer width='100%' height='100%' initialDimension={{ width: 1, height: 1 }}>
                  <LineChart data={trend}>
                    <CartesianGrid vertical={false} strokeOpacity={0.3} />
                    <XAxis dataKey='date' fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmt.moneyCompact(v)} />
                    <Tooltip formatter={(v) => fmt.money(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {companies.map((c, i) => (
                      <Line key={c.company} dataKey={c.company} stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={c.own ? 3 : 1.5} dot={{ r: 3 }} connectNulls type='monotone' />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Firmalar</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Firma</TableHead>
                      <TableHead>Son rapor</TableHead>
                      <TableHead className='text-right'>Ciro</TableHead>
                      <TableHead className='text-right'>Önceki</TableHead>
                      <TableHead className='text-right'>Değişim</TableHead>
                      <TableHead className='text-right'>Pay</TableHead>
                      <TableHead className='text-right'>Satış</TableHead>
                      <TableHead className='text-right'>Listing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((c) => (
                      <TableRow key={c.company}>
                        <TableCell className='font-medium'>
                          <BrandBadge brand={c.company} /> {c.own && <Badge variant='secondary' className='ms-1'>Biz</Badge>}
                          {PARENT_BRANDS[brandKey(c.company)] && (
                            <span className='ms-1 text-xs text-muted-foreground'>({PARENT_BRANDS[brandKey(c.company)]} alt markası)</span>
                          )}
                        </TableCell>
                        <TableCell>{formatDateTR(c.last.date)}</TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.money(c.last.totals.revenue)}</TableCell>
                        <TableCell className='text-right tabular-nums text-muted-foreground'>{fmt.money(c.prev?.totals.revenue)}</TableCell>
                        <TableCell className='text-right tabular-nums'><Delta value={change(c.last.totals.revenue, c.prev?.totals.revenue)} /></TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.pct(total ? c.last.totals.revenue / total : null)}</TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.int(c.last.totals.sales)}</TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.int(c.last.totals.listings)}</TableCell>
                      </TableRow>
                    ))}
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

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className='text-muted-foreground'>önceki rapor yok</span>
  return (
    <span className={cn(value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      {fmt.delta(value)}
    </span>
  )
}
