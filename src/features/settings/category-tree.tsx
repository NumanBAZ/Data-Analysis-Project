import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CornerDownRight, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { flattenTree, parentOf, selfAndDescendants } from '@/core/tree'
import { addCategoryToList, categoryUsage, deleteCategory, getCategoryList, renameCategory, setCategoryParent } from '@/data/repo'
import { useCategoryTree } from '@/components/category-select'
import { fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/** Select'te "ana kategori" seçeneği (boş değer kullanılamıyor) */
const ROOT = '__root__'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ')

/**
 * Kategori ağacı yönetimi. Ürünlere kategori yalnızca bu listedeki adlardan seçilerek verilir.
 * Alt kategori, üst kategorinin bir parçasıdır: raporlarda üst kategori seçilince altındakiler de sayılır.
 */
export function CategoryTreePanel() {
  const list = useLiveQuery(getCategoryList)
  const usage = useLiveQuery(categoryUsage)
  const tree = useCategoryTree()
  const rows = useMemo(() => flattenTree(tree, list ?? []), [tree, list])

  const [rootName, setRootName] = useState('')
  const [addingUnder, setAddingUnder] = useState<string | null>(null)
  const [childName, setChildName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  /** Kendi + alt kategorilerindeki ASIN sayısı */
  const totalOf = (name: string) => {
    let n = 0
    for (const c of selfAndDescendants(tree, name, list ?? [])) n += usage?.get(c) ?? 0
    return n
  }

  const add = async (name: string, parent: string) => {
    try {
      const added = await addCategoryToList(name, parent)
      toast.success(parent ? `"${added}", "${parent}" altına eklendi.` : `"${added}" ana kategori olarak eklendi.`)
      return true
    } catch (e) {
      toast.error(errText(e))
      return false
    }
  }

  const rename = async (from: string) => {
    const to = tidy(newName)
    if (!to || to === from) return setEditing(null)
    const same = (list ?? []).find((c) => c !== from && c.toLocaleLowerCase('tr') === to.toLocaleLowerCase('tr'))
    const msg = same
      ? `"${same}" kategorisi zaten var. "${from}" ürünleri ve alt kategorileri "${same}" ile birleştirilsin mi?`
      : `"${from}" kategorisinin adı bütün raporlarda "${to}" olsun mu?`
    if (!window.confirm(msg)) return
    try {
      const r = await renameCategory(from, same ?? to)
      setEditing(null)
      toast.success(`"${from}" → "${same ?? to}"`, { description: `${fmt.int(r.asins)} ASIN güncellendi. Yeni raporlarda da bu ad kullanılacak.` })
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const move = async (name: string, value: string) => {
    const parent = value === ROOT ? '' : value
    if (parent === parentOf(tree, name)) return
    try {
      await setCategoryParent(name, parent)
      toast.success(parent ? `"${name}" artık "${parent}" altında.` : `"${name}" artık ana kategori.`)
    } catch (e) {
      toast.error(errText(e))
    }
  }

  const remove = async (name: string) => {
    if (!window.confirm(`"${name}" kategorisi silinsin mi?`)) return
    try {
      await deleteCategory(name)
      toast.success(`"${name}" silindi.`)
    } catch (e) {
      toast.error(errText(e))
    }
  }

  return (
    <div className='grid gap-4 xl:grid-cols-[1fr_22rem]'>
      <Card className='gap-3 py-4 xl:order-2 xl:h-fit'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'><FolderTree className='size-4' /> Yeni ana kategori</CardTitle>
          <CardDescription>
            Ana kategoriyi ekleyin, sonra listede yanındaki <b>Alt kategori</b> düğmesiyle altına kategori ekleyin.
            Aynı adda (büyük/küçük harf farkı dahil) kategori varsa eklenmez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className='flex gap-2' onSubmit={(e) => { e.preventDefault(); void add(rootName, '').then((ok) => ok && setRootName('')) }}>
            <Input placeholder='Örn. Yapıştırıcı' spellCheck={false} autoComplete='off' value={rootName} onChange={(e) => setRootName(e.target.value)} />
            <Button type='submit' disabled={!rootName.trim()}><Plus /> Ekle</Button>
          </form>
        </CardContent>
      </Card>

      <div className='overflow-hidden rounded-md border xl:order-1'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kategori</TableHead>
              <TableHead className='w-28 text-right'>ASIN</TableHead>
              <TableHead className='w-52'>Üst kategori</TableHead>
              <TableHead className='w-64 text-right'>İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list && rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className='h-24 text-center text-muted-foreground'>Henüz kategori yok.</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const own = usage?.get(r.name) ?? 0
              const total = r.hasChildren ? totalOf(r.name) : own
              // Kendi altına taşınamaz
              const blocked = selfAndDescendants(tree, r.name, list ?? [])
              const canDelete = own === 0 && !r.hasChildren
              return [
                <TableRow key={r.name} className={cn(r.depth === 0 && 'bg-muted/30')}>
                  <TableCell>
                    <div className='flex items-center gap-1.5' style={{ paddingInlineStart: r.depth * 24 }}>
                      {r.depth > 0 && <CornerDownRight className='size-3.5 shrink-0 text-muted-foreground' />}
                      {editing === r.name ? (
                        <form className='flex flex-1 gap-2' onSubmit={(e) => { e.preventDefault(); void rename(r.name) }}>
                          <Input autoFocus className='h-8' spellCheck={false} autoComplete='off' value={newName} onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null) }} />
                          <Button type='submit' size='sm' disabled={!newName.trim()}>Kaydet</Button>
                          <Button type='button' size='sm' variant='ghost' onClick={() => setEditing(null)}>Vazgeç</Button>
                        </form>
                      ) : (
                        <span className={cn(r.depth === 0 ? 'font-semibold' : 'font-medium')}>{r.name}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {fmt.int(total)}
                    {r.hasChildren && <div className='text-xs text-muted-foreground'>kendisi {fmt.int(own)}</div>}
                  </TableCell>
                  <TableCell>
                    <Select value={r.depth > 0 ? parentOf(tree, r.name) : ROOT}
                      onValueChange={(v) => void move(r.name, v)}>
                      <SelectTrigger className='h-8 w-full' title='Taşı'><SelectValue /></SelectTrigger>
                      <SelectContent className='max-h-80'>
                        <SelectItem value={ROOT}>— Ana kategori —</SelectItem>
                        {rows.filter((o) => !blocked.has(o.name)).map((o) => (
                          <SelectItem key={o.name} value={o.name}>
                            <span style={{ paddingInlineStart: o.depth * 16 }}>{o.depth > 0 && <span className='text-muted-foreground'>└ </span>}{o.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className='flex justify-end gap-1'>
                      <Button type='button' size='sm' variant='outline' className='h-7 px-2 text-xs'
                        onClick={() => { setAddingUnder(r.name); setChildName('') }}>
                        <Plus className='size-3' /> Alt kategori
                      </Button>
                      <Button type='button' size='sm' variant='ghost' className='h-7 px-2 text-xs' title='Adını değiştir'
                        onClick={() => { setEditing(r.name); setNewName(r.name) }}>
                        <Pencil className='size-3' />
                      </Button>
                      <Button type='button' size='sm' variant='ghost' className='h-7 px-2 text-xs text-destructive' disabled={!canDelete}
                        title={canDelete ? 'Sil' : own ? `${own} ASIN bu kategoride; silmek için önce o ürünlere başka kategori verin` : 'Altında kategori var; önce onları taşıyın ya da silin'}
                        onClick={() => void remove(r.name)}>
                        <Trash2 className='size-3' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>,
                addingUnder === r.name && (
                  <TableRow key={`${r.name}__add`} className='bg-muted/20'>
                    <TableCell colSpan={4}>
                      <form className='flex items-center gap-2' style={{ paddingInlineStart: (r.depth + 1) * 24 }}
                        onSubmit={(e) => {
                          e.preventDefault()
                          void add(childName, r.name).then((ok) => { if (ok) setChildName('') })
                        }}>
                        <CornerDownRight className='size-3.5 shrink-0 text-muted-foreground' />
                        <Input autoFocus className='h-8 max-w-72' placeholder={`"${r.name}" altına yeni kategori`} spellCheck={false} autoComplete='off'
                          value={childName} onChange={(e) => setChildName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setAddingUnder(null) }} />
                        <Button type='submit' size='sm' disabled={!childName.trim()}><Plus /> Ekle</Button>
                        <Button type='button' size='sm' variant='ghost' onClick={() => setAddingUnder(null)}>Kapat</Button>
                        <span className='text-xs text-muted-foreground'>Art arda birden çok ekleyebilirsiniz.</span>
                      </form>
                    </TableCell>
                  </TableRow>
                ),
              ]
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
