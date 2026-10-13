import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout, { useUpload } from '../components/Layout'
import { IconArrow } from '../components/Icons'
import { getStats, getCalls, getActions } from '../services/api'
import { useLive } from '../hooks/useLive'
import { fmtId, fmtTime, fmtDuration, statusLabel, timeAgo, OWNER } from '../lib/format'

const statusTag = s =>
  s === 'processing' ? 'tag tag-blue' : s === 'routed' ? 'tag tag-green' : s === 'needs_review' ? 'tag tag-amber' : 'tag tag-gray'

const STEPS = [
  ['01', 'Capture', 'Upload a call recording in Hindi, Kannada, English or a mix.'],
  ['02', 'Transcribe', 'Speech is converted to text with a fallback chain so calls are not lost.'],
  ['03', 'Structure', 'A summary, sentiment, key details and discrete actions are extracted.'],
  ['04', 'Route', 'Each action goes to Billing, Insurance, Clinical or another team, with the reason shown.'],
]

function Body() {
  const navigate = useNavigate()
  const openUpload = useUpload()
  const [stats, setStats] = useState(null)
  const [calls, setCalls] = useState([])
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useLive(async () => {
    try {
      const [s, c, a] = await Promise.all([getStats(), getCalls(), getActions()])
      setStats(s); setCalls(c.calls || []); setActions(a); setError('')
    } catch (e) {
      setError('Could not reach the backend. Make sure the server is running.')
      throw e
    } finally {
      setLoading(false)
    }
  })

  const unresolved = useMemo(() => actions.filter(a => a.status !== 'resolved'), [actions])
  const inProgress = unresolved.filter(a => a.status === 'in_progress').length
  const highOpen = useMemo(
    () => unresolved.filter(a => a.priority === 'high')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [unresolved])

  const deptLoad = useMemo(() => {
    const m = {}
    unresolved.forEach(a => {
      const d = (m[a.department] ||= { department: a.department, total: 0, high: 0 })
      d.total += 1
      if (a.priority === 'high') d.high += 1
    })
    return Object.values(m).sort((a, b) => b.total - a.total || b.high - a.high)
  }, [unresolved])
  const maxDept = Math.max(1, ...deptLoad.map(d => d.total))

  const mix = useMemo(() => {
    const m = { frustrated: 0, neutral: 0, satisfied: 0 }
    calls.forEach(c => { m[c.sentiment in m ? c.sentiment : 'neutral'] += 1 })
    return m
  }, [calls])
  const mixTotal = calls.length

  const dash = loading ? '—' : undefined
  const empty = !loading && !error && calls.length === 0

  return (
    <>
      {error && <div className="banner" role="alert">{error}</div>}

      <section className="kpis" aria-label="Key numbers">
        <div className="kpi">
          <div className="kpi-label">Calls today</div>
          <div className="kpi-value">{dash ?? stats?.calls_today ?? 0}</div>
          <div className="kpi-note">Processed since midnight</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Unresolved actions</div>
          <div className="kpi-value">{dash ?? unresolved.length}</div>
          <div className="kpi-note">{inProgress} in progress</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">High priority</div>
          <div className={`kpi-value ${highOpen.length ? 'alert' : ''}`}>{dash ?? highOpen.length}</div>
          <div className="kpi-note">Waiting on a team</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Needs review</div>
          <div className="kpi-value">{dash ?? stats?.needs_review ?? 0}</div>
          <div className="kpi-note">Low-confidence calls</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Avg call length</div>
          <div className="kpi-value">{dash ?? fmtDuration(stats?.avg_duration_seconds)}</div>
          <div className="kpi-note">Minutes, today</div>
        </div>
      </section>

      {empty && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">How a call becomes work</h2>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={openUpload}>Process your first call</button>
          </div>
          <div className="how">
            {STEPS.map(([n, h, p]) => (
              <div className="how-step" key={n}>
                <div className="how-num">{n}</div><h4>{h}</h4><p>{p}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid-main">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Needs attention</h2>
              <span className="panel-sub">High-priority actions still open</span>
            </div>
            {loading
              ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
              : highOpen.length === 0
                ? <div className="empty"><h3>Nothing urgent</h3>No high-priority actions are waiting right now.</div>
                : highOpen.slice(0, 6).map(a => (
                    <div key={a.id} className={`queue-item ${a.priority}`} role="link" tabIndex={0}
                      onClick={() => navigate(`/calls/${a.call_id}`)}
                      onKeyDown={e => e.key === 'Enter' && navigate(`/calls/${a.call_id}`)}>
                      <div className="queue-rule" />
                      <div>
                        <div className="queue-text">{a.action_text}</div>
                        <div className="queue-meta">
                          <span className="route"><IconArrow /> {a.department}</span>
                          <span>{a.patient_name || 'Unknown patient'}</span>
                          {OWNER[a.owner] && <span>{OWNER[a.owner].label}</span>}
                          {a.due_by && <span>Due {a.due_by}</span>}
                        </div>
                      </div>
                      <div className="queue-age">{timeAgo(a.created_at)}</div>
                    </div>
                  ))}
            {highOpen.length > 6 && (
              <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line)' }}>
                <button className="link-btn" onClick={() => navigate('/board')}>View all {highOpen.length} on the queue board</button>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Recent calls</h2>
              <button className="link-btn panel-sub" onClick={() => navigate('/calls')}>All calls</button>
            </div>
            {loading
              ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
              : calls.length === 0
                ? <div className="empty">No calls yet.</div>
                : <div className="table-scroll"><table className="data-table">
                    <thead><tr><th>Time</th><th>Patient</th><th>Summary</th><th>Actions</th><th>Status</th></tr></thead>
                    <tbody>
                      {calls.slice(0, 8).map(c => (
                        <tr key={c.id} className="clickable" onClick={() => navigate(`/calls/${c.id}`)}>
                          <td className="mono text-sm">{fmtTime(c.created_at)}</td>
                          <td>
                            <div className="cell-name">{c.patient_name || 'Unidentified'}</div>
                            <div className="cell-sub mono">{c.patient_id || fmtId(c.id)}</div>
                          </td>
                          <td><div className="cell-summary">{c.ai_summary || '—'}</div></td>
                          <td>{c.action_count ?? '—'}</td>
                          <td><span className={statusTag(c.status)}>{statusLabel(c.status)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>}
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Department load</h2>
              <span className="panel-sub">Unresolved</span>
            </div>
            <div className="panel-body" style={{ paddingTop: 8 }}>
              {loading ? <div className="spinner" style={{ margin: '0 auto' }} />
                : deptLoad.length === 0 ? <p className="text-sm text-muted">No unresolved actions.</p>
                : deptLoad.map(d => (
                    <button key={d.department} className="dept-row"
                      onClick={() => navigate(`/board?dept=${encodeURIComponent(d.department)}`)}
                      title={`Open the ${d.department} queue`}>
                      <div className="dept-row-header">
                        <span className="dept-name">{d.department}</span>
                        <span className="dept-count">
                          {d.high > 0 && <><b style={{ color: 'var(--high)' }}>{d.high} urgent</b> · </>}
                          <b>{d.total}</b> open
                        </span>
                      </div>
                      <div className="dept-bar-track" style={{ width: `${Math.max(8, (d.total / maxDept) * 100)}%` }}>
                        <div className="dept-bar-fill hot" style={{ width: `${(d.high / d.total) * 100}%` }} />
                        <div className="dept-bar-fill" style={{ width: `${((d.total - d.high) / d.total) * 100}%` }} />
                      </div>
                    </button>
                  ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Caller sentiment</h2>
              <span className="panel-sub">Last {mixTotal || 0} calls</span>
            </div>
            <div className="panel-body">
              {mixTotal === 0 ? <p className="text-sm text-muted">Appears after the first call.</p> : (
                <>
                  <div className="mix" role="img"
                    aria-label={`${mix.frustrated} frustrated, ${mix.neutral} neutral, ${mix.satisfied} satisfied`}>
                    {['frustrated', 'neutral', 'satisfied'].map(k =>
                      mix[k] > 0 && <i key={k} className={`m-${k}`} style={{ width: `${(mix[k] / mixTotal) * 100}%` }} />)}
                  </div>
                  <div className="mix-legend">
                    <span className="l-frustrated">{mix.frustrated} frustrated</span>
                    <span>{mix.neutral} neutral</span>
                    <span className="l-satisfied">{mix.satisfied} satisfied</span>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

export default function Dashboard() {
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
  return <Layout eyebrow={today} title="Operations overview"><Body /></Layout>
}
