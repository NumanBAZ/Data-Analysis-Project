import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, ArrowUpDown, PackageSearch, ShoppingCart, Star, Store } from 'lucide-react'
import { brandKey } from '@/core/brands'
import { UNDEFINED_CATEGORY } from '@/core/clean'
import { formatDateTR } from '@/core/dates'
import { ALL, byCategory, categoryOf, categoryOptions } from '@/core/filter'
import { fold } from '@/core/text'
import type { Product, Report } from '@/core/types'
import { db, getSettings } from '@/data/db'
import { getProducts } from '@/data/repo'
import { fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BrandBadge } from '@/components/brand-badge'
import { useCategoryTree } from '@/components/category-select'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProductImage } from '@/components/product-image'
import { Search } from '@/components/search'
import { StatCard } from '@/components/stat-card'
import { ThemeSwitch } from '@/components/theme-switch'

const PAGE = 50

/** Ürünün bizim kategorilerimizle ilişkisi */
type Coverage = 'gap' | 'have' | 'unknown'

type Row = {
  p: Product
  company: string
  date: string
  coverage: Coverage
  /** Aynı kategoride bizim ürün sayımız */
  ownCount: number
  /** 0–100: satış, yorum sayısı ve puanın rakip ürünler içindeki sırasından */
  score: number
}

type SortKey = 'score' | 'price' | 'sales' | 'revenue' | 'reviews' | 'rating' | 'bsr'
const SORT_VALUE: Record<SortKey, (r: Row) => number | null> = {
  score: (r) => r.score,
  price: (r) => r.p.price,
  sales: (r) => r.p.salesAdjusted,
  revenue: (r) => r.p.revenueCalc,
  reviews: (r) => r.p.reviews,
  rating: (r) => r.p.rating,
  bsr: (r) => r.p.bsr,
}
/** BSR'de küçük olan iyidir */
const FIRST_DIR: Partial<Record<SortKey, 'asc'>> = { bsr: 'asc' }

/** Her firmanın en son raporu */
function latestReports(all: Report[]): Report[] {
  const by = new Map<string, Report>()
  for (const r of all) if (!by.has(r.brand) || by.get(r.brand)!.date < r.date) by.set(r.brand, r)
  return [...by.values()]
}

/** Değerin listedeki yüzdelik sırası (0–1); boş değer 0 */
function percentiles(values: (number | null)[]): number[] {
  const sorted = values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b)
  if (!sorted.length) return values.map(() => 0)
  return values.map((v) => {
    if (v === null || !Number.isFinite(v)) return 0
    // v'den küçük olanların sayısı (ikili arama)
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] < v) lo = mid + 1
      else hi = mid
    }
    return sorted.length > 1 ? lo / (sorted.length - 1) : 1
  })
}

function SortHead({ label, k, sort, onClick, className, title }: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: 'desc' | 'asc' }
  onClick: (k: SortKey) => void
  className?: string
  title?: string
}) {
  const active = sort.key === k
  const Icon = !active ? ArrowUpDown : sort.dir === 'desc' ? ArrowDown : ArrowUp
  return (
    <TableHead className={cn('text-right', className)} title={title}>
      <button type='button' onClick={() => onClick(k)}
        className={cn('inline-flex items-center gap-1 rounded px-1 py-0.5 whitespace-nowrap hover:bg-muted', active ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
        <Icon className='size-3.5' />
      </button>
    </TableHead>
  )
}

export function ProductAnalysis() {
  const reports = useLiveQuery(() => db.reports.toArray())
  const settings = useLiveQuery(() => getSettings())
  const tree = useCategoryTree()
  const ownKeys = useMemo(() => new Set((settings?.ownBrands ?? []).map(brandKey)), [settings])

  const latest = useMemo(() => latestReports(reports ?? []), [reports])
  const products = useLiveQuery(() => getProducts(latest.map((r) => r.id!)), [latest.map((r) => r.id).join(',')])

  // Bizim ve rakip ürünler: firma raporuna göre; markası elle bizim markaya çevrilen ürün de bizimdir
  const { own, rivals } = useMemo(() => {
    const byId = new Map(latest.map((r) => [r.id!, r]))
    const own: Product[] = []
    const rivals: { p: Product; r: Report }[] = []
    for (const p of products ?? []) {
      const r = byId.get(p.reportId)
      if (!r) continue
      if (ownKeys.has(r.brandKey) || ownKeys.has(p.brandKey)) own.push(p)
      else rivals.push({ p, r })
    }
    return { own, rivals }
  }, [products, latest, ownKeys])

  // Bütün rakip ürünler: kapsama + skor
  const allRows = useMemo<Row[]>(() => {
    const ownCats = new Map<string, number>()
    for (const p of own) ownCats.set(categoryOf(p), (ownCats.get(categoryOf(p)) ?? 0) + 1)
    const sales = percentiles(rivals.map(({ p }) => p.salesAdjusted))
    const reviews = percentiles(rivals.map(({ p }) => p.reviews))
    const rating = percentiles(rivals.map(({ p }) => p.rating))
    return rivals.map(({ p, r }, i) => {
      const cat = categoryOf(p)
      const ownCount = ownCats.get(cat) ?? 0
      const coverage: Coverage = cat === UNDEFINED_CATEGORY ? 'unknown' : ownCount > 0 ? 'have' : 'gap'
      return {
        p, company: r.brand, date: r.date, coverage, ownCount,
        score: Math.round(100 * (0.5 * sales[i] + 0.3 * reviews[i] + 0.2 * rating[i])),
      }
    })
  }, [own, rivals])

  const companies = useMemo(() => [...new Set(allRows.map((r) => r.company))].sort((a, b) => a.localeCompare(b, 'tr')), [allRows])

  const [show, setShow] = useState<'gap' | 'all'>('gap')
  const [company, setCompany] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [q, setQ] = useState('')
  const [minReviews, setMinReviews] = useState('0')
  const [shown, setShown] = useState(PAGE)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'desc' | 'asc' }>({ key: 'score', dir: 'desc' })
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: FIRST_DIR[key] ?? 'desc' }))

  // Firma + gösterim süzgeci (kategori seçenekleri bunlara göre)
  const base = useMemo(
    () => allRows.filter((r) => (show === 'all' || r.coverage === 'gap') && (company === ALL || r.company === company)),
    [allRows, show, company],
  )
  const catOptions = useMemo(() => categoryOptions(base.map((r) => r.p), tree), [base, tree])
  const activeCat = category !== ALL && catOptions.some((c) => c.category === category) ? category : ALL

  const filtered = useMemo(() => {
    const inCat = new Set(byCategory(base.map((r) => r.p), activeCat, tree))
    const f = fold(q)
    const min = Number(minReviews) || 0
    const v = SORT_VALUE[sort.key]
    const sign = sort.dir === 'desc' ? -1 : 1
    return base
      .filter((r) => inCat.has(r.p) && (r.p.reviews ?? 0) >= min &&
        (!f || fold(`${r.p.asin} ${r.p.title} ${r.p.brand} ${r.company} ${r.p.category}`).includes(f)))
      .sort((a, b) => {
        const x = v(a)
        const y = v(b)
        // Boş değerler her iki yönde de en alta; eşitlikte skor
        if (x === null || y === null) return x === y ? b.score - a.score : x === null ? 1 : -1
        return sign * (x - y) || b.score - a.score
      })
  }, [base, activeCat, tree, q, minReviews, sort])

  const top = filtered.slice(0, shown)
  const resetPage = () => setShown(PAGE)

  // Özet: bizde olmayan rakip ürünler
  const gaps = allRows.filter((r) => r.coverage === 'gap')
  const gapCats = new Set(gaps.map((r) => categoryOf(r.p)))
  const gapRevenue = gaps.reduce((s, r) => s + (r.p.revenueCalc || 0), 0)
  const best = filtered[0]

  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Ürün Analizi</h1>
          <p className='text-muted-foreground'>
            Rakiplerin satıp bizim ({(settings?.ownBrands ?? []).join(', ')}) satmadığımız ürünler: en çok satan ve en çok yorum/puan alan en üstte.
            Her firmanın en son raporu kullanılır. "Bizde yok" = bizim markaların o kategoride hiç ürünü yok.
          </p>
        </div>

        {reports && !latest.length ? (
          <Card><CardContent className='py-16 text-center text-muted-foreground'>Henüz rapor yok. Dosya yükleyerek başlayın.</CardContent></Card>
        ) : !products ? (
          <p className='text-sm text-muted-foreground'>Yükleniyor…</p>
        ) : (
          <>
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
              <StatCard icon={PackageSearch} tone='violet' label='Bizde olmayan rakip ürün' value={fmt.int(gaps.length)}
                unit={`/ ${fmt.int(allRows.length)} rakip ürün`}>
                <p>{fmt.int(gapCats.size)} kategoride</p>
              </StatCard>
              <StatCard icon={ShoppingCart} tone='green' label='Bu ürünlerin aylık cirosu' value={fmt.money(gapRevenue)}>
                <p>Yıllık ≈ {fmt.money(gapRevenue * 12)} (tahmini)</p>
              </StatCard>
              <StatCard icon={Store} tone='blue' label='Rakip firma' value={fmt.int(companies.length)}>
                <p className='truncate'>{companies.join(', ')}</p>
              </StatCard>
              <StatCard icon={Star} tone='amber' label='Listede ilk sıradaki' value={best ? fmt.int(best.p.salesAdjusted) : '–'} unit={best ? 'adet / ay' : undefined}>
                {best && <p className='truncate' title={best.p.title}>{best.company} · {best.p.title}</p>}
              </StatCard>
            </div>

            <Card>
              <CardHeader className='space-y-3'>
                <div className='flex flex-wrap items-center gap-2'>
                  <CardTitle className='me-auto'>Rakip ürünler</CardTitle>
                  <Tabs value={show} onValueChange={(v) => { setShow(v as typeof show); resetPage() }}>
                    <TabsList>
                      <TabsTrigger value='gap'>Bizde olmayanlar</TabsTrigger>
                      <TabsTrigger value='all'>Bütün rakip ürünler</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Select value={company} onValueChange={(v) => { setCompany(v); resetPage() }}>
                    <SelectTrigger className='h-9 w-48'><SelectValue /></SelectTrigger>
                    <SelectContent className='max-h-80'>
                      <SelectItem value={ALL}>Bütün rakipler</SelectItem>
                      {companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={activeCat} onValueChange={(v) => { setCategory(v); resetPage() }}>
                    <SelectTrigger className='h-9 w-64'><SelectValue /></SelectTrigger>
                    <SelectContent className='max-h-80'>
                      <SelectItem value={ALL}>Bütün kategoriler</SelectItem>
                      {catOptions.map((c) => (
                        <SelectItem key={c.category} value={c.category} className={cn(c.isGroup && 'font-semibold')}>
                          <span style={{ paddingInlineStart: c.depth * 16 }}>
                            {c.depth > 0 && <span className='text-muted-foreground'>└ </span>}
                            {c.category}{c.isGroup ? ' (tümü)' : ''} ({c.count})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={minReviews} onValueChange={(v) => { setMinReviews(v); resetPage() }}>
                    <SelectTrigger className='h-9 w-44'><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value='0'>Bütün yorum sayıları</SelectItem>
                      <SelectItem value='10'>En az 10 yorum</SelectItem>
                      <SelectItem value='50'>En az 50 yorum</SelectItem>
                      <SelectItem value='100'>En az 100 yorum</SelectItem>
                      <SelectItem value='500'>En az 500 yorum</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className='h-9 w-64' placeholder='ASIN, ürün, marka ara…' spellCheck={false} autoComplete='off'
                    value={q} onChange={(e) => { setQ(e.target.value); resetPage() }} />
                  <span className='ms-auto text-sm text-muted-foreground'>{fmt.int(filtered.length)} ürün</span>
                </div>
                <CardDescription>
                  Skor (0–100): ürünün rakip ürünler arasındaki sırası; satış adedi %50, yorum sayısı (Reviews) %30, puan (Rating) %20 ağırlıklı.
                  Başlıklara tıklayarak başka sütuna göre sıralayabilirsiniz.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-10 text-right'>#</TableHead>
                      <TableHead className='w-14' />
                      <TableHead>Product Details</TableHead>
                      <TableHead>Firma</TableHead>
                      <SortHead label='Skor' k='score' sort={sort} onClick={toggleSort} />
                      <SortHead label='Price' k='price' sort={sort} onClick={toggleSort} />
                      <SortHead label='ASIN Sales' k='sales' sort={sort} onClick={toggleSort} />
                      <SortHead label='ASIN Revenue' k='revenue' sort={sort} onClick={toggleSort} />
                      <SortHead label='Reviews' k='reviews' sort={sort} onClick={toggleSort} />
                      <SortHead label='Rating' k='rating' sort={sort} onClick={toggleSort} />
                      <SortHead label='BSR' k='bsr' sort={sort} onClick={toggleSort} />
                      <TableHead className='text-center'>Bizde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top.map((r, i) => (
                      <TableRow key={r.p.id}>
                        <TableCell className='text-right text-muted-foreground tabular-nums'>{i + 1}.</TableCell>
                        <TableCell><ProductImage asin={r.p.asin} url={r.p.imageUrl} className='size-10 rounded border bg-white' /></TableCell>
                        <TableCell className='max-w-[26rem]'>
                          <Link to='/urun/$asin' params={{ asin: r.p.asin }} className='block truncate text-[13px] font-medium hover:underline' title={r.p.title}>
                            {r.p.title || r.p.asin}
                          </Link>
                          <span className='block truncate text-xs text-muted-foreground'>{r.p.category} · <span className='font-mono'>{r.p.asin}</span></span>
                        </TableCell>
                        <TableCell title={`${formatDateTR(r.date)} raporu`}><BrandBadge brand={r.company} /></TableCell>
                        <TableCell className={cn('text-right tabular-nums', sort.key === 'score' && 'font-semibold')}>{r.score}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', sort.key === 'price' && 'font-medium')}>{fmt.money2(r.p.price)}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', sort.key === 'sales' && 'font-medium')}>{fmt.int(r.p.salesAdjusted)}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', sort.key === 'revenue' && 'font-medium')}>{fmt.money(r.p.revenueCalc)}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', sort.key === 'reviews' && 'font-medium')}>{fmt.int(r.p.reviews)}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', sort.key === 'rating' && 'font-medium')}>{fmt.dec(r.p.rating)}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', sort.key === 'bsr' && 'font-medium')}>{fmt.int(r.p.bsr)}</TableCell>
                        <TableCell className='text-center'>
                          {r.coverage === 'gap' ? (
                            <Badge variant='destructive' title='Bizim markaların bu kategoride ürünü yok'>Yok</Badge>
                          ) : r.coverage === 'have' ? (
                            <Badge variant='secondary' title='Bizim markaların bu kategorideki ürün sayısı'>Var · {r.ownCount}</Badge>
                          ) : (
                            <Badge variant='outline' title='Kategorisi tanımlanmamış; Kategoriler sayfasından tanımlayın'>?</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!top.length && (
                      <TableRow><TableCell colSpan={12} className='py-8 text-center text-muted-foreground'>Ürün yok.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
                <div className='mt-3 flex items-center justify-center gap-3 text-sm text-muted-foreground'>
                  <span>{fmt.int(top.length)} / {fmt.int(filtered.length)} ürün gösteriliyor</span>
                  {top.length < filtered.length && (
                    <>
                      <Button variant='outline' size='sm' onClick={() => setShown((n) => n + PAGE)}>{PAGE} ürün daha göster</Button>
                      <Button variant='ghost' size='sm' onClick={() => setShown(filtered.length)}>Hepsini göster</Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </Main>
    </>
  )
}
