import { useEffect, useState } from 'react'
import { useLiveState, setPaused } from '../hooks/useLive'

function ago(ts, now) {
  if (!ts) return ''
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

// Real status: green = auto-refreshing, amber = paused, red = backend unreachable.
export default function LiveStatus() {
  const { status, lastUpdated, paused } = useLiveState()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const label = status === 'offline' ? 'Offline' : status === 'paused' ? 'Paused' : 'Live'
  return (
    <button
      className="live-badge"
      onClick={() => setPaused(!paused)}
      title={paused ? 'Click to resume auto-refresh' : 'Auto-refreshing every 15s. Click to pause.'}
    >
      <span className={`status-dot ${status}`} />
      <span>{label}</span>
      {lastUpdated && status !== 'offline' && <span className="live-ago">· {ago(lastUpdated, now)}</span>}
    </button>
  )
}
