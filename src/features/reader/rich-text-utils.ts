import type { Json } from '@/types/database'

// Вспомогательные функции для JSON-документов Tiptap (без React).

export type DocMark = { type?: unknown; attrs?: Record<string, unknown> }
export type DocNode = {
  type?: unknown
  text?: unknown
  attrs?: Record<string, unknown>
  marks?: unknown
  content?: unknown
}

export function asNode(value: unknown): DocNode | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as DocNode) : null
}

export function childNodes(node: DocNode): DocNode[] {
  return Array.isArray(node.content) ? node.content.map(asNode).filter((n): n is DocNode => n !== null) : []
}

/** Разрешены только ссылки http(s) и mailto — никаких javascript: и data:. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

/** Простой текст документа (для подсчётов и превью). */
export function plainText(content: Json | null | undefined, limit = Infinity): string {
  const parts: string[] = []
  let length = 0
  const walk = (value: unknown) => {
    if (length >= limit) return
    const node = asNode(value)
    if (!node) return
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text)
      length += node.text.length
    }
    childNodes(node).forEach(walk)
    if (node.type === 'paragraph' || node.type === 'heading') parts.push('\n')
  }
  walk(content)
  return parts.join('').trim().slice(0, limit)
}

export function countWords(content: Json | null | undefined): number {
  return plainText(content).split(/\s+/).filter(Boolean).length
}
