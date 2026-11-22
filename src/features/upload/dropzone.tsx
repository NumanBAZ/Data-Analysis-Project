import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, FolderOpen, Loader2, UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  filesFromBrowser,
  isDesktop,
  listenNativeDrop,
  pickFiles,
  pickFolder,
  type PickedFile,
} from '@/lib/platform'
import { Button } from '@/components/ui/button'

type Props = { busy: boolean; onFiles: (files: PickedFile[]) => void }

/** Sürükle-bırak alanı + Windows dosya gezginini açan düğmeler. */
export function Dropzone({ busy, onFiles }: Props) {
  const [hover, setHover] = useState(false)
  const depth = useRef(0)
  const onFilesRef = useRef(onFiles)
  useEffect(() => {
    onFilesRef.current = onFiles
  })

  // Masaüstü: dosya gezgininden pencereye bırakılan dosyalar
  useEffect(() => {
    let off: (() => void) | undefined
    let alive = true
    listenNativeDrop({ onHover: setHover, onDrop: (f) => onFilesRef.current(f) }).then((fn) =>
      alive ? (off = fn) : fn()
    )
    return () => {
      alive = false
      off?.()
    }
  }, [])

  const browserDrop = isDesktop
    ? {}
    : {
        onDragEnter: (e: React.DragEvent) => {
          e.preventDefault()
          depth.current++
          setHover(true)
        },
        onDragOver: (e: React.DragEvent) => e.preventDefault(),
        onDragLeave: () => {
          depth.current = Math.max(0, depth.current - 1)
          if (!depth.current) setHover(false)
        },
        onDrop: async (e: React.DragEvent) => {
          e.preventDefault()
          depth.current = 0
          setHover(false)
          onFiles(await filesFromBrowser([...e.dataTransfer.files]))
        },
      }

  const choose = async (kind: 'files' | 'folder') => {
    const files = kind === 'files' ? await pickFiles() : await pickFolder()
    if (files) onFiles(files)
  }

  return (
    <div
      {...browserDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
        hover ? 'border-primary bg-muted' : 'border-border'
      )}
    >
      <div className='flex size-14 items-center justify-center rounded-full bg-muted'>
        {busy ? (
          <Loader2 className='size-7 animate-spin text-muted-foreground' />
        ) : (
          <UploadCloud className='size-7 text-muted-foreground' />
        )}
      </div>
      <div className='space-y-1'>
        <p className='text-lg font-semibold'>
          {busy ? 'Dosyalar okunuyor…' : hover ? 'Bırakın' : 'Helium 10 dosyalarını buraya sürükleyin'}
        </p>
        <p className='text-sm text-muted-foreground'>
          Excel (.xlsx, .xls) veya CSV. Birden fazla dosya ya da klasör bırakabilirsiniz.
        </p>
      </div>
      <div className='flex flex-wrap justify-center gap-2'>
        <Button disabled={busy} onClick={() => choose('files')}>
          <FileSpreadsheet />
          Dosya seç
        </Button>
        <Button variant='outline' disabled={busy} onClick={() => choose('folder')}>
          <FolderOpen />
          Klasör seç
        </Button>
      </div>
    </div>
  )
}
