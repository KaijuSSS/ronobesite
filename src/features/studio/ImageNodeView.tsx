import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { Trash2 } from 'lucide-react'
import { ChapterImage } from '@/features/reader/ChapterImage'
import { safeImagePath } from '@/features/reader/rich-text-utils'
import { cn } from '@/lib/utils'

/** Изображение внутри редактора главы: превью и кнопка удаления. */
export function ImageNodeView({ node, selected, editor, deleteNode }: NodeViewProps) {
  const path = safeImagePath(node.attrs.path)
  return (
    <NodeViewWrapper
      className={cn('relative rounded-xl', selected && 'ring-2 ring-primary ring-offset-2 ring-offset-card')}
      data-drag-handle
    >
      {path ? <ChapterImage path={path} alt={node.attrs.alt} className="my-0" /> : null}
      {editor.isEditable ? (
        <button
          type="button"
          onClick={deleteNode}
          className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80"
          aria-label="Удалить изображение"
          title="Удалить изображение"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      ) : null}
    </NodeViewWrapper>
  )
}
