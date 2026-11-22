import { createFileRoute } from '@tanstack/react-router'
import { Compare } from '@/features/compare'

export const Route = createFileRoute('/_authenticated/karsilastir/')({
  component: Compare,
})
