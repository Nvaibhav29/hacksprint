import { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import UploadModal from '../components/UploadModal'
import LiveStatus from '../components/LiveStatus'
import { getActions, updateAction } from '../services/api'
import { useLive } from '../hooks/useLive'
import { DEPARTMENTS } from '../departments'

const DEPTS = DEPARTMENTS
const COLUMNS = [
  { key: 'open',        label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved',    label: 'Resolved' },
]
const PRIORITY_TAG = { high: 'tag tag-red', medium: 'tag tag-amber', low: 'tag tag-gray' }
const PRIORITY_RANK = { high: 3, medium: 2, low: 1 }
const RESOLVED_VISIBLE = 20

function timeAgo(iso) {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 60 / 24)}d ago`
}

export default function Board() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const dept = DEPTS.includes(params.get('dept')) ? params.get('dept') : 'All'

  const [actions, setActions] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [showAllResolved, setShowAllResolved] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const busy = useRef(0)   // don't let a background refresh overwrite an in-flight status change

  useLive(async () => {
    try {
      const rows = await getActions()
      if (busy.current === 0) setActions(rows)
      setLoaded(true)
      setError('')
    } catch (e) {
      setError('Could not reach backend. Make sure the server is running.')
      setLoaded(true)
      throw e          // lets the Live badge show "Offline"
    }
  })

  const move = async (id, status) => {
    const current = actions.find(a => a.id === id)
    if (!current || current.status === status) return
    const previous = current.status
    setActions(list => list.map(a => (a.id === id ? { ...a, status } : a)))
    busy.current += 1
    try {
      await updateAction(id, status, current.assigned_to)
    } catch (err) {
      setActions(list => list.map(a => (a.id === id ? { ...a, status: previous } : a)))
      setToast(err.response?.data?.detail || 'Could not save the change. Please try again.')
      setTimeout(() => setToast(''), 4000)
    } finally {
      busy.current -= 1
    }
  }

  const counts = Object.fromEntries(
    DEPTS.map(d => [d, actions.filter(a => a.department === d && a.status !== 'resolved').length])
  )
  const totalOpen = actions.filter(a => a.status !== 'resolved').length
  const visible = actions.filter(a => dept === 'All' || a.department === dept)

  const byCol = key =>
    visible
      .filter(a => (a.status || 'open') === key)
      .sort((a, b) =>
        (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0) ||
        new Date(b.created_at) - new Date(a.created_at))

  const selectDept = d => {
    if (d === 'All') setParams({})
    else setParams({ dept: d })
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <div className="topbar">
          <div className="topbar-breadcrumb"><strong>Queue Board</strong></div>
          <LiveStatus />
          <button className="btn btn-primary btn-sm" onClick={() => setShowUpload(true)}>
            Process New Call
          </button>
        </div>

        <div className="page-content">
          {error && <div className="review-banner">{error}</div>}

          <div className="dept-tabs" role="tablist" aria-label="Department">
            {['All', ...DEPTS].map(d => (
              <button key={d} role="tab" aria-selected={dept === d}
                className={`dept-tab ${dept === d ? 'active' : ''}`}
                onClick={() => selectDept(d)}>
                {d}
                <span className="dept-tab-count">{d === 'All' ? totalOpen : counts[d]}</span>
              </button>
            ))}
          </div>

          {!loaded ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
          ) : (
            <div className="board">
              {COLUMNS.map(col => {
                const items = byCol(col.key)
                const shown = col.key === 'resolved' && !showAllResolved ? items.slice(0, RESOLVED_VISIBLE) : items
                return (
                  <div key={col.key}
                    className={`board-col ${overCol === col.key ? 'drop' : ''}`}
                    onDragOver={e => { e.preventDefault(); setOverCol(col.key) }}
                    onDragLeave={() => setOverCol(c => (c === col.key ? null : c))}
                    onDrop={e => {
                      e.preventDefault()
                      setOverCol(null)
                      const id = e.dataTransfer.getData('text/plain') || dragId
                      if (id) move(id, col.key)
                      setDragId(null)
                    }}>
                    <div className="board-col-head">
                      <span>{col.label}</span>
                      <span className="dept-tab-count">{items.length}</span>
                    </div>

                    {items.length === 0 && <div className="board-empty">Nothing here</div>}

                    {shown.map(a => (
                      <div key={a.id}
                        className={`ticket ${a.priority} ${dragId === a.id ? 'dragging' : ''}`}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move'; setDragId(a.id) }}
                        onDragEnd={() => { setDragId(null); setOverCol(null) }}>
                        <div className="action-card-top">
                          {dept === 'All' && <span className="tag tag-outline">{a.department}</span>}
                          <span className={PRIORITY_TAG[a.priority] || 'tag tag-gray'}>{a.priority?.toUpperCase()}</span>
                          <span className="ticket-time">{timeAgo(a.created_at)}</span>
                        </div>
                        <p className="action-text">{a.action_text}</p>
                        <button className="ticket-patient" onClick={() => navigate(`/calls/${a.call_id}`)}>
                          {a.patient_name || 'Unknown patient'}
                          {a.patient_id ? <span className="mono"> · {a.patient_id}</span> : null}
                        </button>
                        <div className="ticket-foot">
                          <span className="text-sm text-muted">{a.assigned_to || '—'}</span>
                          <select className="status-select" value={a.status || 'open'}
                            aria-label="Change status"
                            onChange={e => move(a.id, e.target.value)}>
                            {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}

                    {col.key === 'resolved' && items.length > RESOLVED_VISIBLE && (
                      <button className="btn btn-outline btn-sm" style={{ width: '100%' }}
                        onClick={() => setShowAllResolved(v => !v)}>
                        {showAllResolved ? 'Show fewer' : `Show all ${items.length}`}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-sm text-muted" style={{ marginTop: 12 }}>
            Drag a ticket between columns, or use the status menu on the ticket.
          </p>
        </div>
      </div>

      {toast && <div className="toast" role="alert">{toast}</div>}
      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)}
          onDone={r => { setShowUpload(false); navigate(`/calls/${r.call_id}`) }} />
      )}
    </div>
  )
}
