import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { CategoryTreePanel } from './category-tree'

export function Settings() {
  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Ayarlar</h2>
          <p className='text-muted-foreground'>Kategori ağacı: kategori ekleme, alt kategori ekleme, ad değiştirme, taşıma ve silme.</p>
        </div>
        <CategoryTreePanel />
      </Main>
    </>
  )
}
