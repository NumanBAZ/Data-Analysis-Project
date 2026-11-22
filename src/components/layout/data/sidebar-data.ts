import {
  FileUp,
  FolderClock,
  Tags,
  GitCompareArrows,
  DatabaseBackup,
  LayoutDashboard,
  Palette,
  Settings,
  UserCog,
  AudioWaveform,
  Command,
  GalleryVerticalEnd,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'satnaing',
    email: 'satnaingdev@gmail.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'Shadcn Admin',
      logo: Command,
      plan: 'Vite + ShadcnUI',
    },
    {
      name: 'Acme Inc',
      logo: GalleryVerticalEnd,
      plan: 'Enterprise',
    },
    {
      name: 'Acme Corp.',
      logo: AudioWaveform,
      plan: 'Startup',
    },
  ],
  navGroups: [
    {
      title: 'General',
      items: [
        {
          title: 'Dashboard',
          url: '/',
          icon: LayoutDashboard,
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
      ],
    },
    {
      title: 'Other',
      items: [
        {
          title: 'Settings',
          icon: Settings,
          items: [
            {
              title: 'Profile',
              url: '/settings',
              icon: UserCog,
            },
            {
              title: 'Appearance',
              url: '/settings/appearance',
              icon: Palette,
            },
          ],
        },
      ],
    },
  ],
}
