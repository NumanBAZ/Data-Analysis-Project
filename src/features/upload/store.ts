import type { BrandAlias } from '@/core/brands'
import type { DraftProduct, ParsedSheet } from '@/core/clean'
import { db, getSettings } from '@/data/db'
import { applyBrandOverrides, getBrandOverrides, loadCategoryMap } from '@/data/repo'
import { create } from 'zustand'
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
  duplicateOf?: {
    brand: string
    date: string
    importedAt: string
    exact: boolean
  }[]
}

type UploadState = {
  drafts: Draft[]
  skipped: ParsedSheet[]
  errors: { name: string; message: string }[]
  busy: boolean
  addFiles: (files: PickedFile[]) => Promise<number>
  update: (
    id: string,
    patch: Partial<Pick<Draft, 'brand' | 'date' | 'include'>>
  ) => void
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

// Excel okuma arka planda (Web Worker) yapılır; büyük dosyada arayüz donmaz
let worker: Worker | undefined
let nextId = 0
const pending = new Map<
  number,
  { resolve: (s: ParsedSheet[]) => void; reject: (e: Error) => void }
>()

function parseInWorker(
  data: Uint8Array,
  name: string,
  aliases: BrandAlias[],
  categories: Map<string, string>
) {
  if (!worker) {
    worker = new Worker(
      new URL('../../core/parse.worker.ts', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (
      e: MessageEvent<{ id: number; sheets?: ParsedSheet[]; error?: string }>
    ) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.error !== undefined) p.reject(new Error(e.data.error))
      else p.resolve(e.data.sheets ?? [])
    }
    worker.onerror = (e) => {
      for (const p of pending.values())
        p.reject(new Error(e.message || 'Dosya okunamadı.'))
      pending.clear()
      worker?.terminate()
      worker = undefined
    }
  }
  const id = ++nextId
  return new Promise<ParsedSheet[]>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.postMessage({ id, data, name, aliases, categories })
  })
}

async function sha256(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const useUploadStore = create<UploadState>((set, get) => ({
  drafts: [],
  skipped: [],
  errors: [],
  busy: false,

  addFiles: async (files) => {
    if (get().busy) return 0
    set({ busy: true })
    try {
      return await readFiles(files, get, set)
    } finally {
      set({ busy: false })
    }
  },

  update: (id, patch) =>
    set((st) => ({
      drafts: st.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),
  setDateAll: (date) =>
    set((st) => ({ drafts: st.drafts.map((d) => ({ ...d, date })) })),
  remove: (id) =>
    set((st) => ({ drafts: st.drafts.filter((d) => d.id !== id) })),
  clear: () => set({ drafts: [], skipped: [], errors: [] }),
}))

type Get = () => UploadState
type Set = (fn: (st: UploadState) => Partial<UploadState>) => void

async function readFiles(
  files: PickedFile[],
  get: Get,
  set: Set
): Promise<number> {
  const settings = await getSettings()
  const categories = await loadCategoryMap()
  const brandOverrides = await getBrandOverrides()
  const known = new Set(get().drafts.map((d) => d.id))
  const drafts: Draft[] = []
  const skipped: ParsedSheet[] = []
  const errors: UploadState['errors'] = []

  for (const f of files) {
    try {
      const fileHash = await sha256(f.data)
      for (const s of await parseInWorker(
        f.data,
        f.name,
        settings.aliases,
        categories
      )) {
        s.fileHash = fileHash
        if (s.skipped) {
          skipped.push(s)
          continue
        }
        // Aynı içerik (kesin) veya aynı dosya adı (V4'ten gelenlerde özet yok) daha önce yüklendi mi?
        const [byHash, byName] = await Promise.all([
          db.reports.where('fileHash').equals(fileHash).toArray(),
          db.reports
            .filter((r) => !r.fileHash && r.fileName === f.name)
            .toArray(),
        ])
        const same = [...byHash, ...byName]
        const duplicateOf = same.map((r) => ({
          brand: r.brand,
          date: r.date,
          importedAt: r.importedAt,
          exact: r.fileHash === fileHash,
        }))
        // Kategoriler sayfasında ASIN'e elle verilen marka, dosyadakinin yerine geçer
        s.products = applyBrandOverrides(s.products, brandOverrides)
        for (const d of splitByCompany(s)) {
          if (known.has(d.id)) continue
          // Daha önce yüklenen dosya varsayılan olarak kaydedilmez; kullanıcı isterse işaretler
          drafts.push(
            duplicateOf.length ? { ...d, duplicateOf, include: false } : d
          )
        }
      }
    } catch (e) {
      errors.push({
        name: f.name,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }
  set((st) => ({
    drafts: [...st.drafts, ...drafts],
    skipped: [...st.skipped, ...skipped],
    errors: [...st.errors, ...errors],
  }))
  return drafts.length
}

