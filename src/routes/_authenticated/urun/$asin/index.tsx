import { createFileRoute } from '@tanstack/react-router'
import { ProductDetail } from '@/features/product'

export const Route = createFileRoute('/_authenticated/urun/$asin/')({
  component: function ProductDetailRoute() {
    const { asin } = Route.useParams()
    return <ProductDetail asin={asin} />
  },
})
