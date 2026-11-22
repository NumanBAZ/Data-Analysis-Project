import { useState } from 'react'
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Action = () => Promise<void> | void

/** Sağ üstteki "Dışa aktar" düğmesi: Excel / CSV / PDF */
export function ExportMenu({ excel, csv, pdf, label = 'Dışa aktar', note }: {
  excel?: Action
  csv?: Action
  pdf?: Action
  label?: string
  /** Menünün üstünde kısa açıklama (örn. "Foam filtresi uygulanır") */
  note?: string
}) {
  const [busy, setBusy] = useState(false)
  const run = (a: Action) => async () => {
    setBusy(true)
    try {
      await a()
    } finally {
      setBusy(false)
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' disabled={busy} className='no-print'>
          <Download /> {busy ? 'Hazırlanıyor…' : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-64'>
        {note && (
          <>
            <DropdownMenuLabel className='text-xs font-normal text-muted-foreground'>{note}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {excel && <DropdownMenuItem onClick={run(excel)}><FileSpreadsheet /> Excel (.xlsx)</DropdownMenuItem>}
        {csv && <DropdownMenuItem onClick={run(csv)}><FileText /> CSV (.csv)</DropdownMenuItem>}
        {pdf && <DropdownMenuItem onClick={run(pdf)}><Printer /> PDF (sunum için)</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
