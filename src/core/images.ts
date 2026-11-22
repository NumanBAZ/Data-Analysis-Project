import * as XLSX from 'xlsx'

/**
 * Helium 10 Xray dosyalarında ürün görselleri "Image" sütununa gömülü gelir
 * (xl/media/*.jpeg + xl/drawings/drawingN.xml). V4 bunları openpyxl ile bütün dosyayı
 * açarak çıkardığı için yavaştı; burada sadece zip içindeki birkaç XML okunur (~20 ms).
 */

export type SheetImage = { row: number; col: number; data: Uint8Array; type: string }

type Zip = { FullPaths: string[]; FileIndex: { content?: unknown }[] }

function file(zip: Zip, path: string): Uint8Array | null {
  const i = zip.FullPaths.findIndex((p) => p.toLowerCase().endsWith('/' + path.toLowerCase()))
  if (i < 0) return null
  const c = zip.FileIndex[i].content
  return c ? (c instanceof Uint8Array ? c : new Uint8Array(c as ArrayLike<number>)) : null
}

const text = (zip: Zip, path: string) => {
  const b = file(zip, path)
  return b ? new TextDecoder().decode(b) : null
}

/** "../drawings/drawing1.xml" + "xl/worksheets" → "xl/drawings/drawing1.xml" */
function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/')
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

function rels(zip: Zip, dir: string, name: string): Map<string, string> {
  const xml = text(zip, `${dir}/_rels/${name}.rels`) ?? ''
  const m = new Map<string, string>()
  for (const r of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(r[0])?.[1]
    const target = /Target="([^"]+)"/.exec(r[0])?.[1]
    if (id && target) m.set(id, resolve(dir, target))
  }
  return m
}

const MIME: Record<string, string> = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }

/** Sayfa adı → o sayfaya gömülü görseller (0 tabanlı satır/sütun) */
export function extractImages(data: ArrayBuffer | Uint8Array): Map<string, SheetImage[]> {
  const out = new Map<string, SheetImage[]>()
  let zip: Zip
  try {
    zip = XLSX.CFB.read(data instanceof Uint8Array ? data : new Uint8Array(data), { type: "array" }) as unknown as Zip
  } catch {
    return out // csv / xls
  }
  const wbXml = text(zip, 'xl/workbook.xml')
  if (!wbXml) return out
  const wbRels = rels(zip, 'xl', 'workbook.xml')

  for (const s of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /name="([^"]+)"/.exec(s[0])?.[1]
    const rid = /r:id="([^"]+)"/.exec(s[0])?.[1]
    const sheetPath = rid ? wbRels.get(rid) : undefined
    if (!name || !sheetPath) continue
    const sheetDir = sheetPath.slice(0, sheetPath.lastIndexOf('/'))
    const sheetRels = rels(zip, sheetDir, sheetPath.slice(sheetDir.length + 1))
    const images: SheetImage[] = []

    for (const target of sheetRels.values()) {
      if (!/drawings\/drawing\d*\.xml$/i.test(target)) continue
      const xml = text(zip, target)
      if (!xml) continue
      const dDir = target.slice(0, target.lastIndexOf('/'))
      const dRels = rels(zip, dDir, target.slice(dDir.length + 1))
      for (const a of xml.matchAll(/<xdr:(?:oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:(?:oneCellAnchor|twoCellAnchor)>/g)) {
        const from = /<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(a[0])?.[1] ?? ''
        const col = Number(/<xdr:col>(\d+)<\/xdr:col>/.exec(from)?.[1])
        const row = Number(/<xdr:row>(\d+)<\/xdr:row>/.exec(from)?.[1])
        const embed = /r:embed="([^"]+)"/.exec(a[0])?.[1]
        const media = embed ? dRels.get(embed) : undefined
        const bytes = media ? file(zip, media) : null
        if (!bytes || Number.isNaN(row) || Number.isNaN(col)) continue
        const ext = media!.split('.').pop()!.toLowerCase()
        images.push({ row, col, data: bytes, type: MIME[ext] ?? 'image/jpeg' })
      }
    }
    if (images.length) out.set(name, images)
  }
  return out
}
