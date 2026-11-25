import { useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ChevronDown, DollarSign, Package, Pencil, ShoppingCart, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTR } from '@/core/dates'
import { parseUSNumber } from '@/core/number'
import { fold } from '@/core/text'
import type { Product } from '@/core/types'
import { db } from '@/data/db'
import { getCategoryTree, getProducts, loadImages, updateProduct, type EditableField } from '@/data/repo'
import { ALL, byCategory, categoryOptions, totalsOf } from '@/core/filter'
import { buildReportWorkbook, productCsvRows } from '@/core/reports'
import { printPDF, saveExport, toCSV } from '@/lib/export'
import { ExportMenu } from '@/components/export-menu'
import { PrintHeader } from '@/components/print-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { change, fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProductImage } from '@/components/product-image'
import { CategorySelect, useCategoryTree } from '@/components/category-select'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { BrandBadge } from '@/components/brand-badge'

type Col = {
  field: EditableField
  label: string
  kind: 'text' | 'money' | 'int' | 'dec'
  /** Hücre genişliği; metinler tek satırda kısaltılır, tam hali üzerine gelince görünür */
  width: string
}

// Hizalama kuralı: yazılar sola, sayılar sağa (başlık ve hücre aynı)
const COLS: Col[] = [
  { field: 'title', label: 'Product Details', kind: 'text', width: 'w-64 max-w-64' },
  { field: 'brand', label: 'Brand', kind: 'text', width: 'w-32 max-w-32' },
  { field: 'category', label: 'Category', kind: 'text', width: 'w-36 max-w-36' },
  { field: 'price', label: 'Price', kind: 'money', width: 'w-24' },
  { field: 'salesAdjusted', label: 'ASIN Sales', kind: 'int', width: 'w-24' },
  { field: 'bsr', label: 'BSR', kind: 'int', width: 'w-24' },
  { field: 'reviews', label: 'Reviews', kind: 'int', width: 'w-20' },
  { field: 'rating', label: 'Rating', kind: 'dec', width: 'w-20' },
  { field: 'seller', label: 'Seller', kind: 'text', width: 'w-36 max-w-36' },
]
const align = (c: Col) => (c.field === 'brand' ? 'text-center' : c.kind === 'text' ? 'text-left' : 'text-right')

function show(kind: Col['kind'], v: unknown): string {
  if (v === null || v === undefined || v === '') return '–'
  if (kind === 'money') return fmt.money2(v as number)
  if (kind === 'int') return fmt.int(v as number)
  if (kind === 'dec') return fmt.dec(v as number)
  return String(v)
}

export function ReportDetail({ id }: { id: number }) {
  const report = useLiveQuery(() => db.reports.get(id), [id])
  const products = useLiveQuery(() => db.products.where('reportId').equals(id).toArray(), [id])
  // Aynı firmanın bir önceki raporu (kartlardaki değişim için)
  const prev = useLiveQuery(async () => {
    if (!report) return null
    const list = await db.reports.where('brandKey').equals(report.brandKey).toArray()
    return list.filter((r) => r.date < report.date).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  }, [report?.brandKey, report?.date, report?.totals.revenue])
  const [q, setQ] = useState('')
  const [onlyEdited, setOnlyEdited] = useState(false)
  const [category, setCategory] = useState(ALL)
  const catName = category === ALL ? undefined : category

  const tree = useCategoryTree()
  const cats = useMemo(() => categoryOptions(products ?? [], tree), [products, tree])
  const filtered = useMemo(() => byCategory(products ?? [], category, tree), [products, category, tree])
  const totals = useMemo(() => totalsOf(filtered), [filtered])
  // Önceki raporun aynı kategoriye göre toplamları
  const prevTotals = useLiveQuery(async () => {
    if (!prev) return null
    if (!catName) return { ...prev.totals }
    return totalsOf(byCategory(await getProducts([prev.id!]), catName, await getCategoryTree()))
  }, [prev?.id, catName, prev?.totals.revenue, tree])

  const visible = useMemo(() => {
    const f = fold(q)
    return filtered
      .filter((p) => (!onlyEdited || p.edits) && (!f || fold(`${p.asin} ${p.title} ${p.brand} ${p.category} ${p.seller}`).includes(f)))
      .sort((a, b) => b.revenueCalc - a.revenueCalc)
  }, [filtered, q, onlyEdited])

  const baseName = report ? `${report.brand} ${report.date}${catName ? ` ${catName}` : ''}` : 'Rapor'
  const exportExcel = () =>
    report && saveExport(baseName, async () => buildReportWorkbook(report, filtered, await loadImages(filtered.map((p) => p.asin)), { category: catName }))
  const exportCsv = () => {
    const { header, rows } = productCsvRows(filtered)
    return saveExport(baseName, () => toCSV(header, rows), 'csv')
  }

  if (report === undefined && products !== undefined) {
    return <Main><p className='text-muted-foreground'>Rapor bulunamadı.</p></Main>
  }

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div className='no-print flex flex-wrap items-end justify-between gap-2'>
          <div>
            <Button variant='ghost' size='sm' asChild className='-ms-2 mb-1'>
              <Link to='/raporlar'><ArrowLeft /> Raporlar</Link>
            </Button>
            <h2 className='text-2xl font-bold tracking-tight'>
              {report?.brand} · {report ? formatDateTR(report.date) : ''}{catName ? ` · ${catName}` : ''}
            </h2>
            <p className='text-muted-foreground no-print'>
              Hücreye tıklayıp değeri değiştirin, Enter ile kaydedin. Değişiklik veritabanına yazılır; ciro ve rapor toplamları yeniden hesaplanır.
            </p>
          </div>
          <ExportMenu
            note={catName ? `Yalnızca "${catName}" kategorisi aktarılır.` : 'Raporun bütün ürünleri aktarılır.'}
            excel={exportExcel}
            csv={exportCsv}
            pdf={() => printPDF(baseName)}
          />
        </div>
        {report && <PrintHeader title={`${report.brand} · ${formatDateTR(report.date)}`} subtitle={catName ? `Kategori: ${catName}` : 'Bütün kategoriler'} />}

        {report && (
          <div className='grid gap-4 md:grid-cols-3'>
            <Stat
              icon={DollarSign}
              tone='blue'
              label='Ciro'
              value={fmt.money(totals.revenue)}
              delta={change(totals.revenue, prevTotals?.revenue)}
              prevLabel={prev && prevTotals ? `${formatDateTR(prev.date)}: ${fmt.money(prevTotals.revenue)}` : undefined}
              sub={`Ortalama fiyat ${fmt.money2(totals.avgPrice)}${catName && report.totals.revenue ? ` · firma cirosunun ${fmt.pct(totals.revenue / report.totals.revenue)}` : ''}`}
            />
            <Stat
              icon={ShoppingCart}
              tone='green'
              label='Satış (adet)'
              value={fmt.int(totals.sales)}
              delta={change(totals.sales, prevTotals?.sales)}
              prevLabel={prev && prevTotals ? `${formatDateTR(prev.date)}: ${fmt.int(prevTotals.sales)}` : undefined}
              sub={`Ürün başına ${fmt.int(totals.listings ? totals.sales / totals.listings : null)} adet`}
            />
            <Stat
              icon={Package}
              tone='amber'
              label='Listing'
              value={fmt.int(totals.listings)}
              delta={change(totals.listings, prevTotals?.listings)}
              prevLabel={prev && prevTotals ? `${formatDateTR(prev.date)}: ${fmt.int(prevTotals.listings)}` : undefined}
              sub={`${fmt.int(totals.parents)} parent ürün`}
            />
          </div>
        )}

        <div className='no-print flex flex-wrap items-center gap-3'>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className='h-9 w-60'><SelectValue /></SelectTrigger>
            <SelectContent className='max-h-80'>
              <SelectItem value={ALL}>Bütün kategoriler ({fmt.int(products?.length ?? 0)})</SelectItem>
              {cats.map((c) => (
                <SelectItem key={c.category} value={c.category} className={cn(c.isGroup && 'font-semibold')}>
                  <span style={{ paddingInlineStart: c.depth * 16 }}>
                    {c.depth > 0 && <span className='text-muted-foreground'>└ </span>}
                    {c.category}{c.isGroup ? ' (tümü)' : ''} ({c.count}) · {fmt.moneyCompact(c.revenue)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className='h-9 w-72' placeholder='ASIN, ürün, marka ara…' spellCheck={false} autoComplete='off' value={q} onChange={(e) => setQ(e.target.value)} />
          <Button variant={onlyEdited ? 'default' : 'outline'} size='sm' onClick={() => setOnlyEdited((v) => !v)}>
            <Pencil /> Sadece düzenlenenler
          </Button>
          <span className='text-sm text-muted-foreground'>{fmt.int(visible.length)} ürün</span>
        </div>

        <div className='overflow-x-auto rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-28 min-w-28' />
                <TableHead className='w-14 text-left'>Sıra</TableHead>
                <TableHead className='w-28 text-left'>ASIN</TableHead>
                {COLS.map((c) => <TableHead key={c.field} className={cn(c.width, align(c))}>{c.label}</TableHead>)}
                <TableHead className='w-32 text-right'>ASIN Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className='py-1.5'><ProductImage asin={p.asin} url={p.imageUrl} className='size-24 min-w-24 rounded-md border bg-white p-1' /></TableCell>
                  <TableCell className='text-left text-muted-foreground'>{p.displayOrder}</TableCell>
                  <TableCell className='text-left font-mono text-xs'>
                    <Link to='/urun/$asin' params={{ asin: p.asin }} className='underline-offset-2 hover:underline'>{p.asin}</Link>
                  </TableCell>
                  {COLS.map((c) => <EditCell key={c.field} product={p} col={c} />)}
                  <TableCell className='text-right font-medium tabular-nums'>
                    <span title={p.ruleApplied ? 'Son alımlar kuralı uygulandı (satış = son alımlar × çarpan)' : undefined}>
                      {fmt.money(p.revenueCalc)}
                      {p.ruleApplied && <sup className='ms-0.5 text-amber-600'>*</sup>}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Main>
    </>
  )
}

const TONES = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
}

function Stat({ icon: Icon, tone, label, value, delta, prevLabel, sub }: {
  icon: typeof DollarSign
  tone: keyof typeof TONES
  label: string
  value: string
  delta: number | null
  prevLabel?: string
  sub: string
}) {
  const up = delta !== null && delta >= 0
  return (
    <Card className='gap-0 py-5'>
      <CardContent className='space-y-3'>
        <div className='flex items-center justify-between'>
          <span className='text-sm font-medium text-muted-foreground'>{label}</span>
          <span className={cn('flex size-9 items-center justify-center rounded-lg', TONES[tone])}>
            <Icon className='size-5' />
          </span>
        </div>
        <div className='flex items-baseline gap-2'>
          <span className='text-3xl font-bold tracking-tight tabular-nums'>{value}</span>
          {delta !== null && (
            <span className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
              up ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
            )}>
              {up ? <TrendingUp className='size-3' /> : <TrendingDown className='size-3' />}
              {fmt.delta(delta)}
            </span>
          )}
        </div>
        <div className='space-y-0.5 border-t pt-3 text-xs text-muted-foreground'>
          <p>{sub}</p>
          <p>{prevLabel ? `Önceki rapor ${prevLabel}` : 'Bu firmanın önceki raporu yok'}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function EditCell({ product, col }: { product: Product; col: Col }) {
  const current = product[col.field]
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const edit = product.edits?.[col.field]
  const cancelled = useRef(false)

  const start = () => {
    setDraft(current === null || current === undefined ? '' : String(current))
    cancelled.current = false
    setEditing(true)
  }

  const commit = async () => {
    setEditing(false)
    if (cancelled.current) return
    let value: string | number | null
    if (col.kind === 'text') {
      value = draft.trim()
      if (!value && (col.field === 'brand' || col.field === 'category')) return toast.error(`${col.label} boş olamaz.`)
    } else {
      value = draft.trim() === '' ? null : parseUSNumber(draft)
      if (draft.trim() !== '' && value === null) return toast.error(`"${draft}" sayı değil.`)
      if (col.kind === 'int' && value !== null) value = Math.round(value)
    }
    if (value === current) return
    await updateProduct(product.id!, col.field, value)
  }

  return (
    <TableCell
      // Kategori açılır menüden seçilir (el imleci); diğer alanlara yazılır (yazı imleci)
      className={cn(col.field === 'category' ? 'cursor-pointer' : 'cursor-text', 'tabular-nums', col.width, align(col), edit && 'bg-amber-50 dark:bg-amber-950/40')}
      title={[
        col.kind === 'text' && current ? String(current) : '',
        edit ? `Elle değiştirildi. Dosyadaki değer: ${show(col.kind, edit.from)}` : '',
      ].filter(Boolean).join(' · ') || undefined}
      onClick={() => !editing && start()}
    >
      {editing && col.field === 'category' ? (
        // Kategori listeden seçilir; elle yazılamaz
        <CategorySelect
          value={String(current ?? '')}
          open
          onOpenChange={(o) => !o && setEditing(false)}
          onChange={(v) => {
            setEditing(false)
            if (v !== current) void updateProduct(product.id!, 'category', v)
          }}
        />
      ) : editing ? (
        <Input
          spellCheck={false}
          autoComplete='off'
          autoFocus
          className={cn('h-7 w-full min-w-16', align(col))}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              cancelled.current = true
              e.currentTarget.blur()
            }
          }}
        />
      ) : (
        col.field === 'brand' ? <BrandBadge brand={String(current ?? '')} />
        : col.field === 'category' ? (
          // Açılır menü olduğu belli olsun: üzerine gelince kutu ve ok görünür
          <span className='flex h-7 items-center justify-between gap-1 rounded-md border border-transparent px-2 hover:border-input hover:bg-background'>
            <span className='truncate'>{show(col.kind, current)}</span>
            <ChevronDown className='size-3.5 shrink-0 opacity-50' />
          </span>
        )
        : <span className='block truncate'>{show(col.kind, current)}</span>
      )}
    </TableCell>
  )
}
