/**
 * Masaüstü (Tauri) ile tarayıcı arasındaki köprü.
 * Masaüstünde Windows'un kendi dosya gezgini ve "Farklı kaydet" penceresi açılır;
 * tarayıcıda denerken aynı işler HTML yöntemleriyle yapılır.
 */
import { isSpreadsheet, SPREADSHEET_EXTENSIONS } from '@/core/workbook'

export type PickedFile = { name: string; path?: string; data: Uint8Array }

export const isDesktop =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const FILTERS = [{ name: 'Excel / CSV', extensions: SPREADSHEET_EXTENSIONS }]

async function tauri() {
  const [{ invoke }, dialog] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/plugin-dialog'),
  ])
  return { invoke, dialog }
}

function baseName(p: string) {
  return p.split(/[\\/]/).pop() ?? p
}

/** Dosya yollarını (klasörler dahil) okuyup içeriklerini döndürür. Yalnızca masaüstü. */
export async function readPaths(paths: string[]): Promise<PickedFile[]> {
  const { invoke } = await tauri()
  const files = await invoke<string[]>('expand_paths', { paths })
  const out: PickedFile[] = []
  for (const path of files) {
    const buf = await invoke<ArrayBuffer>('read_file', { path })
    out.push({ name: baseName(path), path, data: new Uint8Array(buf) })
  }
  return out
}

function browserPick(directory: boolean): Promise<PickedFile[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    if (directory) input.webkitdirectory = true
    else input.accept = SPREADSHEET_EXTENSIONS.map((e) => `.${e}`).join(',')
    input.onchange = async () => {
      const list = [...(input.files ?? [])].filter((f) => isSpreadsheet(f.name))
      resolve(await filesFromBrowser(list))
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export async function filesFromBrowser(list: File[]): Promise<PickedFile[]> {
  return Promise.all(
    list
      .filter((f) => isSpreadsheet(f.name))
      .map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))
  )
}

/** "Dosya seç": Windows dosya gezginini açar, birden fazla dosya seçilebilir. */
export async function pickFiles(): Promise<PickedFile[] | null> {
  if (!isDesktop) return browserPick(false)
  const { dialog } = await tauri()
  const picked = await dialog.open({ multiple: true, directory: false, filters: FILTERS, title: 'Helium 10 dosyalarını seçin' })
  if (!picked) return null
  return readPaths(Array.isArray(picked) ? picked : [picked])
}

/** "Klasör seç": klasördeki tüm Excel/CSV dosyalarını alır. */
export async function pickFolder(): Promise<PickedFile[] | null> {
  if (!isDesktop) return browserPick(true)
  const { dialog } = await tauri()
  const picked = await dialog.open({ directory: true, multiple: false, title: 'Dosyaların bulunduğu klasörü seçin' })
  if (!picked) return null
  return readPaths([picked as string])
}

export type DropHandlers = {
  onHover: (active: boolean) => void
  onDrop: (files: PickedFile[]) => void
}

/**
 * Masaüstünde dosya gezgininden sürüklenen dosyaları yakalar.
 * (Tauri pencereye bırakılan dosyaları kendisi yakalar; tarayıcı olayları tetiklenmez.)
 */
export async function listenNativeDrop(h: DropHandlers): Promise<() => void> {
  if (!isDesktop) return () => {}
  const { getCurrentWebview } = await import('@tauri-apps/api/webview')
  return getCurrentWebview().onDragDropEvent(async (e) => {
    const p = e.payload
    if (p.type === 'enter' || p.type === 'over') h.onHover(true)
    else if (p.type === 'leave') h.onHover(false)
    else if (p.type === 'drop') {
      h.onHover(false)
      h.onDrop(await readPaths(p.paths))
    }
  })
}

/** "Farklı kaydet" penceresiyle dosya kaydeder. Kaydedilen yolu döndürür. */
export async function saveFile(
  defaultName: string,
  data: Uint8Array,
  kind: { name: string; ext: string; mime: string } = {
    name: 'Excel',
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
): Promise<string | null> {
  if (!isDesktop) {
    const blob = new Blob([data as BlobPart], { type: kind.mime })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = defaultName
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    return defaultName
  }
  const { invoke, dialog } = await tauri()
  const path = await dialog.save({
    defaultPath: defaultName,
    filters: [{ name: kind.name, extensions: [kind.ext] }],
    title: 'Kaydet',
  })
  if (!path) return null
  // Ham bayt gövdesi + yol başlıkta (JSON'a çevirmek büyük dosyalarda çok yavaştı)
  await invoke('write_file', data, { headers: { path: encodeURIComponent(path) } })
  return path
}

/** Kaydedilen dosyayı Windows'ta açar. */
export async function openPath(path: string) {
  if (!isDesktop) return
  const { invoke } = await tauri()
  await invoke('open_path', { path })
}
