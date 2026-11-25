import { createFileRoute } from '@tanstack/react-router'
import { ProductAnalysis } from '@/features/product-analysis'

export const Route = createFileRoute('/_authenticated/urun-analizi/')({
  component: ProductAnalysis,
})
