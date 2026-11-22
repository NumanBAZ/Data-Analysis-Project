import { createFileRoute } from '@tanstack/react-router'
import { Backup } from '@/features/backup'

export const Route = createFileRoute('/_authenticated/yedek/')({
  component: Backup,
})
