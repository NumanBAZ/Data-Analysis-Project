import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DatabaseBackup, FolderOpen, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { type BackupData, createBackupFiles, createSingleFileBackup, readBackup, readBackupFolder, restoreBackup } from '@/data/backup'
import { db } from '@/data/db'
import { fmt } from '@/lib/format'
import { isDesktop, listFiles, openPath, pickDirectory, readFileAt, saveFile, writeFileAt } from '@/lib/platform'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

const LAST_KEY = 'last-backup'

export function Backup() {
  const [busy, setBusy] = useState(false)
  const counts = useLiveQuery(async () => ({
    reports: await db.reports.count(),
    products: await db.products.count(),
    categories: await db.categories.count(),
    images: await db.images.count(),
    last: (await db.kv.get(LAST_KEY))?.value as string | undefined,
  }))

  const stamp = () => new Date().toLocaleString('sv-SE').slice(0, 16).replace(':', '-')

  const backup = async () => {
    setBusy(true)
    try {
      let where: string | null
      let total = 0
      if (isDesktop) {
        const parent = await pickDirectory('Yedek klasörünün oluşturulacağı yeri seçin')
        if (!parent) return
        const { files } = await createBackupFiles()
        where = `${parent.replace(/[\\/]+$/, '')}\\Benasse Yedek ${stamp()}`
        for (const f of files) {
          await writeFileAt(`${where}\\${f.path.split('/').join('\\')}`, f.data)
          total += f.data.length
        }
      } else {
        // Tarayıcıda klasör yazılamaz; tek dosya indirilir
        const data = await createSingleFileBackup()
        total = data.length
        where = await saveFile(`Benasse Yedek ${stamp()}.json`, data, { name: 'Yedek', ext: 'json', mime: 'application/json' })
      }
      if (where) {
        await db.kv.put({ key: LAST_KEY, value: new Date().toISOString() })
        const folder = where
        toast.success(`Yedek klasörü kaydedildi (${(total / 1024 / 1024).toFixed(1)} MB).`, {
          action: { label: 'Klasörü aç', onClick: () => void openPath(folder) },
        })
      }
    } catch (e) {
      toast.error('Yedek alınamadı: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  const confirmAndRestore = async (file: BackupData) => {
    const c = file.counts
    const ok = window.confirm(
      `${new Date(file.createdAt).toLocaleString('tr-TR')} tarihli yedek yüklenecek:\n` +
        `${c.reports} rapor, ${c.products} ürün satırı, ${c.categories} kategorili ASIN, ${c.images} görsel.\n\n` +
        'Şu anki bütün veriler silinip yerine bu yedek konacak. Devam edilsin mi?'
    )
    if (!ok) return
    await restoreBackup(file)
    toast.success('Yedek geri yüklendi.')
  }

  const restoreFolder = async () => {
    const dir = await pickDirectory('Yedek klasörünü seçin (içinde yedek.json olan)')
    if (!dir) return
    setBusy(true)
    try {
      const root = dir.replace(/[\\/]+$/, '')
      const map = new Map<string, Uint8Array>()
      for (const p of await listFiles(root)) {
        const rel = p.slice(root.length + 1).split('\\').join('/')
        map.set(rel, await readFileAt(p))
      }
      await confirmAndRestore(readBackupFolder(map))
    } catch (e) {
      toast.error('Geri yüklenemedi: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  const restoreOldFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      setBusy(true)
      try {
        await confirmAndRestore(readBackup(await f.text()))
      } catch (e) {
        toast.error('Geri yüklenemedi: ' + (e instanceof Error ? e.message : String(e)))
      } finally {
        setBusy(false)
      }
    }
    input.click()
  }

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>

      <Main className='flex flex-1 flex-col gap-4'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Yedekleme</h2>
          <p className='text-muted-foreground'>
            Bütün raporlar, elle yapılan düzeltmeler, kategori kütüphanesi, ayarlar ve görseller bir klasöre ayrı ayrı dosyalar halinde yazılır.
          </p>
        </div>

        <div className='grid gap-4 md:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>Yedek al</CardTitle>
              <CardDescription>
                {counts ? `${fmt.int(counts.reports)} rapor · ${fmt.int(counts.products)} ürün satırı · ${fmt.int(counts.categories)} kategorili ASIN · ${fmt.int(counts.images)} görsel` : '…'}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                Son yedek: {counts?.last ? new Date(counts.last).toLocaleString('tr-TR') : 'hiç alınmadı'}
              </p>
              <Button onClick={() => void backup()} disabled={busy}>
                {busy ? <Loader2 className='animate-spin' /> : <DatabaseBackup />} Yedek klasörü kaydet
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Yedekten geri yükle</CardTitle>
              <CardDescription>Başka bilgisayara taşımak veya bozulan veriyi kurtarmak için.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Alert variant='destructive'>
                <AlertTitle>Dikkat</AlertTitle>
                <AlertDescription>Geri yükleme şu anki verilerin tamamını siler. Önce yedek almanız önerilir.</AlertDescription>
              </Alert>
              <div className='flex flex-wrap gap-2'>
                {isDesktop && (
                  <Button variant='outline' onClick={() => void restoreFolder()} disabled={busy}>
                    <FolderOpen /> Yedek klasörü seç
                  </Button>
                )}
                <Button variant='ghost' onClick={restoreOldFile} disabled={busy}>
                  <Upload /> Eski tek dosya yedek (.json)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
