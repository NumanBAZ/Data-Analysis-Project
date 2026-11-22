import * as XLSX from 'xlsx'
import { cleanSheet, type CleanContext, type ParsedSheet, type Row } from './clean'
import { extractImages } from './images'

export const SPREADSHEET_EXTENSIONS = ['xlsx', 'xlsm', 'xls', 'csv']

export function isSpreadsheet(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return SPREADSHEET_EXTENSIONS.includes(ext) && !name.startsWith('~$')
}

/** Bir Excel/CSV dosyasının her sayfasını okuyup temizler. */
export function parseWorkbook(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
  ctx: Omit<CleanContext, 'fileName' | 'sheetName'> = {}
): ParsedSheet[] {
  const isCsv = fileName.toLowerCase().endsWith('.csv')
  const wb = XLSX.read(data, {
    type: 'array',
    dense: true,
    // CSV'de SheetJS'in kendi sayı tahminini kapatıyoruz; ABD formatını biz çözüyoruz.
    raw: isCsv,
    cellDates: true,
  })

  const embedded = isCsv ? new Map() : extractImages(data)

  return wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Row>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    })
    const sheet = cleanSheet(rows, { ...ctx, fileName, sheetName })
    const pics = embedded.get(sheetName)
    const asinHeader = sheet.columnMap.asin
    if (pics && asinHeader && sheet.headerRowIndex >= 0) {
      // Görselin bağlı olduğu satırdaki ASIN'i doğrudan sayfadan okuruz
      const col = (rows[sheet.headerRowIndex] ?? []).findIndex((h) => String(h ?? '').trim() === asinHeader)
      const dense = (ws as { '!data'?: { v?: unknown }[][] })['!data'] ?? []
      const images = new Map<string, { data: Uint8Array; type: string }>()
      for (const p of pics) {
        const asin = String(dense[p.row]?.[col]?.v ?? '').trim().toUpperCase()
        if (asin && !images.has(asin)) images.set(asin, { data: p.data, type: p.type })
      }
      if (images.size) sheet.images = images
    }
    return sheet
  })
}

/** Satır nesnelerini .xlsx dosyasına çevirir. */
export function buildWorkbook(
  sheets: { name: string; rows: Record<string, unknown>[] }[]
): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows)
    const headers = Object.keys(s.rows[0] ?? {})
    ws['!cols'] = headers.map((h) => ({ wch: Math.min(Math.max(h.length + 2, 10), 50) }))
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}
