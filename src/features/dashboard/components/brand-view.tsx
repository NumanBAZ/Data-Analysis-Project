import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { DollarSign, PieChart, ShoppingCart, Tag } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ALL, byCategory, categoriesIn, totalsOf } from '@/core/filter'
import { formatDateTR, shortDateTR } from '@/core/dates'
import type { Product, Report } from '@/core/types'
import { getProducts } from '@/data/repo'
import { change, fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BrandBadge } from '@/components/brand-badge'
import { ProductImage } from '@/components/product-image'
import { StatCard } from '@/components/stat-card'
import { ChangesCard } from './insights'

/** Her firmanın verilen tarihteki (ya da ondan önceki en yakın) raporu */
function reportsAt(all: Report[], date: string): Report[] {
  const by = new Map<string, Report>()
  for (const r of all) if (r.date <= date && (!by.has(r.brand) || by.get(r.brand)!.date < r.date)) by.set(r.brand, r)
  return [...by.values()]
}

function DeltaText({ value }: { value: number | null }) {
  if (value === null) return <span className='text-muted-foreground'>–</span>
  return <span className={value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{fmt.delta(value)}</span>
}

/**
 * Dashboard'un "tek marka" görünümü: seçilen markanın seçilen raporu (isteğe bağlı kategoriyle).
 * Değişimler aynı markanın bir önceki raporuna göre; pazar payı aynı tarihteki bütün firmalara göre.
 */
export function BrandView({ brand, own, brandReports, selected, category, byReport, allReports, ownKeys }: {
  brand: string
  own: boolean
  /** Markanın raporları, tarihe göre eskiden yeniye */
  brandReports: Report[]
  selected: Report
  category: string
  byReport: Map<number, Product[]>
  allReports: Report[]
  ownKeys: Set<string>
}) {
  const catName = category === ALL ? '' : category
  const productsOf = (r?: Report) => (r ? byCategory(byReport.get(r.id!) ?? [], category) : [])
  const idx = brandReports.findIndex((r) => r.id === selected.id)
  const prev = idx > 0 ? brandReports[idx - 1] : undefined

  const now = totalsOf(productsOf(selected))
  const before = prev ? totalsOf(productsOf(prev)) : null

  // Pazar: aynı tarihteki bütün firmalar (ve önceki rapor tarihindeki hali)
  const marketNow = useMemo(() => reportsAt(allReports, selected.date), [allReports, selected.date])
  const marketPrev = useMemo(() => (prev ? reportsAt(allReports, prev.date) : []), [allReports, prev])
  const marketIds = [...new Set([...marketNow, ...marketPrev].map((r) => r.id!))]
  const marketProducts = useLiveQuery(async () => {
    const m = new Map<number, Product[]>()
    for (const p of await getProducts(marketIds)) {
      if (!m.has(p.reportId)) m.set(p.reportId, [])
      m.get(p.reportId)!.push(p)
    }
    return m
  }, [marketIds.join(',')])

  const revenueIn = (r: Report) => totalsOf(byCategory(marketProducts?.get(r.id!) ?? [], category)).revenue
  const ranking = useMemo(() => {
    if (!marketProducts) return []
    return marketNow
      .map((r) => ({ r, revenue: revenueIn(r), own: ownKeys.has(r.brandKey) }))
      .filter((x) => x.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketNow, marketProducts, category, ownKeys])
  const marketTotal = ranking.reduce((s, x) => s + x.revenue, 0)
  const share = marketTotal ? now.revenue / marketTotal : null
  const marketPrevTotal = marketProducts && prev ? marketPrev.reduce((s, r) => s + revenueIn(r), 0) : 0
  const sharePrev = before && marketPrevTotal ? before.revenue / marketPrevTotal : null
  const rank = ranking.findIndex((x) => x.r.id === selected.id) + 1

  const trend = brandReports.map((r) => {
    const t = totalsOf(productsOf(r))
    return { date: shortDateTR(r.date), ciro: Math.round(t.revenue), satis: t.sales }
  })

  // Kategori kırılımı (yalnızca "bütün kategoriler" seçiliyken)
  const cats = useMemo(() => {
    if (catName) return []
    const prevMap = new Map(categoriesIn(byReport.get(prev?.id ?? -1) ?? []).map((c) => [c.category, c.revenue]))
    return categoriesIn(byReport.get(selected.id!) ?? []).map((c) => ({ ...c, before: prevMap.get(c.category) }))
  }, [catName, byReport, selected.id, prev?.id])

  const prevByAsin = useMemo(() => new Map(productsOf(prev).map((p) => [p.asin, p])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prev?.id, category, byReport])
  const top = [...productsOf(selected)].sort((a, b) => (b.revenueCalc || 0) - (a.revenueCalc || 0)).slice(0, 20)

  const changesMap = useMemo(() => new Map<number, Product[]>([
    [selected.id!, productsOf(selected)],
    ...(prev ? [[prev.id!, productsOf(prev)] as [number, Product[]]] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [selected.id, prev?.id, category, byReport])

  const scope = catName ? `${catName} kategorisi` : 'bütün kategoriler'
  const prevNote = prev ? `Önceki rapor ${formatDateTR(prev.date)}` : 'Önceki rapor yok'

  return (
    <>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <StatCard icon={DollarSign} tone='blue' label='Ciro' value={fmt.money(now.revenue)} delta={before ? change(now.revenue, before.revenue) : null}>
          <p>{prevNote}: {fmt.money(before?.revenue)}</p>
          <p>{brand} · {scope}</p>
        </StatCard>
        <StatCard icon={ShoppingCart} tone='green' label='Satış (adet)' value={fmt.int(now.sales)} delta={before ? change(now.sales, before.sales) : null}>
          <p>{prevNote}: {fmt.int(before?.sales)}</p>
          <p>{fmt.int(now.listings)} ürün (listing){before ? ` · önceki ${fmt.int(before.listings)}` : ''}</p>
        </StatCard>
        <StatCard icon={Tag} tone='amber' label='Ortalama fiyat' value={fmt.money2(now.avgPrice)}
          delta={before?.avgPrice && now.avgPrice ? change(now.avgPrice, before.avgPrice) : null}>
          <p>{prevNote}: {fmt.money2(before?.avgPrice)}</p>
          <p>Ürün başına ciro {fmt.money(now.listings ? now.revenue / now.listings : null)}</p>
        </StatCard>
        <StatCard icon={PieChart} tone='violet' label='Pazar payı' value={fmt.pct(share)}
          delta={share !== null && sharePrev !== null ? share - sharePrev : null} points>
          <div className='flex h-2 overflow-hidden rounded-full bg-muted'>
            <div className={cn('h-2', own ? 'bg-[var(--chart-1)]' : 'bg-[var(--chart-2)]')} style={{ width: `${(share ?? 0) * 100}%` }} />
          </div>
          <p>{rank ? `${ranking.length} firma içinde ${rank}. sırada` : '–'} · pazar {fmt.money(marketTotal)}</p>
        </StatCard>
      </div>

      <div className='grid gap-4 lg:grid-cols-7'>
        <Card className='lg:col-span-4'>
          <CardHeader>
            <CardTitle>Ciro geçmişi</CardTitle>
            <CardDescription>{brand} · {scope} · yüklenen bütün raporlar</CardDescription>
          </CardHeader>
          <CardContent className='h-72 ps-0'>
            <ResponsiveContainer width='100%' height='100%' initialDimension={{ width: 1, height: 1 }}>
              <LineChart data={trend}>
                <CartesianGrid vertical={false} strokeOpacity={0.3} />
                <XAxis dataKey='date' fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmt.moneyCompact(v)} />
                <Tooltip formatter={(v, n) => (n === 'Ciro' ? fmt.money(Number(v)) : fmt.int(Number(v)))} />
                <Line dataKey='ciro' name='Ciro' stroke={own ? 'var(--chart-1)' : '#dc2626'} strokeWidth={3} dot={{ r: 4 }} type='monotone' />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className='lg:col-span-3'>
          <CardHeader>
            <CardTitle>Pazar sıralaması</CardTitle>
            <CardDescription>{scope} · {formatDateTR(selected.date)} itibarıyla her firmanın raporu</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2.5'>
            {ranking.slice(0, 10).map((x, i) => (
              <div key={x.r.id} className={cn('space-y-1 rounded-md', x.r.id === selected.id && 'bg-muted/60 p-1.5')}>
                <div className='flex items-center justify-between gap-2 text-sm'>
                  <span className='flex items-center gap-1.5'>
                    <span className='w-5 text-right text-xs text-muted-foreground tabular-nums'>{i + 1}.</span>
                    <BrandBadge brand={x.r.brand} />
                    {x.own && <Badge variant='secondary'>Biz</Badge>}
                  </span>
                  <span className='tabular-nums text-muted-foreground'>
                    {fmt.money(x.revenue)} · <span className='font-medium text-foreground'>{fmt.pct(marketTotal ? x.revenue / marketTotal : null)}</span>
                  </span>
                </div>
                <div className='h-2 rounded bg-muted'>
                  <div className={cn('h-2 rounded', x.own ? 'bg-[var(--chart-1)]' : 'bg-[var(--chart-2)]')}
                    style={{ width: `${marketTotal ? (x.revenue / marketTotal) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {!ranking.length && <p className='text-sm text-muted-foreground'>Bu kategoride satış yok.</p>}
          </CardContent>
        </Card>
      </div>

      <div className={cn('grid gap-4', !catName && 'lg:grid-cols-2')}>
        {!catName && (
          <Card>
            <CardHeader>
              <CardTitle>Kategoriler</CardTitle>
              <CardDescription>{brand} · {formatDateTR(selected.date)} raporu · değişim önceki rapora göre</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kategori</TableHead>
                    <TableHead className='text-right'>Ürün</TableHead>
                    <TableHead className='text-right'>Ciro</TableHead>
                    <TableHead className='text-right'>Pay</TableHead>
                    <TableHead className='text-right'>Değişim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cats.map((c) => (
                    <TableRow key={c.category}>
                      <TableCell className='font-medium'>{c.category}</TableCell>
                      <TableCell className='text-right tabular-nums'>{c.count}</TableCell>
                      <TableCell className='text-right tabular-nums'>{fmt.money(c.revenue)}</TableCell>
                      <TableCell className='text-right tabular-nums'>{fmt.pct(now.revenue ? c.revenue / now.revenue : null, 0)}</TableCell>
                      <TableCell className='text-right tabular-nums'><DeltaText value={change(c.revenue, c.before)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        <ChangesCard companies={[{ company: brand, own, last: selected, prev }]} byReport={changesMap} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>En çok satan ürünler</CardTitle>
          <CardDescription>{brand} · {scope} · {formatDateTR(selected.date)} · ilk 20 · değişim önceki rapora göre</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-12' />
                <TableHead>Ürün</TableHead>
                {!catName && <TableHead>Kategori</TableHead>}
                <TableHead className='text-right'>Fiyat</TableHead>
                <TableHead className='text-right'>Satış</TableHead>
                <TableHead className='text-right'>Ciro</TableHead>
                <TableHead className='text-right'>Değişim</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((p) => {
                const o = prevByAsin.get(p.asin)
                return (
                  <TableRow key={p.id}>
                    <TableCell><ProductImage asin={p.asin} url={p.imageUrl} className='size-10 rounded border bg-white' /></TableCell>
                    <TableCell className='max-w-[26rem]'>
                      <Link to='/urun/$asin' params={{ asin: p.asin }} className='block truncate font-medium hover:underline' title={p.title}>{p.title || p.asin}</Link>
                      <span className='font-mono text-xs text-muted-foreground'>{p.asin}{!o && prev ? ' · yeni' : ''}</span>
                    </TableCell>
                    {!catName && <TableCell className='text-sm'>{p.category}</TableCell>}
                    <TableCell className='text-right tabular-nums'>{fmt.money2(p.price)}</TableCell>
                    <TableCell className='text-right tabular-nums'>{fmt.int(p.salesAdjusted)}</TableCell>
                    <TableCell className='text-right tabular-nums'>{fmt.money(p.revenueCalc)}</TableCell>
                    <TableCell className='text-right tabular-nums'><DeltaText value={o ? change(p.revenueCalc, o.revenueCalc) : null} /></TableCell>
                  </TableRow>
                )
              })}
              {!top.length && (
                <TableRow><TableCell colSpan={7} className='py-8 text-center text-muted-foreground'>Bu seçimde ürün yok.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
