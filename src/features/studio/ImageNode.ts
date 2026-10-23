import { Node, ReactNodeViewRenderer } from '@tiptap/react'
import { safeImagePath } from '@/features/reader/rich-text-utils'
import { ImageNodeView } from './ImageNodeView'

// Изображение в тексте главы. В документе хранится путь в бакете
// (attrs.path), а не адрес: ссылки на приватные файлы временные.
// Картинки из буфера обмена со сторонних сайтов не вставляются —
// parseHTML принимает только наши img[data-path].
export const ChapterImageNode = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      path: {
        default: null,
        parseHTML: (element) => safeImagePath(element.getAttribute('data-path')),
        renderHTML: (attributes) => ({ 'data-path': attributes.path }),
      },
      alt: {
        default: '',
        parseHTML: (element) => element.getAttribute('alt') ?? '',
        renderHTML: (attributes) => ({ alt: attributes.alt }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'img[data-path]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', HTMLAttributes]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },
})
