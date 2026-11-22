import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Lightbulb } from 'lucide-react'
import { categoryOf } from '@/core/filter'
import type { Product, Report } from '@/core/types'
import { getProducts } from '@/data/repo'
import { change, fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BrandBadge } from '@/components/brand-badge'

/**
 * Dashboard'daki sade analiz kartları (teknik olmayan okuyucu için):
 * - Özet: dönemin birkaç cümlelik özeti
 * - Kategori pazar payı: seçilen kategoride kim ne kadar satıyor
 * - Rakiplerde ne değişti: yeni / kaybolan ürün, fiyat indirimi / zammı
 */

export type CompanyRow = { company: string; own: boolean; last: Report; prev?: Report }

/** %5'ten küçük fiyat oynamaları değişiklik sayılmaz */
const PRICE_EPS = 0.05

type Moves = { added: Product[]; lost: Product[]; cheaper: Product[]; pricier: Product[] }

function moves(last: Product[], prev: Product[]): Moves {
  const pm = new Map(prev.map((p) => [p.asin, p]))
  const lm = new Map(last.map((p) => [p.asin, p]))
  const out: Moves = { added: [], lost: [], cheaper: [], pricier: [] }
  for (const p of last) {
    const o = pm.get(p.asin)
    if (!o) out.added.push(p)
    else if (p.price != null && o.price != null && o.price > 0) {
      const d = (p.price - o.price) / o.price
      if (d <= -PRICE_EPS) out.cheaper.push(p)
      else if (d >= PRICE_EPS) out.pricier.push(p)
    }
  }
  for (const p of prev) if (!lm.has(p.asin)) out.lost.push(p)
  return out
}

/** Her firmanın son ve önceki raporunun ürünleri */
export function useCompanyProducts(companies: CompanyRow[]) {
  const ids = companies.flatMap((c) => [c.last.id!, ...(c.prev ? [c.prev.id!] : [])])
  return useLiveQuery(async () => {
    const all = await getProducts(ids)
    const m = new Map<number, Product[]>()
    for (const p of all) {
      if (!m.has(p.reportId)) m.set(p.reportId, [])
      m.get(p.reportId)!.push(p)
    }
    return m
  }, [ids.join(',')])
}

// ---------------------------------------------------------------------------
// Özet cümleler
// ---------------------------------------------------------------------------

export function SummaryCard({ companies, byReport, ownGroup }: {
  companies: CompanyRow[]
  byReport?: Map<number, Product[]>
  ownGroup: string
}) {
  const lines = useMemo(() => {
    const out: string[] = []
    const withPrev = companies.filter((c) => c.prev)
    if (!companies.length) return out
    const total = companies.reduce((s, c) => s + c.last.totals.revenue, 0)
    const own = companies.filter((c) => c.own).reduce((s, c) => s + c.last.totals.revenue, 0)

    if (withPrev.length) {
      const now = withPrev.reduce((s, c) => s + c.last.totals.revenue, 0)
      const before = withPrev.reduce((s, c) => s + c.prev!.totals.revenue, 0)
      const d = change(now, before)
      if (d !== null) out.push(`Pazarın toplam cirosu bir önceki rapora göre ${d >= 0 ? 'arttı' : 'azaldı'}: ${fmt.delta(d)} (${fmt.money(before)} → ${fmt.money(now)}).`)

      const ownBefore = withPrev.filter((c) => c.own).reduce((s, c) => s + c.prev!.totals.revenue, 0)
      const ownNow = withPrev.filter((c) => c.own).reduce((s, c) => s + c.last.totals.revenue, 0)
      if (before && now) {
        const pts = (ownNow / now - ownBefore / before) * 100
        out.push(`${ownGroup} pazarın ${fmt.pct(total ? own / total : null)} kadarını satıyor (${fmt.money(own)}); payı önceki rapora göre ${Math.abs(pts).toFixed(1)} puan ${pts >= 0 ? 'arttı' : 'azaldı'}.`)
      }

      const ranked = withPrev
        .map((c) => ({ c, d: change(c.last.totals.revenue, c.prev!.totals.revenue) ?? 0 }))
        .sort((a, b) => b.d - a.d)
      const best = ranked[0]
      const worst = ranked[ranked.length - 1]
      if (best && best.d > 0) out.push(`En çok büyüyen firma ${best.c.company} (${fmt.delta(best.d)}).`)
      if (worst && worst !== best) out.push(`En çok küçülen firma ${worst.c.company} (${fmt.delta(worst.d)}).`)
    } else {
      out.push(`${ownGroup} pazarın ${fmt.pct(total ? own / total : null)} kadarını satıyor (${fmt.money(own)}).`)
    }

    const leader = companies[0]
    if (leader) out.push(`Pazarın lideri ${leader.company}: ${fmt.money(leader.last.totals.revenue)} ciro, payı ${fmt.pct(total ? leader.last.totals.revenue / total : null)}.`)

    if (byReport) {
      // En çok yeni ürün çıkaran rakip
      const rivals = withPrev
        .filter((c) => !c.own)
        .map((c) => ({ c, m: moves(byReport.get(c.last.id!) ?? [], byReport.get(c.prev!.id!) ?? []) }))
      const newest = [...rivals].sort((a, b) => b.m.added.length - a.m.added.length)[0]
      if (newest && newest.m.added.length) out.push(`Rakiplerden en çok yeni ürünü ${newest.c.company} çıkardı (${newest.m.added.length} ürün).`)
      const cutters = [...rivals].sort((a, b) => b.m.cheaper.length - a.m.cheaper.length)[0]
      if (cutters && cutters.m.cheaper.length) out.push(`En çok fiyat indirimi yapan rakip ${cutters.c.company} (${cutters.m.cheaper.length} üründe).`)
    }
    return out
  }, [companies, byReport, ownGroup])

  if (!lines.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'><Lightbulb className='size-5 text-amber-500' /> Bu dönem ne oldu?</CardTitle>
        <CardDescription>Her firmanın son raporu, bir önceki raporuyla karşılaştırıldı</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className='list-disc space-y-1.5 ps-5 text-sm leading-relaxed'>
          {lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Kategori pazar payı
// ---------------------------------------------------------------------------

export function CategoryShareCard({ companies, byReport }: { companies: CompanyRow[]; byReport?: Map<number, Product[]> }) {
  const sumCat = (list: Product[] | undefined, cat: string) =>
    (list ?? []).reduce((s, p) => s + (categoryOf(p) === cat ? p.revenueCalc || 0 : 0), 0)

  // Kategoriler: son raporlardaki ciroya göre büyükten küçüğe
  const cats = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of companies) for (const p of byReport?.get(c.last.id!) ?? []) m.set(categoryOf(p), (m.get(categoryOf(p)) ?? 0) + (p.revenueCalc || 0))
    return [...m].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [companies, byReport])
  const [picked, setPicked] = useState<string>()
  const cat = picked && cats.includes(picked) ? picked : cats[0]

  const rows = useMemo(() => {
    if (!cat || !byReport) return []
    const list = companies.map((c) => ({
      c,
      now: sumCat(byReport.get(c.last.id!), cat),
      before: c.prev ? sumCat(byReport.get(c.prev.id!), cat) : null,
    }))
    const total = list.reduce((s, r) => s + r.now, 0)
    const totalBefore = list.reduce((s, r) => s + (r.before ?? 0), 0)
    return list
      .filter((r) => r.now > 0 || (r.before ?? 0) > 0)
      .map((r) => ({
        ...r,
        share: total ? r.now / total : 0,
        shareBefore: r.before !== null && totalBefore ? r.before / totalBefore : null,
      }))
      .sort((a, b) => b.now - a.now)
  }, [cat, companies, byReport])
  const total = rows.reduce((s, r) => s + r.now, 0)
  const ownShare = rows.filter((r) => r.c.own).reduce((s, r) => s + r.share, 0)

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-2'>
        <div>
          <CardTitle>Kategori pazar payı</CardTitle>
          <CardDescription>
            {cat ? <>{cat} pazarı {fmt.money(total)} · bizim payımız <span className='font-medium text-foreground'>{fmt.pct(ownShare)}</span></> : 'Kategori yok'}
          </CardDescription>
        </div>
        <Select value={cat ?? ''} onValueChange={setPicked}>
          <SelectTrigger className='no-print w-48'><SelectValue placeholder='Kategori' /></SelectTrigger>
          <SelectContent className='max-h-80'>
            {cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className='space-y-2.5'>
        {rows.map((r) => {
          const pts = r.shareBefore !== null ? (r.share - r.shareBefore) * 100 : null
          return (
            <div key={r.c.company} className='space-y-1'>
              <div className='flex items-center justify-between gap-2 text-sm'>
                <span className='flex items-center gap-1.5'>
                  <BrandBadge brand={r.c.company} />
                  {r.c.own && <Badge variant='secondary'>Biz</Badge>}
                </span>
                <span className='tabular-nums text-muted-foreground'>
                  {fmt.money(r.now)} · <span className='font-medium text-foreground'>{fmt.pct(r.share)}</span>
                  {pts !== null && (
                    <span className={cn('ms-1.5 text-xs', pts > 0 ? 'text-emerald-600' : pts < 0 ? 'text-red-600' : '')}>
                      {pts >= 0 ? '▲' : '▼'} {Math.abs(pts).toFixed(1)} puan
                    </span>
                  )}
                </span>
              </div>
              <div className='h-2 rounded bg-muted'>
                <div className={cn('h-2 rounded', r.c.own ? 'bg-[var(--chart-1)]' : 'bg-[var(--chart-2)]')} style={{ width: `${r.share * 100}%` }} />
              </div>
            </div>
          )
        })}
        {rows.length > 0 && <p className='pt-1 text-xs text-muted-foreground'>▲▼: payın bir önceki rapora göre değişimi (yüzde puan).</p>}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Rakiplerde ne değişti?
// ---------------------------------------------------------------------------

export function ChangesCard({ companies, byReport }: { companies: CompanyRow[]; byReport?: Map<number, Product[]> }) {
  const rows = useMemo(() => {
    if (!byReport) return []
    return companies
      .filter((c) => c.prev)
      .map((c) => ({ c, m: moves(byReport.get(c.last.id!) ?? [], byReport.get(c.prev!.id!) ?? []) }))
  }, [companies, byReport])

  const Cell = ({ list, tone }: { list: Product[]; tone: string }) => (
    <TableCell className={cn('text-right tabular-nums', list.length ? tone : 'text-muted-foreground')}
      title={list.slice(0, 8).map((p) => `• ${p.title.slice(0, 70)}`).join('\n') || undefined}>
      {list.length || '–'}
    </TableCell>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Firmalarda ne değişti?</CardTitle>
        <CardDescription>Son rapor, bir öncekiyle karşılaştırıldı · fiyatta %5'ten büyük değişimler · sayının üstüne gelince ürünler görünür</CardDescription>
      </CardHeader>
      <CardContent>
        {!rows.length ? <p className='text-sm text-muted-foreground'>Karşılaştırmak için firmaların en az iki raporu olmalı.</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma</TableHead>
                <TableHead className='text-right'>Yeni ürün</TableHead>
                <TableHead className='text-right'>Kaldırılan</TableHead>
                <TableHead className='text-right'>Fiyat indirdi</TableHead>
                <TableHead className='text-right'>Zam yaptı</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ c, m }) => (
                <TableRow key={c.company}>
                  <TableCell><BrandBadge brand={c.company} /> {c.own && <Badge variant='secondary' className='ms-1'>Biz</Badge>}</TableCell>
                  <Cell list={m.added} tone='text-emerald-600 font-medium' />
                  <Cell list={m.lost} tone='text-red-600 font-medium' />
                  <Cell list={m.cheaper} tone='text-amber-600 font-medium' />
                  <Cell list={m.pricier} tone='text-blue-600 font-medium' />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
