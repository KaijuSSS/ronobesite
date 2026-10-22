import { useEffect } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database'

type ChapterEditorProps = {
  content: Json
  editable: boolean
  onChange: (content: Json) => void
  fontClassName?: string
}

/** Редактор главы. Расширения совпадают с белым списком RichText. */
export function ChapterEditor({ content, editable, onChange }: ChapterEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] },
      }),
    ],
    content: content as object,
    editable,
    editorProps: {
      attributes: {
        class: 'reader-prose min-h-[50vh] px-1 py-2 font-serif text-[18px] leading-[1.75] outline-none',
        'aria-label': 'Текст главы',
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as Json),
  })

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  return (
    <div className="overflow-hidden rounded-2xl border border-white/5 bg-card">
      {editable && editor ? <Toolbar editor={editor} /> : null}
      <div className="px-4 py-4 sm:px-8 sm:py-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      quote: e.isActive('blockquote'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  const groups: Array<Array<{ icon: LucideIcon; label: string; active?: boolean; disabled?: boolean; run: () => void }>> = [
    [
      { icon: Bold, label: 'Жирный', active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
      { icon: Italic, label: 'Курсив', active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
      {
        icon: Underline,
        label: 'Подчёркнутый',
        active: state.underline,
        run: () => editor.chain().focus().toggleUnderline().run(),
      },
      {
        icon: Strikethrough,
        label: 'Зачёркнутый',
        active: state.strike,
        run: () => editor.chain().focus().toggleStrike().run(),
      },
    ],
    [
      {
        icon: Heading2,
        label: 'Заголовок',
        active: state.h2,
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        icon: Heading3,
        label: 'Подзаголовок',
        active: state.h3,
        run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      { icon: Quote, label: 'Цитата', active: state.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
      {
        icon: List,
        label: 'Маркированный список',
        active: state.bullet,
        run: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        icon: ListOrdered,
        label: 'Нумерованный список',
        active: state.ordered,
        run: () => editor.chain().focus().toggleOrderedList().run(),
      },
      { icon: Minus, label: 'Разделитель сцены', run: () => editor.chain().focus().setHorizontalRule().run() },
    ],
    [
      { icon: Undo2, label: 'Отменить', disabled: !state.canUndo, run: () => editor.chain().focus().undo().run() },
      { icon: Redo2, label: 'Повторить', disabled: !state.canRedo, run: () => editor.chain().focus().redo().run() },
    ],
  ]

  return (
    <div
      role="toolbar"
      aria-label="Форматирование"
      className="sticky top-16 z-10 flex flex-wrap items-center gap-1 border-b border-white/5 bg-card/95 px-2 py-1.5 backdrop-blur"
    >
      {groups.map((group, gi) => (
        <div key={gi} className={cn('flex items-center gap-0.5', gi > 0 && 'border-l border-white/10 pl-1')}>
          {group.map(({ icon: Icon, label, active, disabled, run }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={active ?? undefined}
              disabled={disabled}
              onClick={run}
              className={cn(
                'flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40',
                active ? 'bg-primary/25 text-foreground' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
