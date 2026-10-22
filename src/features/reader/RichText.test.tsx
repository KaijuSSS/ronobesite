import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Json } from '@/types/database'
import { RichText } from './RichText'
import { countWords, plainText, safeHref } from './rich-text-utils'

const doc = (...content: Json[]): Json => ({ type: 'doc', content })
const p = (...content: Json[]): Json => ({ type: 'paragraph', content })
const text = (value: string, marks?: Json[]): Json => (marks ? { type: 'text', text: value, marks } : { type: 'text', text: value })

describe('RichText', () => {
  it('выводит абзацы, заголовки и форматирование', () => {
    render(
      <RichText
        content={doc(
          { type: 'heading', attrs: { level: 2 }, content: [text('Пролог')] },
          p(text('Обычный '), text('жирный', [{ type: 'bold' }]), text(' и '), text('курсив', [{ type: 'italic' }])),
          { type: 'horizontalRule' },
        )}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Пролог' })).toBeInTheDocument()
    expect(screen.getByText('жирный').tagName).toBe('STRONG')
    expect(screen.getByText('курсив').tagName).toBe('EM')
    expect(document.querySelector('hr')).not.toBeNull()
  })

  it('не выполняет HTML и скрипты из текста', () => {
    const { container } = render(
      <RichText content={doc(p(text('<script>alert(1)</script><img src=x onerror=alert(2)>')))} />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })

  it('отбрасывает опасные ссылки и неизвестные узлы', () => {
    const { container } = render(
      <RichText
        content={doc(
          p(text('плохая', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
          p(text('хорошая', [{ type: 'link', attrs: { href: 'https://example.com/page' } }])),
          { type: 'iframe', attrs: { src: 'https://evil.example' }, content: [text('вложенный текст')] },
          { type: 'image', attrs: { src: 'https://evil.example/x.png' } },
        )}
      />,
    )
    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://example.com/page')
    expect(links[0]).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('вложенный текст')
  })

  it('игнорирует некорректный документ', () => {
    const { container } = render(<RichText content={{ type: 'paragraph' }} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('утилиты документа', () => {
  it('safeHref пропускает только http(s) и mailto', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com/')
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<b>x</b>')).toBeNull()
    expect(safeHref('  JaVaScRiPt:alert(1)')).toBeNull()
    expect(safeHref(42)).toBeNull()
  })

  it('считает слова и извлекает текст', () => {
    const content = doc(p(text('Раз два')), p(text('три')))
    expect(countWords(content)).toBe(3)
    expect(plainText(content)).toBe('Раз два\nтри')
  })
})
