import { createFileRoute } from '@tanstack/react-router'
import { ReportDetail } from '@/features/reports/detail'

export const Route = createFileRoute('/_authenticated/raporlar/$id/')({
  component: function ReportDetailRoute() {
    const { id } = Route.useParams()
    return <ReportDetail id={Number(id)} />
  },
})
