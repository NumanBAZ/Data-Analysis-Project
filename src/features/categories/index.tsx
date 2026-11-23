import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, FolderTree, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { UNDEFINED_CATEGORY } from '@/core/clean'
import { fold } from '@/core/text'
import { db } from '@/data/db'
import { ProductImage } from '@/components/product-image'
import { CategorySelect } from '@/components/category-select'
import { restoreCategory, setCategories, setCategory } from '@/data/repo'
import { CONFIDENT, suggestCategory, trainCategoryModel, type Suggestion } from '@/core/suggest'
import { fmt } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { BrandBadge } from '@/components/brand-badge'

type AsinRow = {
  asin: string
  title: string
  brand: string
  brandKey: string
  imageUrl: string
  category: string
  revenue: number
  reports: number
  /** Elle tanımlandığı zaman */
  definedAt?: string
  suggestion?: Suggestion | null
}

const PAGE = 100

export function Categories() {
  const [tab, setTab] = useState<'undefined' | 'all'>('undefined')
  const [q, setQ] = useState('')

  // ASIN başına tek satır: en son görülen ürün bilgisi + toplam ciro
  const rows = useLiveQuery(async () => {
    const [products, cats] = await Promise.all([db.products.toArray(), db.categories.toArray()])
    const definedAt = new Map(cats.filter((c) => c.definedAt).map((c) => [c.asin, c.definedAt!]))
    const m = new Map<string, AsinRow>()
    for (const p of products) {
      if (!p.asin) continue
      const r = m.get(p.asin)
      if (!r) {
        m.set(p.asin, {
          asin: p.asin, title: p.title, brand: p.brand, brandKey: p.brandKey, imageUrl: p.imageUrl,
          category: p.category, revenue: p.revenueCalc || 0, reports: 1, definedAt: definedAt.get(p.asin),
        })
      } else {
        r.revenue += p.revenueCalc || 0
        r.reports++
        if (!r.imageUrl && p.imageUrl) r.imageUrl = p.imageUrl
      }
    }
    const list = [...m.values()].sort((a, b) => b.revenue - a.revenue)
    // Kategorisi bilinen ürün adlarından öğren, bilinmeyenlere öneri üret
    const model = trainCategoryModel(list.filter((r) => r.category !== UNDEFINED_CATEGORY))
    for (const r of list) if (r.category === UNDEFINED_CATEGORY) r.suggestion = suggestCategory(model, r.title)
    return list
  })
  const confident = (rows ?? []).filter((r) => r.category === UNDEFINED_CATEGORY && (r.suggestion?.confidence ?? 0) >= CONFIDENT)
  const acceptAll = async () => {
    if (!window.confirm(`${confident.length} ürün için emin olunan öneriler kaydedilsin mi?`)) return
    await setCategories(confident.map((r) => ({ asin: r.asin, category: r.suggestion!.category, brandKey: r.brandKey })))
    toast.success(`${confident.length} ürüne kategori verildi.`)
  }

  const undefinedCount = rows?.filter((r) => r.category === UNDEFINED_CATEGORY).length ?? 0

  const visible = useMemo(() => {
    const f = fold(q)
    const list = (rows ?? []).filter((r) =>
      (tab === 'all' || r.category === UNDEFINED_CATEGORY) &&
      (!f || fold(`${r.asin} ${r.title} ${r.brand} ${r.category}`).includes(f))
    )
    // Bütün ASIN'ler: elle tanımlananlar en yeniden eskiye en üstte (yanlışı kolayca düzeltmek için), gerisi ciroya göre
    if (tab === 'all') {
      return [...list].sort((a, b) => (b.definedAt ?? '').localeCompare(a.definedAt ?? '') || b.revenue - a.revenue)
    }
    return list
  }, [rows, tab, q])

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Kategoriler</h2>
          <p className='text-muted-foreground'>
            Kategorisi bilinmeyen ürünlere kategori verin. Atama ASIN'e kaydedilir; o ASIN eski ve yeni bütün raporlarda bu kategoriyle görünür.
            Listeden seçtiğiniz kategori anında kaydedilir; yanlış seçerseniz çıkan bildirimdeki "Geri al"a basın. Öneriler, "kabul et"e basmadıkça kaydedilmez.
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-3'>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value='undefined'>
                Tanımlanmamış <Badge variant={undefinedCount ? 'destructive' : 'secondary'} className='ms-1'>{undefinedCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value='all'>Bütün ASIN'ler</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input className='h-9 w-72' placeholder='ASIN, ürün, marka ara…' spellCheck={false} autoComplete='off' value={q} onChange={(e) => setQ(e.target.value)} />
          <span className='text-sm text-muted-foreground'>{fmt.int(visible.length)} ASIN</span>
          <Button variant='outline' size='sm' asChild>
            <Link to='/ayarlar'><FolderTree /> Kategori ekle / düzenle (Ayarlar)</Link>
          </Button>
          {tab === 'undefined' && confident.length > 0 && (
            <Button size='sm' className='ms-auto' onClick={() => void acceptAll()}>
              <Sparkles /> Emin önerileri kabul et ({confident.length})
            </Button>
          )}
        </div>

        <div className='overflow-hidden rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-28 min-w-28' />
                <TableHead>Ürün</TableHead>
                <TableHead className='w-40 text-center'>Marka</TableHead>
                <TableHead className='w-72'>Kategori</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className='h-24 text-center text-muted-foreground'>
                    {tab === 'undefined' ? 'Bütün ürünlerin kategorisi tanımlı.' : 'Sonuç yok.'}
                  </TableCell>
                </TableRow>
              )}
              {visible.slice(0, PAGE).map((r) => <CategoryRow key={r.asin} row={r} />)}
            </TableBody>
          </Table>
        </div>
        {visible.length > PAGE && (
          <p className='text-sm text-muted-foreground'>İlk {PAGE} satır gösteriliyor (ciroya göre). Aramayla daraltın.</p>
        )}
      </Main>
    </>
  )
}

function CategoryRow({ row }: { row: AsinRow }) {
  const saved = row.category === UNDEFINED_CATEGORY ? '' : row.category
  const [busy, setBusy] = useState(false)

  // Seçince anında kaydedilir (ayrıca kaydet düğmesi yok); yanlış seçim "Geri al" ile döner
  const save = async (category: string) => {
    if (!category || category === saved || busy) return
    setBusy(true)
    const previous = row.category
    try {
      await setCategory(row.asin, category, row.brandKey)
      toast.success(`Kaydedildi: ${category}`, {
        description: row.title.slice(0, 80),
        action: {
          label: 'Geri al',
          onClick: () => void restoreCategory(row.asin, previous, row.brandKey).then(() => toast.info('Geri alındı.')),
        },
      })
    } catch (e) {
      toast.error('Kaydedilemedi: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }
  const suggestion = !saved ? row.suggestion : undefined

  return (
    <TableRow>
      <TableCell>
        <ProductImage asin={row.asin} url={row.imageUrl} className='size-24 min-w-24 rounded-md border bg-white p-1' />
      </TableCell>
      <TableCell className='max-w-[28rem]'>
        <Link to='/urun/$asin' params={{ asin: row.asin }} className='block truncate font-medium hover:underline' title={row.title}>{row.title || '–'}</Link>
        <div className='font-mono text-xs text-muted-foreground'>{row.asin} · {row.reports} rapor</div>
        {row.definedAt && (
          <Badge variant='secondary' className='mt-1' title='Elle tanımlandı'>
            <Check className='size-3' /> Tanımlandı · {definedLabel(row.definedAt)}
          </Badge>
        )}
      </TableCell>
      <TableCell className='text-center'><BrandBadge brand={row.brand} /></TableCell>
      <TableCell>
        <div className='space-y-1.5'>
          <CategorySelect value={saved} onChange={(v) => void save(v)} placeholder='Kategori seçin (seçince kaydedilir)' />
          {suggestion && (
            <Button
              type='button' size='sm' variant={suggestion.confidence >= CONFIDENT ? 'secondary' : 'outline'}
              className='h-7 w-full justify-start text-xs' disabled={busy}
              onClick={() => void save(suggestion.category)}
              title='Öneri henüz kaydedilmedi; kabul etmek için tıklayın'
            >
              <Sparkles className='size-3' /> Öneri: <span className='font-semibold'>{suggestion.category}</span>
              <span className='ms-auto text-muted-foreground'>{fmt.pct(suggestion.confidence, 0)} · kabul et</span>
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

/** "az önce", "12 dk önce", "14.11 15:32" */
function definedLabel(iso: string) {
  const d = new Date(iso)
  const min = Math.floor((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'az önce'
  if (min < 60) return `${min} dk önce`
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

