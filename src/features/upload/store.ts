import { create } from 'zustand'
import { brandKey } from '@/core/brands'
import type { DraftProduct, ParsedSheet } from '@/core/clean'
import { parseWorkbook } from '@/core/workbook'
import { db, getSettings } from '@/data/db'
import { loadCategoryLookup } from '@/data/repo'
import type { PickedFile } from '@/lib/platform'

/**
 * Bir Helium 10 dosyasında birden fazla firma olabilir (ör. Ixir + Magic Chems).
 * Her firma ayrı bir rapor taslağı olur; böylece firmalar karşılaştırılabilir.
 */
export type Draft = {
  id: string
  sheet: ParsedSheet
  products: DraftProduct[]
  brand: string
  date: string
  include: boolean
  /** Bu dosya daha önce yüklendiyse o raporlar (aynı içerik ya da aynı ad) */
  duplicateOf?: { brand: string; date: string; importedAt: string; exact: boolean }[]
}

type UploadState = {
  drafts: Draft[]
  skipped: ParsedSheet[]
  errors: { name: string; message: string }[]
  busy: boolean
  addFiles: (files: PickedFile[]) => Promise<number>
  update: (id: string, patch: Partial<Pick<Draft, 'brand' | 'date' | 'include'>>) => void
  setDateAll: (date: string) => void
  remove: (id: string) => void
  clear: () => void
}

function splitByCompany(sheet: ParsedSheet): Draft[] {
  const groups = new Map<string, DraftProduct[]>()
  for (const p of sheet.products) {
    const k = p.brandKey || 'bilinmiyor'
    const g = groups.get(k)
    if (g) g.push(p)
    else groups.set(k, [p])
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, products]) => ({
      id: `${sheet.uid}::${key}`,
      sheet,
      products,
      brand: products[0].brand || 'Bilinmiyor',
      date: sheet.date,
      include: true,
    }))
}

async function sha256(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const useUploadStore = create<UploadState>((set, get) => ({
  drafts: [],
  skipped: [],
  errors: [],
  busy: false,

  addFiles: async (files) => {
    set({ busy: true })
    const settings = await getSettings()
    const categoryLookup = await loadCategoryLookup()
    const known = new Set(get().drafts.map((d) => d.id))
    const drafts: Draft[] = []
    const skipped: ParsedSheet[] = []
    const errors: UploadState['errors'] = []

    for (const f of files) {
      await new Promise((r) => setTimeout(r, 0)) // arayüz donmasın
      try {
        const fileHash = await sha256(f.data)
        for (const s of parseWorkbook(f.data, f.name, { aliases: settings.aliases, categoryLookup })) {
          s.fileHash = fileHash
          if (s.skipped) {
            skipped.push(s)
            continue
          }
          // Aynı içerik (kesin) veya aynı dosya adı (V4'ten gelenlerde özet yok) daha önce yüklendi mi?
          const [byHash, byName] = await Promise.all([
            db.reports.where('fileHash').equals(fileHash).toArray(),
            db.reports.filter((r) => !r.fileHash && r.fileName === f.name).toArray(),
          ])
          const same = [...byHash, ...byName]
          const duplicateOf = same.map((r) => ({ brand: r.brand, date: r.date, importedAt: r.importedAt, exact: r.fileHash === fileHash }))
          for (const d of splitByCompany(s)) {
            if (known.has(d.id)) continue
            // Daha önce yüklenen dosya varsayılan olarak kaydedilmez; kullanıcı isterse işaretler
            drafts.push(duplicateOf.length ? { ...d, duplicateOf, include: false } : d)
          }
        }
      } catch (e) {
        errors.push({ name: f.name, message: e instanceof Error ? e.message : String(e) })
      }
    }
    set((st) => ({
      drafts: [...st.drafts, ...drafts],
      skipped: [...st.skipped, ...skipped],
      errors: [...st.errors, ...errors],
      busy: false,
    }))
    return drafts.length
  },

  update: (id, patch) =>
    set((st) => ({ drafts: st.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
  setDateAll: (date) => set((st) => ({ drafts: st.drafts.map((d) => ({ ...d, date })) })),
  remove: (id) => set((st) => ({ drafts: st.drafts.filter((d) => d.id !== id) })),
  clear: () => set({ drafts: [], skipped: [], errors: [] }),
}))

export const draftKey = (d: Draft) => `${d.date}|${brandKey(d.brand)}`
