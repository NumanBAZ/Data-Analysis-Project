import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useLayout } from '@/context/layout-provider'
import { isDesktop } from '@/lib/platform'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'

function AppBrand() {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size='lg' asChild>
          <Link to='/' onClick={() => setOpenMobile(false)}>
            <img src='/images/app-icon.png' alt='' className='size-8 shrink-0 rounded-lg' />
            <div className='grid flex-1 text-start text-sm leading-tight'>
              <span className='truncate font-semibold'>Rakip Analizi</span>
              <span className='truncate text-xs text-muted-foreground'>Lotos Global</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function AppVersion() {
  const [version, setVersion] = useState('')
  useEffect(() => {
    if (!isDesktop) return
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => {})
  }, [])
  if (!version) return null
  return <p className='px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden'>Sürüm {version}</p>
}

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <AppBrand />
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <AppVersion />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
