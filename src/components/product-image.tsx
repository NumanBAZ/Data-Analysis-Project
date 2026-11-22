import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ProductImage as StoredImage } from '@/data/db'
import { cn } from '@/lib/utils'

/**
 * Kayıtlı görsel → tarayıcı adresi. Adres görsel başına bir kez üretilip saklanır;
 * bileşen kapanınca iptal edilmez (aksi halde React aynı görseli tekrar çizerken adres ölü kalıyordu).
 */
const urls = new WeakMap<Blob, string>()
function blobUrl(img: StoredImage): string {
  let u = urls.get(img.data)
  if (!u) {
    u = URL.createObjectURL(img.data)
    urls.set(img.data, u)
  }
  return u
}

/**
 * Ürün görseli: önce Xray dosyasından çıkarılıp kaydedilen görsel (internetsiz çalışır),
 * yoksa Amazon'daki görsel linki.
 */
export function ProductImage({ asin, url, className }: { asin: string; url?: string; className?: string }) {
  const img = useLiveQuery(() => (asin ? db.images.get(asin) : undefined), [asin])
  const src = img ? blobUrl(img) : url || undefined
  if (!src) return <div className={cn('size-10 shrink-0 rounded bg-muted', className)} />
  return <img src={src} alt='' loading='lazy' className={cn('size-10 min-w-10 shrink-0 rounded object-contain', className)} />
}
