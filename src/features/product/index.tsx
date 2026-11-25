import { Link, useRouter } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDateTR, shortDateTR } from '@/core/dates'
import type { Product, Report } from '@/core/types'
import { db } from '@/data/db'
import { change, fmt } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProductImage } from '@/components/product-image'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { BrandBadge } from '@/components/brand-badge'

type Point = { p: Product; r: Report }

export function ProductDetail({ asin }: { asin: string }) {
  const router = useRouter()
  const history = useLiveQuery(async () => {
    const products = await db.products.where('asin').equals(asin).toArray()
    const reports = await db.reports.bulkGet([...new Set(products.map((p) => p.reportId))])
    const byId = new Map(reports.filter(Boolean).map((r) => [r!.id!, r!]))
    return products
      .map((p) => ({ p, r: byId.get(p.reportId)! }))
      .filter((x) => x.r)
      .sort((a, b) => a.r.date.localeCompare(b.r.date))
  }, [asin])

  const last = history?.[history.length - 1]
  const prev = history && history.length > 1 ? history[history.length - 2] : undefined
  const chart = (history ?? []).map(({ p, r }) => ({
    date: shortDateTR(r.date),
    Fiyat: p.price,
    Satış: p.salesAdjusted,
    Ciro: Math.round(p.revenueCalc),
    BSR: p.bsr,
  }))

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <Button variant='ghost' size='sm' className='-ms-2 w-fit' onClick={() => router.history.back()}>
          <ArrowLeft /> Geri
        </Button>

        {history && !last && <p className='text-muted-foreground'>{asin} için kayıt bulunamadı.</p>}

        {last && (
          <>
            <div className='flex flex-wrap items-start gap-4'>
              <ProductImage asin={asin} url={last.p.imageUrl} className='size-28 border bg-white' />
              <div className='min-w-0 flex-1 space-y-1'>
                <h2 className='text-xl font-bold tracking-tight'>{last.p.title}</h2>
                <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
                  <span className='font-mono'>{asin}</span>
                  <BrandBadge brand={last.p.brand} />
                  <Badge variant='outline'>{last.p.category}</Badge>
                  {last.p.url && (
                    <a href={last.p.url} target='_blank' rel='noreferrer' className='inline-flex items-center gap-1 hover:underline'>
                      Amazon <ExternalLink className='size-3' />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
              <Kpi label='Fiyat' value={fmt.money2(last.p.price)} d={change(last.p.price ?? 0, prev?.p.price)} />
              <Kpi label='Satış (aylık)' value={fmt.int(last.p.salesAdjusted)} d={change(last.p.salesAdjusted ?? 0, prev?.p.salesAdjusted)} />
              <Kpi label='Ciro' value={fmt.money(last.p.revenueCalc)} d={change(last.p.revenueCalc, prev?.p.revenueCalc)} />
              <Kpi label='BSR' value={fmt.int(last.p.bsr)} d={change(last.p.bsr ?? 0, prev?.p.bsr)} invert />
            </div>

            {history!.length > 1 && (
              <div className='grid gap-4 lg:grid-cols-2'>
                <ChartCard title='Ciro ve satış' data={chart} lines={[['Ciro', '#2563eb', 'left'], ['Satış', '#16a34a', 'right']]} />
                <ChartCard title='Fiyat ve BSR' data={chart} lines={[['Fiyat', '#d97706', 'left'], ['BSR', '#7c3aed', 'right']]} reversedRight />
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Rapor geçmişi</CardTitle>
                <CardDescription>Değeri değiştirmek için raporu açın.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Rapor</TableHead>
                      <TableHead className='text-right'>Price</TableHead>
                      <TableHead className='text-right'>ASIN Sales</TableHead>
                      <TableHead className='text-right'>ASIN Revenue</TableHead>
                      <TableHead className='text-right'>BSR</TableHead>
                      <TableHead className='text-right'>Reviews</TableHead>
                      <TableHead className='text-right'>Rating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...history!].reverse().map(({ p, r }: Point) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatDateTR(r.date)}</TableCell>
                        <TableCell>
                          <Link to='/raporlar/$id' params={{ id: String(r.id) }} className='hover:underline'>{r.brand}</Link>
                          {p.edits && <Badge variant='outline' className='ms-1'>düzenlendi</Badge>}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.money2(p.price)}</TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.int(p.salesAdjusted)}</TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.money(p.revenueCalc)}</TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.int(p.bsr)}</TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.int(p.reviews)}</TableCell>
                        <TableCell className='text-right tabular-nums'>{fmt.dec(p.rating)}</TableCell>
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

function Kpi({ label, value, d, invert }: { label: string; value: string; d: number | null; invert?: boolean }) {
  const good = d !== null && (invert ? d < 0 : d > 0)
  return (
    <Card>
      <CardHeader className='pb-2'><CardDescription>{label}</CardDescription></CardHeader>
      <CardContent>
        <div className='text-2xl font-bold tabular-nums'>{value}</div>
        <p className={`text-xs tabular-nums ${d === null ? 'text-muted-foreground' : good ? 'text-emerald-600' : 'text-red-600'}`}>
          {d === null ? 'önceki rapor yok' : `${fmt.delta(d)} önceki rapora göre`}
        </p>
      </CardContent>
    </Card>
  )
}

function ChartCard({ title, data, lines, reversedRight }: {
  title: string
  data: Record<string, unknown>[]
  lines: [string, string, 'left' | 'right'][]
  reversedRight?: boolean
}) {
  return (
    <Card>
      <CardHeader><CardTitle className='text-base'>{title}</CardTitle></CardHeader>
      <CardContent className='h-64 ps-0'>
        <ResponsiveContainer width='100%' height='100%' initialDimension={{ width: 1, height: 1 }}>
          <LineChart data={data}>
            <CartesianGrid vertical={false} strokeOpacity={0.3} />
            <XAxis dataKey='date' fontSize={12} tickLine={false} axisLine={false} />
            <YAxis yAxisId='left' fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmt.compact(v)} />
            <YAxis yAxisId='right' orientation='right' reversed={reversedRight} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => fmt.compact(v)} />
            <Tooltip />
            {lines.map(([key, color, axis]) => (
              <Line key={key} yAxisId={axis} dataKey={key} stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
