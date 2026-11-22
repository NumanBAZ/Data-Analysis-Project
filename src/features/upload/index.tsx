import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, CircleX, Info, Loader2, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { brandKey, KNOWN_BRANDS } from '@/core/brands'
import { applyRules, computeTotals } from '@/core/clean'
import { DEFAULT_SETTINGS, type CleanIssue, type Report } from '@/core/types'
import { db, getSettings } from '@/data/db'
import { formatDateTR } from '@/core/dates'
import { saveSheet } from '@/data/repo'
import { fmt } from '@/lib/format'
import type { PickedFile } from '@/lib/platform'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Dropzone } from './dropzone'
import { draftKey, useUploadStore, type Draft } from './store'

const NO_REPORTS: Report[] = []
const ICON = { error: CircleX, warning: AlertTriangle, info: Info }

export function Upload() {
  const navigate = useNavigate()
  const { drafts, skipped, errors, busy, addFiles, update, setDateAll, remove, clear } = useUploadStore()
  const [saving, setSaving] = useState(false)
  const settings = useLiveQuery(getSettings) ?? DEFAULT_SETTINGS
  const reports = useLiveQuery(() => db.reports.toArray()) ?? NO_REPORTS
  const existing = useMemo(() => new Map(reports.map((r) => [`${r.date}|${r.brandKey}`, r])), [reports])

  const brandOptions = useMemo(
    () => [...new Set<string>([...KNOWN_BRANDS, ...reports.map((r) => r.brand)])].sort((a, b) => a.localeCompare(b, 'tr')),
    [reports]
  )

  const included = drafts.filter((d) => d.include)

  const onFiles = async (files: PickedFile[]) => {
    if (!files.length) return toast.warning('Excel veya CSV dosyası bulunamadı.')
    const before = useUploadStore.getState().drafts.length
    const n = await addFiles(files)
    const added = useUploadStore.getState().drafts.slice(before)
    const dups = added.filter((d) => d.duplicateOf?.length)
    for (const d of dups) {
      const first = d.duplicateOf![0]
      toast.warning(`"${d.sheet.fileName}" daha önce yüklenmiş`, {
        description: `${first.brand} · ${formatDateTR(first.date)} raporu olarak, ${new Date(first.importedAt).toLocaleString('tr-TR')} tarihinde. Kaydetmek isterseniz satırı işaretleyin.`,
        duration: 10000,
      })
    }
    if (n > dups.length) toast.success(`${n - dups.length} firma raporu okundu. Tarihi kontrol edip kaydedin.`)
  }

  const saveAll = async () => {
    const keys = included.map(draftKey)
    if (new Set(keys).size !== keys.length)
      return toast.error('Aynı firma ve tarih için birden fazla rapor seçili.')
    setSaving(true)
    try {
      for (const d of included) {
        await saveSheet(d.sheet, {
          brand: d.brand.trim(),
          date: d.date,
          settings,
          products: d.products,
          replaceId: existing.get(draftKey(d))?.id,
        })
      }
      toast.success(`${included.length} rapor kaydedildi.`)
      clear()
      navigate({ to: '/raporlar' })
    } catch (e) {
      toast.error(`Kaydedilemedi: ${e instanceof Error ? e.message : e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Dosya Yükle</h2>
            <p className='text-muted-foreground'>
              Helium 10 Xray dosyalarını ekleyin. Sütunlar ve firmalar otomatik bulunur, kaydetmeden önce kontrol edebilirsiniz.
            </p>
          </div>
          {drafts.length > 0 && (
            <div className='flex items-end gap-2'>
              <div className='space-y-1'>
                <Label htmlFor='date-all'>Hepsinin tarihi</Label>
                <Input id='date-all' type='date' className='w-44' onChange={(e) => e.target.value && setDateAll(e.target.value)} />
              </div>
              <Button variant='outline' onClick={clear} disabled={saving}>
                Temizle
              </Button>
              <Button onClick={saveAll} disabled={saving || !included.length}>
                {saving ? <Loader2 className='animate-spin' /> : <Save />}
                {included.length} raporu kaydet
              </Button>
            </div>
          )}
        </div>

        <Dropzone busy={busy} onFiles={onFiles} />

        {errors.map((e) => (
          <p key={e.name} className='text-sm text-destructive'>
            {e.name}: dosya açılamadı ({e.message})
          </p>
        ))}

        {drafts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Kaydedilmeyi bekleyenler</CardTitle>
              <CardDescription>
                Her satır bir firmadır. Dosya adında tarih olmadığı için rapor tarihini kontrol edin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-hidden rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-10' />
                      <TableHead>Firma</TableHead>
                      <TableHead>Dosya</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead className='text-right'>Ürün</TableHead>
                      <TableHead className='text-right'>Ciro</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className='w-10' />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drafts.map((d) => (
                      <DraftRow
                        key={d.id}
                        draft={d}
                        listId='brand-options'
                        replaces={existing.get(draftKey(d))}
                        rule={settings.rule}
                        onChange={(p) => update(d.id, p)}
                        onRemove={() => remove(d.id)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <datalist id='brand-options'>
                {brandOptions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </CardContent>
          </Card>
        )}

        {drafts.length > 0 && <CleaningReport drafts={drafts} />}

        {skipped.length > 0 && (
          <p className='text-sm text-muted-foreground'>
            Atlanan sayfalar: {skipped.map((s) => `${s.fileName} / ${s.sheetName}`).join(', ')} (ürün tablosu yok)
          </p>
        )}
      </Main>
    </>
  )
}

function DraftRow({
  draft,
  listId,
  replaces,
  rule,
  onChange,
  onRemove,
}: {
  draft: Draft
  listId: string
  replaces?: Report
  rule: typeof DEFAULT_SETTINGS.rule
  onChange: (p: Partial<Pick<Draft, 'brand' | 'date' | 'include'>>) => void
  onRemove: () => void
}) {
  const totals = useMemo(
    () => computeTotals(applyRules(draft.products, brandKey(draft.brand), rule).products),
    [draft.products, draft.brand, rule]
  )
  return (
    <TableRow data-state={draft.include ? undefined : 'disabled'} className={draft.include ? '' : 'opacity-50'}>
      <TableCell>
        <Checkbox checked={draft.include} onCheckedChange={(v) => onChange({ include: v === true })} aria-label='Kaydet' />
      </TableCell>
      <TableCell>
        <Input className='h-8 w-40' list={listId} value={draft.brand} onChange={(e) => onChange({ brand: e.target.value })} />
      </TableCell>
      <TableCell className='max-w-56 truncate text-muted-foreground' title={draft.sheet.fileName}>
        {draft.sheet.fileName}
      </TableCell>
      <TableCell>
        <Input className='h-8 w-40' type='date' value={draft.date} onChange={(e) => onChange({ date: e.target.value })} />
      </TableCell>
      <TableCell className='text-right tabular-nums'>{fmt.int(totals.listings)}</TableCell>
      <TableCell className='text-right font-medium tabular-nums'>{fmt.money(totals.revenue)}</TableCell>
      <TableCell>
        <div className='flex flex-wrap gap-1'>
          {draft.duplicateOf?.length ? (
            <Badge
              variant='destructive'
              title={draft.duplicateOf.map((x) => `${x.brand} · ${formatDateTR(x.date)} (yükleme: ${new Date(x.importedAt).toLocaleString('tr-TR')})`).join(' | ')}
            >
              {draft.duplicateOf[0].exact ? 'Bu dosya zaten yüklü' : 'Aynı adlı dosya yüklü'} · {formatDateTR(draft.duplicateOf[0].date)}
            </Badge>
          ) : null}
          {replaces ? <Badge variant='outline'>Eskisinin yerine geçer</Badge> : <Badge variant='secondary'>Yeni</Badge>}
        </div>
      </TableCell>
      <TableCell>
        <Button variant='ghost' size='icon' onClick={onRemove} aria-label='Çıkar'>
          <Trash2 />
        </Button>
      </TableCell>
    </TableRow>
  )
}

/** Dosya başına temizleme notları (her dosya bir kez). */
function CleaningReport({ drafts }: { drafts: Draft[] }) {
  const sheets = [...new Map(drafts.map((d) => [d.sheet.uid, d.sheet])).values()]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Temizleme raporu</CardTitle>
        <CardDescription>Dosyalarda neyin düzeltildiği ve dikkat edilmesi gerekenler.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        {sheets.map((s) => (
          <div key={s.uid} className='space-y-2'>
            <p className='font-medium'>
              {s.fileName} <span className='text-muted-foreground'>({Object.keys(s.columnMap).length} sütun tanındı, {s.products.length} ürün)</span>
            </p>
            <ul className='space-y-1 text-sm'>
              {s.issues.map((iss: CleanIssue, i: number) => {
                const Icon = ICON[iss.level]
                return (
                  <li key={i} className='flex gap-2'>
                    <Icon className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
                    <span>
                      {iss.message}
                      {iss.count ? <Badge variant='secondary' className='ms-2'>{fmt.int(iss.count)}</Badge> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
