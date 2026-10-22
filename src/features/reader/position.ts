/** Доля прочитанного текста статьи: 0 — начало, 1 — конец. */
export function measurePosition(article: HTMLElement | null): number {
  if (!article) return 0
  const rect = article.getBoundingClientRect()
  const scrollable = article.offsetHeight - window.innerHeight
  if (scrollable <= 0) return 1
  return Math.min(1, Math.max(0, -rect.top / scrollable))
}

/** Прокрутить окно так, чтобы была видна указанная доля статьи. */
export function scrollToPosition(article: HTMLElement, position: number) {
  const top = article.getBoundingClientRect().top + window.scrollY
  const scrollable = article.offsetHeight - window.innerHeight
  window.scrollTo({ top: Math.max(0, top + scrollable * position), behavior: 'auto' })
}
