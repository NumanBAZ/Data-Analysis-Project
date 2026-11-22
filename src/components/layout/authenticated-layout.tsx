import { useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import { toast } from 'sonner'
import { applyTitleCategoryRules, seedCategoriesIfNeeded } from '@/data/repo'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SkipToMain } from '@/components/skip-to-main'
import { UpdateCheck } from '@/components/update-check'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

let seeding: Promise<number> | null = null

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  // İlk açılışta eski uygulamanın (V4) raporlarını bir kez aktar
  useEffect(() => {
    if (seeding) return
    // ASIN kategori kütüphanesi (ilk açılışta bir kez), sonra onaylı ad kuralları
    seeding = Promise.resolve(0)
      .then(async (n) => {
        const c = await seedCategoriesIfNeeded()
        if (c.added || c.fixed)
          toast.success(`Kategori kütüphanesi yüklendi: ${c.added} ASIN${c.fixed ? `, ${c.fixed} ürünün kategorisi bulundu` : ''}.`)
        // Ürün adına göre onaylı tek seferlik kategori düzeltmeleri (örn. Fire Block)
        for (const r of await applyTitleCategoryRules())
          if (r.asins) toast.success(`${r.asins} ürünün kategorisi "${r.category}" yapıldı (ürün adına göre).`)
        return n
      })
      .catch((e) => {
        toast.error(`Kategori kütüphanesi yüklenemedi: ${e}`)
        return 0
      })
  }, [])
  return (
    <SearchProvider>
      <LayoutProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SkipToMain />
          <UpdateCheck />
          <AppSidebar />
          <SidebarInset
            className={cn(
              // Set content container, so we can use container queries
              '@container/content',

              // If layout is fixed, set the height
              // to 100svh to prevent overflow
              'has-data-[layout=fixed]:h-svh',

              // If layout is fixed and sidebar is inset,
              // set the height to 100svh - spacing (total margins) to prevent overflow
              'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
            )}
          >
            {children ?? <Outlet />}
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  )
}
