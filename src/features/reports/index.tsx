import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { FileDown, FileSpreadsheet, FileUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTR } from '@/core/dates'
import { PARENT_BRANDS } from '@/core/brands'
import { db } from '@/data/db'
import { deleteReport, getCategoryList, getProducts, loadImages } from '@/data/repo'
import { buildAnnualWorkbook, buildReportWorkbook, buildSheetsWorkbook, buildSummaryWorkbook } from '@/core/reports'
import type { Product, Report, ReportTotals } from '@/core/types'
import { ALL, totalsOf } from '@/core/filter'
import { saveExport } from '@/lib/export'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { change, fmt } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { BrandBadge } from '@/components/brand-badge'

export function Reports() {
  const reports = useLiveQuery(() => db.reports.orderBy('date').reverse().toArray())

  const [busy, setBusy] = useState(false)
  const companies = [...new Set((reports ?? []).map((r) => r.brand))].sort((a, b) => a.localeCompare(b, 'tr'))
  const [company, setCompany] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const catList = useLiveQuery(getCategoryList) ?? []
  const catName = category === ALL ? undefined : category

  // Kategori seçiliyse her raporun o kategorideki toplamları (kategori sütunu indeksli, hızlı)
  const catTotals = useLiveQuery(async () => {
    if (!catName) return null
    const products = await db.products.where('category').equals(catName).toArray()
    const by = new Map<number, Product[]>()
    for (const p of products) {
      if (!by.has(p.reportId)) by.set(p.reportId, [])
      by.get(p.reportId)!.push(p)
    }
    return new Map([...by].map(([id, list]) => [id, totalsOf(list)]))
  }, [catName])

  const rows = useMemo(() => {
    const list = (reports ?? []).filter((r) => company === ALL || r.brand === company)
    return list
      .map((r) => ({ r, t: catName ? (catTotals?.get(r.id!) ?? EMPTY_TOTALS) : r.totals }))
      // Kategori seçiliyse o kategoride ürünü olmayan raporlar gizlenir
      .filter((x) => !catName || x.t.listings > 0)
  }, [reports, company, catName, catTotals])
  const filtering = company !== ALL || !!catName

  /** Excel üretir, kaydettirir; kaydedilince "Aç" düğmesi gösterir */
  const exportExcel = async (name: string, build: () => Promise<Uint8Array>) => {
    setBusy(true)
    await saveExport(name.replace(/\.xlsx$/, ''), build)
    setBusy(false)
  }

  const exportFiltered = () =>
    exportExcel(`Raporlar ${company === ALL ? 'Butun firmalar' : company}${catName ? ` ${catName}` : ''}`, () =>
      buildSheetsWorkbook([{
        name: 'Raporlar',
        header: ['Tarih', 'Firma', 'Kategori', 'Ciro', 'Satış', 'Listing', 'Parent', 'Ort. fiyat', 'Dosya'],
        rows: rows.map(({ r, t }) => [r.date.split('-').reverse().join('.'), r.brand, catName ?? 'Bütün kategoriler', t.revenue, t.sales, t.listings, t.parents, t.sales ? t.revenue / t.sales : null, r.fileName]),
        kinds: ['text', 'text', 'text', 'money', 'int', 'int', 'int', 'money', 'text'],
        widths: [12, 18, 20, 14, 10, 9, 9, 11, 40],
      }])
    )

  const productsOf = async (list: Report[]) => {
    const all = await getProducts(list.map((r) => r.id!))
    const m = new Map<number, Product[]>()
    for (const p of all) {
      if (!m.has(p.reportId)) m.set(p.reportId, [])
      m.get(p.reportId)!.push(p)
    }
    return m
  }

  const exportSummary = () =>
    exportExcel(`Ozet ${new Date().toISOString().slice(0, 10)}.xlsx`, async () => {
      const list = reports ?? []
      return buildSummaryWorkbook(list, await productsOf(list))
    })

  const exportAnnual = (company: string) =>
    exportExcel(`${company} Yillik Rapor.xlsx`, async () => {
      const list = (reports ?? []).filter((r) => r.brand === company)
      const byReport = await productsOf(list)
      const images = await loadImages([...byReport.values()].flat().map((p) => p.asin))
      return buildAnnualWorkbook(list, byReport, images)
    })

  const exportReport = (r: Report) =>
    exportExcel(`${r.brand} ${r.date}.xlsx`, async () => {
      const products = await getProducts([r.id!])
      return buildReportWorkbook(r, products, await loadImages(products.map((p) => p.asin)))
    })

  const remove = async (id: number, name: string) => {
    if (!window.confirm(`"${name}" raporu silinsin mi? Bu işlem geri alınamaz.`)) return
    await deleteReport(id)
    toast.success('Rapor silindi.')
  }

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Raporlar</h2>
            <p className='text-muted-foreground'>Yüklenen bütün raporlar, en yeniden eskiye.</p>
          </div>
          <div className='flex flex-wrap gap-2'>
          <Button variant='outline' disabled={busy || !reports?.length} onClick={() => void exportSummary()}>
            <FileSpreadsheet />
            Özet Excel
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' disabled={busy || !companies.length}>
                <FileDown />
                Yıllık rapor
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuLabel>Firma seçin</DropdownMenuLabel>
              {companies.map((c) => (
                <DropdownMenuItem key={c} onClick={() => void exportAnnual(c)}>{c}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild>
            <Link to='/yukle'>
              <FileUp />
              Dosya Yükle
            </Link>
          </Button>
          </div>
        </div>

        <div className='flex flex-wrap items-end gap-3'>
          <div className='space-y-1'>
            <Label>Firma</Label>
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger className='w-48'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Bütün firmalar</SelectItem>
                {companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <Label>Kategori</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className='w-56'><SelectValue /></SelectTrigger>
              <SelectContent className='max-h-80'>
                <SelectItem value={ALL}>Bütün kategoriler</SelectItem>
                {catList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {filtering && (
            <Button variant='ghost' onClick={() => { setCompany(ALL); setCategory(ALL) }}>Filtreyi temizle</Button>
          )}
          <Button variant='outline' className='ms-auto' disabled={busy || !rows.length} onClick={() => void exportFiltered()}>
            <FileSpreadsheet /> Bu tabloyu Excel'e aktar
          </Button>
        </div>

        {company !== ALL && rows.length > 0 && <FilterSummary company={company} category={catName} rows={rows} />}

        <div className='overflow-hidden rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>Dosya</TableHead>
                <TableHead>Kaynak</TableHead>
                <TableHead className='text-right'>Ürün</TableHead>
                <TableHead className='text-right'>Satış</TableHead>
                <TableHead className='text-right'>Ciro{catName ? ` (${catName})` : ''}</TableHead>
                <TableHead className='w-20' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className='h-24 text-center text-muted-foreground'>
                    {reports.length === 0 ? 'Henüz rapor yok.' : 'Bu filtreye uyan rapor yok.'}
                  </TableCell>
                </TableRow>
              )}
              {rows.map(({ r, t }) => (
                <TableRow key={r.id}>
                  <TableCell>{formatDateTR(r.date)}</TableCell>
                  <TableCell className='font-medium'>
                    <Link to='/raporlar/$id' params={{ id: String(r.id) }} title='Raporu aç ve düzenle' aria-label={r.brand}><BrandBadge brand={r.brand} className='cursor-pointer text-sm hover:opacity-80' /></Link>
                    {PARENT_BRANDS[r.brandKey] && <span className='ms-1 text-xs text-muted-foreground'>({PARENT_BRANDS[r.brandKey]} alt markası)</span>}
                    {r.editCount ? <Badge variant='outline' className='ms-2'>{r.editCount} düzenleme</Badge> : null}
                  </TableCell>
                  <TableCell className='max-w-64 truncate text-muted-foreground'>{r.fileName}</TableCell>
                  <TableCell>
                    <Badge variant={r.source === 'v4' ? 'outline' : 'secondary'}>
                      {r.source === 'v4' ? 'Eski uygulama' : 'Yüklendi'}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{fmt.int(t.listings)}</TableCell>
                  <TableCell className='text-right tabular-nums'>{fmt.int(t.sales)}</TableCell>
                  <TableCell className='text-right font-medium tabular-nums'>{fmt.money(t.revenue)}</TableCell>
                  <TableCell className='whitespace-nowrap'>
                    <Button variant='ghost' size='icon' aria-label='Excel indir' title='Bu raporu Excel olarak kaydet' disabled={busy} onClick={() => void exportReport(r)}>
                      <FileDown />
                    </Button>
                    <Button variant='ghost' size='icon' aria-label='Sil' onClick={() => remove(r.id!, `${r.brand} ${formatDateTR(r.date)}`)}>
                      <Trash2 />
                    </Button>
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

const EMPTY_TOTALS: ReportTotals = { revenue: 0, sales: 0, listings: 0, parents: 0 }

/** Firma (+ kategori) seçilince: son raporun ciro / satış / listing kartları, bir öncekine göre değişim */
function FilterSummary({ company, category, rows }: { company: string; category?: string; rows: { r: Report; t: ReportTotals }[] }) {
  // rows en yeniden eskiye
  const [last, prev] = rows
  const items: { label: string; v: number; p?: number; f: (n: number) => string }[] = [
    { label: 'Ciro', v: last.t.revenue, p: prev?.t.revenue, f: fmt.money },
    { label: 'Satış (adet)', v: last.t.sales, p: prev?.t.sales, f: fmt.int },
    { label: 'Listing', v: last.t.listings, p: prev?.t.listings, f: fmt.int },
    { label: 'Ortalama fiyat', v: last.t.sales ? last.t.revenue / last.t.sales : 0, p: prev && prev.t.sales ? prev.t.revenue / prev.t.sales : undefined, f: fmt.money2 },
  ]
  return (
    <div className='space-y-2'>
      <p className='text-sm text-muted-foreground'>
        <span className='font-medium text-foreground'>{company}{category ? ` · ${category}` : ''}</span> — son rapor {formatDateTR(last.r.date)}
        {prev ? `, önceki ${formatDateTR(prev.r.date)} ile karşılaştırma` : ''}
      </p>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {items.map((k) => {
          const d = change(k.v, k.p)
          return (
            <Card key={k.label}>
              <CardHeader className='pb-2'><CardDescription>{k.label}</CardDescription></CardHeader>
              <CardContent>
                <div className='text-2xl font-bold tabular-nums'>{k.f(k.v)}</div>
                <p className='text-xs tabular-nums text-muted-foreground'>
                  {k.p === undefined ? 'önceki rapor yok' : <>önce {k.f(k.p)} · <span className={cn(d !== null && (d >= 0 ? 'text-emerald-600' : 'text-red-600'))}>{fmt.delta(d)}</span></>}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
