import { createFileRoute } from '@tanstack/react-router'
import { Upload } from '@/features/upload'

export const Route = createFileRoute('/_authenticated/yukle/')({
  component: Upload,
})
