import { useCallback, useEffect, useRef } from 'react'

/**
 * Откладывает вызов функции до паузы в delay мс.
 * flush() вызывает отложенное немедленно, cancel() — отменяет.
 */
export function useDebouncedCallback<Args extends unknown[]>(fn: (...args: Args) => void, delay: number) {
  const fnRef = useRef(fn)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingArgs = useRef<Args | null>(null)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pendingArgs.current = null
  }, [])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const args = pendingArgs.current
    pendingArgs.current = null
    if (args) fnRef.current(...args)
  }, [])

  const run = useCallback(
    (...args: Args) => {
      pendingArgs.current = args
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [delay, flush],
  )

  useEffect(() => cancel, [cancel])

  return { run, flush, cancel, isPending: () => pendingArgs.current !== null }
}
