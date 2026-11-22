import { useEffect } from 'react'
import { toast } from 'sonner'
import { isDesktop } from '@/lib/platform'

let checked = false

/**
 * Açılışta GitHub'daki son sürümü kontrol eder. Yeni sürüm varsa
 * "Güncelle" butonlu bir bildirim gösterir; tıklanınca indirir, kurar, yeniden açar.
 */
export function UpdateCheck() {
  useEffect(() => {
    if (!isDesktop || checked) return
    checked = true
    void (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (!update) return
        toast.info(`Yeni sürüm çıktı (${update.version})`, {
          description: 'Güncellemek için butona basın. Uygulama kendini yeniden açacak.',
          duration: Infinity,
          action: {
            label: 'Güncelle',
            onClick: () => {
              const id = toast.loading('Güncelleme indiriliyor…', { duration: Infinity })
              void (async () => {
                try {
                  await update.downloadAndInstall()
                  const { relaunch } = await import('@tauri-apps/plugin-process')
                  await relaunch()
                } catch (e) {
                  toast.error(`Güncelleme yapılamadı: ${e}`, { id, duration: 10000 })
                }
              })()
            },
          },
        })
      } catch {
        // İnternet yoksa veya GitHub'a ulaşılamazsa sessizce geç
      }
    })()
  }, [])
  return null
}
