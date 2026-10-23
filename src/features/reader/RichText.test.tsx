import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Json } from '@/types/database'
import { RichText } from './RichText'
import { countWords, plainText, safeHref, safeImagePath } from './rich-text-utils'

vi.mock('@/lib/media', () => ({
  signMediaPath: vi.fn(async (path: string) => `https://storage.test/signed/${path}`),
}))

const IMAGE_PATH = 'chapters/0b7c1c2e-5f0a-4d36-9a3e-6d2f1f6a7b10/9d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f.webp'

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

  it('показывает загруженные на сайт изображения', async () => {
    render(<RichText content={doc({ type: 'image', attrs: { path: IMAGE_PATH, alt: 'Карта королевства' } })} />)
    const img = await screen.findByRole('img', { name: 'Карта королевства' })
    expect(img).toHaveAttribute('src', `https://storage.test/signed/${IMAGE_PATH}`)
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

  it('safeImagePath пропускает только файлы из папки глав', () => {
    expect(safeImagePath(IMAGE_PATH)).toBe(IMAGE_PATH)
    expect(safeImagePath('https://evil.example/x.png')).toBeNull()
    expect(safeImagePath('avatars/0b7c1c2e-5f0a-4d36-9a3e-6d2f1f6a7b10/9d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f.webp')).toBeNull()
    expect(safeImagePath('chapters/../secret.webp')).toBeNull()
    expect(safeImagePath(null)).toBeNull()
  })

  it('считает слова и извлекает текст', () => {
    const content = doc(p(text('Раз два')), p(text('три')))
    expect(countWords(content)).toBe(3)
    expect(plainText(content)).toBe('Раз два\nтри')
  })
})
