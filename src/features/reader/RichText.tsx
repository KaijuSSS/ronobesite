import { Fragment, type ReactNode } from 'react'
import type { Json } from '@/types/database'
import { ChapterImage } from './ChapterImage'
import { asNode, childNodes, safeHref, safeImagePath, type DocMark, type DocNode } from './rich-text-utils'

// Безопасный вывод текста главы.
// Текст хранится как JSON-документ Tiptap и превращается в React-элементы
// по белому списку узлов и меток. dangerouslySetInnerHTML не используется:
// любые «теги» внутри текста выводятся как обычный текст, неизвестные узлы
// и атрибуты отбрасываются, ссылки разрешены только http(s) и mailto,
// изображения — только загруженные на сайт (см. safeImagePath).

function applyMarks(text: string, marks: unknown, key: string): ReactNode {
  let result: ReactNode = text
  if (!Array.isArray(marks)) return result
  marks.forEach((raw, index) => {
    const mark = raw as DocMark
    const k = `${key}-m${index}`
    switch (mark?.type) {
      case 'bold':
        result = <strong key={k}>{result}</strong>
        break
      case 'italic':
        result = <em key={k}>{result}</em>
        break
      case 'underline':
        result = <u key={k}>{result}</u>
        break
      case 'strike':
        result = <s key={k}>{result}</s>
        break
      case 'code':
        result = <code key={k}>{result}</code>
        break
      case 'link': {
        const href = safeHref(mark.attrs?.href)
        if (href) {
          result = (
            <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
              {result}
            </a>
          )
        }
        break
      }
      default:
        // Неизвестные метки игнорируются, текст остаётся.
        break
    }
  })
  return result
}

function renderNodes(nodes: DocNode[], prefix: string): ReactNode[] {
  return nodes.map((node, index) => renderNode(node, `${prefix}.${index}`))
}

function renderNode(node: DocNode, key: string): ReactNode {
  const inner = () => renderNodes(childNodes(node), key)

  switch (node.type) {
    case 'text':
      return typeof node.text === 'string' ? (
        <Fragment key={key}>{applyMarks(node.text, node.marks, key)}</Fragment>
      ) : null
    case 'paragraph':
      return <p key={key}>{inner()}</p>
    case 'heading': {
      const level = Number(node.attrs?.level)
      if (level <= 2) return <h2 key={key}>{inner()}</h2>
      if (level === 3) return <h3 key={key}>{inner()}</h3>
      return <h4 key={key}>{inner()}</h4>
    }
    case 'blockquote':
      return <blockquote key={key}>{inner()}</blockquote>
    case 'bulletList':
      return <ul key={key}>{inner()}</ul>
    case 'orderedList': {
      const start = Number(node.attrs?.start)
      return (
        <ol key={key} start={Number.isInteger(start) && start > 0 && start < 100000 ? start : undefined}>
          {inner()}
        </ol>
      )
    }
    case 'listItem':
      return <li key={key}>{inner()}</li>
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{inner()}</code>
        </pre>
      )
    case 'horizontalRule':
      return <hr key={key} />
    case 'hardBreak':
      return <br key={key} />
    case 'image': {
      const path = safeImagePath(node.attrs?.path)
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : undefined
      return path ? <ChapterImage key={key} path={path} alt={alt} /> : null
    }
    default:
      // Неизвестный узел (в том числе doc): показываем только вложенный текст.
      return <Fragment key={key}>{inner()}</Fragment>
  }
}

export function RichText({ content, className }: { content: Json | null | undefined; className?: string }) {
  const root = asNode(content)
  if (!root || root.type !== 'doc') return null
  return <div className={className}>{renderNodes(childNodes(root), 'n')}</div>
}
