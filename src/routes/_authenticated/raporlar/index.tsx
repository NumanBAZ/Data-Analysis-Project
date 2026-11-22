import { createFileRoute } from '@tanstack/react-router'
import { Reports } from '@/features/reports'

export const Route = createFileRoute('/_authenticated/raporlar/')({
  component: Reports,
})
