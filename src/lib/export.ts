/**
 * Dışa aktarma yardımcıları: Excel/CSV kaydetme ve sayfanın PDF'i (yazdır → "PDF olarak kaydet").
 */
import { toast } from 'sonner'
import { openPath, saveFile } from '@/lib/platform'

const KINDS = {
  xlsx: { name: 'Excel', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  csv: { name: 'CSV', ext: 'csv', mime: 'text/csv;charset=utf-8' },
} as const

/** Dosya adında Windows'un kabul etmediği karakterleri temizler */
export function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Dosyayı üretir, "Farklı kaydet" ile kaydettirir; kaydedilince "Aç" düğmesi gösterir. */
export async function saveExport(name: string, build: () => Promise<Uint8Array> | Uint8Array, kind: keyof typeof KINDS = 'xlsx') {
  try {
    const path = await saveFile(`${safeFileName(name)}.${KINDS[kind].ext}`, await build(), KINDS[kind])
    if (path) toast.success(`${KINDS[kind].name} kaydedildi.`, { action: { label: 'Aç', onClick: () => void openPath(path) } })
  } catch (e) {
    toast.error(`${KINDS[kind].name} oluşturulamadı: ` + (e instanceof Error ? e.message : String(e)))
  }
}

type Cell = string | number | null | undefined

/** UTF-8 (BOM'lu, Excel Türkçe karakterleri doğru açsın) CSV. Sayılar ABD biçiminde, ham. */
export function toCSV(header: string[], rows: Cell[][]): Uint8Array {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : v
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  return new TextEncoder().encode('﻿' + text)
}

/**
 * Sayfanın baskı halini açar; yazıcı olarak "PDF olarak kaydet / Microsoft Print to PDF" seçilir.
 * Kenar çubuğu, üst bar ve düğmeler baskıda gizlenir (index.css @media print).
 * PDF'in varsayılan adı için sayfa başlığı geçici olarak değiştirilir.
 */
export function printPDF(fileName: string) {
  const old = document.title
  document.title = safeFileName(fileName)
  const restore = () => {
    document.title = old
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  // Grafiklerin baskı genişliğine göre yeniden çizilmesi için kısa bekleme
  setTimeout(() => window.print(), 50)
}
