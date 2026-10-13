import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react'

// Tiny shared store so the topbar "Live" badge and the sidebar dot always agree.
let state = { status: 'live', lastUpdated: null, paused: false }   // live | offline | paused
const listeners = new Set()
const set = patch => { state = { ...state, ...patch }; listeners.forEach(l => l()) }

export const useLiveState = () =>
  useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => state)

export const setPaused = paused => set({ paused, status: paused ? 'paused' : 'live' })

/**
 * Poll `fetcher` every `interval` ms while the tab is visible.
 * - fetcher must throw on failure (that flips the badge to "Offline")
 * - re-fetches immediately whenever `deps` change (filters, page...)
 * - pauses when the user pauses it or the tab is hidden
 */
export function useLive(fetcher, { interval = 15000, deps = [] } = {}) {
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const live = useLiveState()

  const refresh = useCallback(async () => {
    try {
      await fetcherRef.current()
      set({ status: state.paused ? 'paused' : 'live', lastUpdated: Date.now() })
    } catch {
      set({ status: 'offline' })
    }
  }, [])

  const depKey = JSON.stringify(deps)
  useEffect(() => { refresh() }, [refresh, depKey])

  useEffect(() => {
    if (live.paused) return
    const tick = () => { if (!document.hidden) refresh() }
    const t = setInterval(tick, interval)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [live.paused, interval, refresh])

  return { refresh, ...live }
}
