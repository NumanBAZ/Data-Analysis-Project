import {
  FileUp,
  FolderClock,
  Tags,
  GitCompareArrows,
  DatabaseBackup,
  LayoutDashboard,
  ChartPie,
  PackageSearch,
  Settings,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'Menü',
      items: [
        {
          title: 'Dashboard',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: 'Firma Analizi',
          url: '/firma',
          icon: ChartPie,
        },
        {
          title: 'Ürün Analizi',
          url: '/urun-analizi',
          icon: PackageSearch,
        },
        {
          title: 'Dosya Yükle',
          url: '/yukle',
          icon: FileUp,
        },
        {
          title: 'Raporlar',
          url: '/raporlar',
          icon: FolderClock,
        },
        {
          title: 'Kategoriler',
          url: '/kategoriler',
          icon: Tags,
        },
        {
          title: 'Karşılaştır',
          url: '/karsilastir',
          icon: GitCompareArrows,
        },
        {
          title: 'Yedekleme',
          url: '/yedek',
          icon: DatabaseBackup,
        },
        {
          title: 'Ayarlar',
          url: '/ayarlar',
          icon: Settings,
        },
      ],
    },
  ],
}
