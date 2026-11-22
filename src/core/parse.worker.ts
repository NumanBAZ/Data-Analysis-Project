/// <reference lib="webworker" />
/**
 * Excel okuma ve temizleme arka planda çalışır; büyük dosyalarda arayüz donmaz.
 */
import type { BrandAlias } from './brands'
import { parseWorkbook } from './workbook'

export type ParseRequest = {
  id: number
  data: Uint8Array
  name: string
  aliases: BrandAlias[]
  categories: Map<string, string>
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  const { id, data, name, aliases, categories } = e.data
  try {
    const sheets = parseWorkbook(data, name, { aliases, categoryLookup: (asin) => categories.get(asin) })
    self.postMessage({ id, sheets })
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
