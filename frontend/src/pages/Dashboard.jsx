import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import UploadModal from '../components/UploadModal'
import LiveStatus from '../components/LiveStatus'
import { getStats, getCalls } from '../services/api'
import { useLive } from '../hooks/useLive'
import { DEPT_BAR_COLOR } from '../departments'


function sentimentClass(s) {
  if (s === 'frustrated') return 'sentiment-frustrated'
  if (s === 'satisfied') return 'sentiment-satisfied'
  return 'sentiment-neutral'
}

function statusTag(s) {
  if (s === 'processing') return 'tag tag-blue'
  if (s === 'routed') return 'tag tag-green'
  if (s === 'needs_review') return 'tag tag-amber'
  return 'tag tag-gray'
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function fmtId(id) {
  return '#' + id.slice(0, 6).toUpperCase()
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [calls, setCalls] = useState([])
  const [showUpload, setShowUpload] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Auto-refreshes every 15s (pauses when the tab is hidden or the user pauses it)
  useLive(async () => {
    try {
      const [s, c] = await Promise.all([getStats(), getCalls()])
      setStats(s)
      setCalls(c.calls || [])
      setError('')
    } catch (e) {
      setError('Could not reach backend. Make sure the server is running.')
      throw e
    } finally {
      setLoading(false)
    }
  })

  const handleDone = result => {
    setShowUpload(false)
    navigate(`/calls/${result.call_id}`)
  }

  const maxDeptCount = stats?.department_load?.length
    ? Math.max(...stats.department_load.map(d => d.open_count), 1)
    : 1

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="main-area">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-breadcrumb">
            <strong>Dashboard</strong>
          </div>
          <LiveStatus />
          <button className="btn btn-primary btn-sm" onClick={() => setShowUpload(true)}>
            Process New Call
          </button>
        </div>

        {/* Content */}
        <div className="page-content">
          {error && (
            <div className="review-banner" style={{ marginBottom: 20 }}>{error}</div>
          )}

          {/* Stat cards */}
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Calls Today</div>
              <div className="stat-value">{loading ? '—' : stats?.calls_today ?? 0}</div>
              <div className="stat-sub">Total processed</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Open Actions</div>
              <div className="stat-value">{loading ? '—' : stats?.open_actions ?? 0}</div>
              <div className="stat-sub">Across all departments</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Duration</div>
              <div className="stat-value">{loading ? '—' : `${stats?.avg_duration_seconds ?? 0}s`}</div>
              <div className="stat-sub">Per processed call</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Needs Review</div>
              <div className="stat-value warn">{loading ? '—' : stats?.needs_review ?? 0}</div>
              <div className="stat-sub warn">Low confidence flags</div>
            </div>
          </div>

          {/* Two-col */}
          <div className="two-col">
            {/* Recent Calls table */}
            <div>
              <div className="section-header">
                <span className="section-title">Recent Calls</span>
                <span className="section-sub">{calls.length} records</span>
              </div>
              <div className="card">
                {loading
                  ? <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
                  : calls.length === 0
                    ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-muted)', fontSize: 13 }}>
                        No calls processed yet. Upload one to get started.
                      </div>
                    : <div className="table-scroll"><table className="data-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Call ID</th>
                            <th>Name</th>
                            <th>Sentiment</th>
                            <th>Actions</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calls.map(c => (
                            <tr key={c.id} className="clickable"
                              onClick={() => navigate(`/calls/${c.id}`)}>
                              <td className="mono text-sm">{fmtTime(c.created_at)}</td>
                              <td className="mono text-sm">{fmtId(c.id)}</td>
                              <td>{c.patient_name || '—'}</td>
                              <td>
                                <span className={sentimentClass(c.sentiment)}>
                                  {c.sentiment ? c.sentiment.charAt(0).toUpperCase() + c.sentiment.slice(1) : '—'}
                                </span>
                              </td>
                              <td>{c.action_count ?? '—'}</td>
                              <td>
                                <span className={statusTag(c.status)}>
                                  {c.status === 'needs_review' ? 'Needs Review' :
                                    c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                }
              </div>
            </div>

            {/* Department load */}
            <div>
              <div className="section-header">
                <span className="section-title">Department Load</span>
                <span className="section-sub">Open items · click for queue</span>
              </div>
              <div className="card card-body">
                {loading
                  ? <div className="spinner" style={{ margin: '0 auto' }} />
                  : !stats?.department_load?.length
                    ? <p style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>No open actions.</p>
                    : stats.department_load.map(d => (
                        <div key={d.department} className="dept-row clickable"
                          onClick={() => navigate(`/board?dept=${encodeURIComponent(d.department)}`)}
                          title={`Open ${d.department} queue`}>
                          <div className="dept-row-header">
                            <span className="dept-name">{d.department}</span>
                            <span className="dept-count">{d.open_count} open</span>
                          </div>
                          <div className="dept-bar-track">
                            <div
                              className={`dept-bar-fill ${DEPT_BAR_COLOR[d.department] || 'bar-gray'}`}
                              style={{ width: `${Math.round((d.open_count / maxDeptCount) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={handleDone} />}
    </div>
  )
}
