import { createFileRoute } from '@tanstack/react-router'
import { FirmAnalysis } from '@/features/firm'

export const Route = createFileRoute('/_authenticated/firma/')({
  validateSearch: (s: Record<string, unknown>): { marka?: string } => ({
    marka: typeof s.marka === 'string' ? s.marka : undefined,
  }),
  component: function FirmRoute() {
    const { marka } = Route.useSearch()
    return <FirmAnalysis brand={marka} />
  },
})
