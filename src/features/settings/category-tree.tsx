import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronRight, ChevronsDownUp, ChevronsUpDown, Folder, FolderInput, FolderOpen, FolderPlus, FolderTree,
  MoreHorizontal, Pencil, Plus, Tag, Trash2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { fold } from '@/core/text'
import { ancestorsOf, flattenTree, parentOf, pathOf, selfAndDescendants, type TreeRow } from '@/core/tree'
import { addCategoryToList, categoryUsage, deleteCategory, getCategoryList, renameCategory, setCategoryParent } from '@/data/repo'
import { useCategoryTree } from '@/components/category-select'
import { fmt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Select'te "ana kategori" seçeneği (boş değer kullanılamıyor) */
const ROOT = '__root__'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ')

type Node = TreeRow & { children: Node[] }

/** Düz ağaç sırasını (derinlikle) iç içe düğümlere çevirir */
function nest(rows: TreeRow[]): Node[] {
  const roots: Node[] = []
  const stack: Node[] = []
  for (const r of rows) {
    const n: Node = { ...r, children: [] }
    while (stack.length > r.depth) stack.pop()
    if (stack.length) stack[stack.length - 1].children.push(n)
    else roots.push(n)
    stack.push(n)
  }
  return roots
}

/**
 * Kategori ağacı yönetimi, klasör görünümünde: alt kategoriler üst kategorisinin altında,
 * sağa girintili ve dikey çizgiyle bağlı durur. Raporlarda üst kategori seçilince altındakiler de sayılır.
 */
export function CategoryTreePanel() {
  const list = useLiveQuery(getCategoryList)
  const usage = useLiveQuery(categoryUsage)
  const tree = useCategoryTree()
  const rows = useMemo(() => flattenTree(tree, list ?? []), [tree, list])

  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [addingUnder, setAddingUnder] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)

  // Aramada eşleşenler ve üst kategorileri görünür (hepsi açık)
  const shown = useMemo(() => {
    const f = fold(q)
    if (!f) return null
    const set = new Set<string>()
    for (const r of rows) {
      if (fold(r.name).includes(f)) {
        set.add(r.name)
        for (const a of ancestorsOf(tree, r.name)) set.add(a)
      }
    }
    return set
  }, [q, rows, tree])

  const nodes = useMemo(() => nest(shown ? rows.filter((r) => shown.has(r.name)) : rows), [rows, shown])
  // Doğrudan alt kategori sayısı (aramada gizlenenler dahil)
  const kidCount = useMemo(() => {
    const m = new Map<string, number>()
    const walk = (ns: Node[]) => ns.forEach((n) => { m.set(n.name, n.children.length); walk(n.children) })
    walk(nest(rows))
    return m
  }, [rows])
  const roots = rows.filter((r) => r.depth === 0).length
  const parents = rows.filter((r) => r.hasChildren).map((r) => r.name)
  const allOpen = parents.every((p) => !collapsed.has(p))

  /** Kendi + alt kategorilerindeki ASIN sayısı */
  const totalOf = (name: string) => {
    let n = 0
    for (const c of selfAndDescendants(tree, name, list ?? [])) n += usage?.get(c) ?? 0
    return n
  }

  const toggle = (name: string) =>
    setCollapsed((s) => {
      const n = new Set(s)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })

  const add = async (name: string, parent: string) => {
    try {
      const added = await addCategoryToList(name, parent)
      toast.success(parent ? `"${added}" → "${parent}" altına eklendi.` : `"${added}" ana kategori olarak eklendi.`)
      if (parent) setCollapsed((s) => { const n = new Set(s); n.delete(parent); return n })
      return true
    } catch (e) {
      toast.error(errText(e))
      return false
    }
  }

  const rename = async (from: string, value: string) => {
    const to = tidy(value)
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

  const move = async (name: string, parent: string) => {
    try {
      await setCategoryParent(name, parent)
      setMoving(null)
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

  const renderNode = (n: Node) => {
    const open = !!shown || !collapsed.has(n.name)
    const own = usage?.get(n.name) ?? 0
    const total = n.hasChildren ? totalOf(n.name) : own
    const canDelete = own === 0 && !n.hasChildren
    const Icon = n.hasChildren ? (open ? FolderOpen : Folder) : n.depth === 0 ? Folder : Tag
    const match = !!shown && fold(n.name).includes(fold(q))

    return (
      <li key={n.name}>
        <div className={cn(
          'group flex min-h-10 items-center gap-1.5 rounded-md pe-1 hover:bg-muted/60',
          n.depth === 0 && 'font-semibold',
          match && 'bg-primary/5',
        )}>
          {/* Aç/kapa okunun yeri her satırda ayrılır; hizalama bozulmasın */}
          {n.hasChildren ? (
            <button type='button' onClick={() => toggle(n.name)} aria-label={open ? 'Kapat' : 'Aç'}
              className='flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground'>
              <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
            </button>
          ) : <span className='size-6 shrink-0' />}
          <Icon className={cn('size-4 shrink-0', n.hasChildren || n.depth === 0 ? 'text-primary' : 'text-muted-foreground')} />

          {editing === n.name ? (
            <InlineInput initial={n.name} submitLabel='Kaydet' onSubmit={(v) => void rename(n.name, v)} onCancel={() => setEditing(null)} />
          ) : (
            <button type='button' className='min-w-0 truncate text-start' title={pathOf(tree, n.name)}
              onClick={() => n.hasChildren && toggle(n.name)} onDoubleClick={() => setEditing(n.name)}>
              {n.name}
            </button>
          )}
          {n.hasChildren && editing !== n.name && (
            <span className='shrink-0 text-xs font-normal text-muted-foreground'>{kidCount.get(n.name) ?? n.children.length} alt</span>
          )}

          <div className='ms-auto flex shrink-0 items-center gap-1'>
            {/* İşlemler fareyle üzerine gelince görünür */}
            <div className='flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'>
              <Button type='button' size='sm' variant='ghost' className='h-7 px-2 text-xs font-normal'
                onClick={() => setAddingUnder(n.name)}>
                <Plus className='size-3.5' /> Alt kategori
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type='button' size='icon' variant='ghost' className='size-7' aria-label='Diğer işlemler'>
                    <MoreHorizontal className='size-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem onSelect={() => setEditing(n.name)}><Pencil /> Adını değiştir</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setMoving(n.name)}><FolderInput /> Başka kategorinin altına taşı</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant='destructive' disabled={!canDelete} onSelect={() => void remove(n.name)}>
                    <Trash2 /> {canDelete ? 'Sil' : own ? `Silinemez: ${fmt.int(own)} ASIN'de kullanılıyor` : 'Silinemez: altında kategori var'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Badge variant={total ? 'secondary' : 'outline'} className='min-w-16 justify-end font-normal tabular-nums'
              title={n.hasChildren ? `Kendisi ${fmt.int(own)} · alt kategorileriyle ${fmt.int(total)} ASIN` : `${fmt.int(own)} ASIN`}>
              {fmt.int(total)} ASIN
            </Badge>
          </div>
        </div>

        {/* Alt kategoriler: sağa girintili, dikey çizgiyle üst kategoriye bağlı */}
        {(open && n.children.length > 0) || addingUnder === n.name ? (
          <ul className='ms-3 border-s ps-3'>
            {open && n.children.map(renderNode)}
            {addingUnder === n.name && (
              <li className='flex min-h-10 items-center gap-1.5 py-1'>
                <span className='size-6 shrink-0' />
                <Tag className='size-4 shrink-0 text-muted-foreground' />
                <InlineInput placeholder={`"${n.name}" altına yeni kategori`} submitLabel='Ekle' keepOpen
                  onSubmit={(v) => add(v, n.name)} onCancel={() => setAddingUnder(null)} />
              </li>
            )}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <Card className='gap-4'>
      <CardHeader className='gap-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='space-y-1'>
            <CardTitle className='flex items-center gap-2'><FolderTree className='size-5' /> Kategori ağacı</CardTitle>
            <CardDescription>
              Alt kategoriler, üst kategorisinin altında sağa girintili görünür. Raporlarda üst kategori seçilince altındakiler de sayılır.
              İşlemler için satırın üzerine gelin; adı değiştirmek için çift tıklayın.
            </CardDescription>
          </div>
          <div className='text-sm text-muted-foreground'>{fmt.int(roots)} ana · {fmt.int(rows.length - roots)} alt kategori</div>
        </div>

        <NewRootForm onAdd={(v) => add(v, '')} />

        <div className='flex flex-wrap items-center gap-2'>
          <div className='relative'>
            <Input className='h-9 w-64 pe-8' placeholder='Kategori ara…' spellCheck={false} autoComplete='off' value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button type='button' className='absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground' onClick={() => setQ('')} aria-label='Temizle'>
                <X className='size-4' />
              </button>
            )}
          </div>
          {parents.length > 0 && !shown && (
            <Button type='button' variant='ghost' size='sm' onClick={() => setCollapsed(allOpen ? new Set(parents) : new Set())}>
              {allOpen ? <><ChevronsDownUp /> Hepsini kapat</> : <><ChevronsUpDown /> Hepsini aç</>}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {list && rows.length === 0 && <p className='py-8 text-center text-muted-foreground'>Henüz kategori yok. Yukarıdan ana kategori ekleyin.</p>}
        {shown && nodes.length === 0 && <p className='py-8 text-center text-muted-foreground'>"{q}" ile eşleşen kategori yok.</p>}
        <ul className='space-y-0.5'>{nodes.map(renderNode)}</ul>
      </CardContent>

      <MoveDialog name={moving} rows={rows} tree={tree} list={list ?? []} onMove={(n, p) => void move(n, p)} onClose={() => setMoving(null)} />
    </Card>
  )
}

/** Satır içi metin kutusu: Enter kaydeder, Esc kapatır. `keepOpen`: ekledikten sonra boşalıp açık kalır (art arda ekleme). */
function InlineInput({ initial = '', placeholder, submitLabel, keepOpen, onSubmit, onCancel }: {
  initial?: string
  placeholder?: string
  submitLabel: string
  keepOpen?: boolean
  onSubmit: (v: string) => unknown
  onCancel: () => void
}) {
  const [v, setV] = useState(initial)
  return (
    <form className='flex flex-1 flex-wrap items-center gap-2'
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.trim()) return
        void Promise.resolve(onSubmit(v)).then((ok) => { if (keepOpen && ok !== false) setV('') })
      }}>
      <Input autoFocus className='h-8 max-w-72 font-normal' placeholder={placeholder} spellCheck={false} autoComplete='off'
        value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }} />
      <Button type='submit' size='sm' className='h-8' disabled={!v.trim()}>{submitLabel}</Button>
      <Button type='button' size='sm' variant='ghost' className='h-8 font-normal' onClick={onCancel}>{keepOpen ? 'Bitti' : 'Vazgeç'}</Button>
      {keepOpen && <span className='text-xs font-normal text-muted-foreground'>Enter ile art arda ekleyebilirsiniz.</span>}
    </form>
  )
}

function NewRootForm({ onAdd }: { onAdd: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState('')
  return (
    <form className='flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-2'
      onSubmit={(e) => { e.preventDefault(); void onAdd(v).then((ok) => ok && setV('')) }}>
      <FolderPlus className='ms-1 size-4 text-muted-foreground' />
      <Input className='h-8 max-w-80 bg-background' placeholder='Yeni ana kategori adı (örn. Yapıştırıcı)' spellCheck={false} autoComplete='off'
        value={v} onChange={(e) => setV(e.target.value)} />
      <Button type='submit' size='sm' className='h-8' disabled={!v.trim()}><Plus /> Ana kategori ekle</Button>
    </form>
  )
}

function MoveDialog({ name, rows, tree, list, onMove, onClose }: {
  name: string | null
  rows: TreeRow[]
  tree: ReturnType<typeof useCategoryTree>
  list: string[]
  onMove: (name: string, parent: string) => void
  onClose: () => void
}) {
  const [target, setTarget] = useState<string | null>(null)
  if (!name) return null
  const current = parentOf(tree, name) || ROOT
  // Kendisi ve kendi altındakiler hedef olamaz
  const blocked = selfAndDescendants(tree, name, list)
  const value = target ?? current
  return (
    <Dialog open onOpenChange={(o) => { if (!o) { setTarget(null); onClose() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>"{name}" nereye taşınsın?</DialogTitle>
          <DialogDescription>Alt kategorileri de onunla birlikte taşınır. Ürünlerin kategorisi değişmez.</DialogDescription>
        </DialogHeader>
        <Select value={value} onValueChange={setTarget}>
          <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
          <SelectContent className='max-h-80'>
            <SelectItem value={ROOT}>— Ana kategori olsun —</SelectItem>
            {rows.filter((o) => !blocked.has(o.name)).map((o) => (
              <SelectItem key={o.name} value={o.name}>
                <span style={{ paddingInlineStart: o.depth * 16 }}>{o.depth > 0 && <span className='text-muted-foreground'>└ </span>}{o.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant='ghost' onClick={() => { setTarget(null); onClose() }}>Vazgeç</Button>
          <Button disabled={value === current} onClick={() => { onMove(name, value === ROOT ? '' : value); setTarget(null) }}>Taşı</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
