import { useState, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { IconClock } from '../components/Icons'
import AppointmentBar from '../components/AppointmentBar'
import { getActions, updateAction } from '../services/api'
import { useLive } from '../hooks/useLive'
import { DEPARTMENTS } from '../departments'
import { timeAgo, OWNER, PRIORITY_RANK } from '../lib/format'

const COLUMNS = [
  { key: 'open',        label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved',    label: 'Resolved' },
]
const RESOLVED_VISIBLE = 15

function Body() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const dept = DEPARTMENTS.includes(params.get('dept')) ? params.get('dept') : 'All'

  const [actions, setActions] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [showAllResolved, setShowAllResolved] = useState(false)
  const [highOnly, setHighOnly] = useState(false)
  const [q, setQ] = useState('')
  const busy = useRef(0)   // don't let a background refresh overwrite an in-flight change

  useLive(async () => {
    try {
      const rows = await getActions()
      if (busy.current === 0) setActions(rows)
      setLoaded(true); setError('')
    } catch (e) {
      setError('Could not reach the backend. Make sure the server is running.')
      setLoaded(true)
      throw e
    }
  })

  const move = async (id, status) => {
    const current = actions.find(a => a.id === id)
    if (!current || current.status === status) return
    const previous = current.status
    setActions(list => list.map(a => (a.id === id ? { ...a, status } : a)))
    busy.current += 1
    try {
      await updateAction(id, { status })
    } catch (err) {
      setActions(list => list.map(a => (a.id === id ? { ...a, status: previous } : a)))
      setToast(err.response?.data?.detail || 'Could not save the change. Please try again.')
      setTimeout(() => setToast(''), 4000)
    } finally {
      busy.current -= 1
    }
  }

  const counts = useMemo(() => Object.fromEntries(
    DEPARTMENTS.map(d => [d, actions.filter(a => a.department === d && a.status !== 'resolved').length])), [actions])
  const maxCount = Math.max(1, ...Object.values(counts))
  const totalOpen = actions.filter(a => a.status !== 'resolved').length

  const term = q.trim().toLowerCase()
  const visible = actions.filter(a =>
    (dept === 'All' || a.department === dept) &&
    (!highOnly || a.priority === 'high') &&
    (!term || [a.action_text, a.patient_name, a.patient_id].some(v => (v || '').toLowerCase().includes(term))))

  const byCol = key =>
    visible.filter(a => (a.status || 'open') === key)
      .sort((a, b) =>
        (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0) ||
        new Date(b.created_at) - new Date(a.created_at))

  return (
    <>
      {error && <div className="banner" role="alert">{error}</div>}

      <div className="board-layout">
        <nav className="dept-rail" aria-label="Department">
          <button className={`rail-item ${dept === 'All' ? 'active' : ''}`} onClick={() => setParams({})}>
            <span className="rail-name">All departments</span><span className="rail-count">{totalOpen}</span>
          </button>
          {DEPARTMENTS.map(d => (
            <button key={d} className={`rail-item ${dept === d ? 'active' : ''}`}
              aria-current={dept === d ? 'true' : undefined}
              onClick={() => setParams({ dept: d })}>
              <span className="rail-name">{d}</span>
              <span className="rail-count">{counts[d]}</span>
              <span className="rail-bar"><i style={{ width: `${(counts[d] / maxCount) * 100}%` }} /></span>
            </button>
          ))}
        </nav>

        <div className="board-main">
          {dept === 'Scheduling' && (
            <section className="panel board-appt">
              <div className="board-appt-title">Appointments</div>
              <AppointmentBar actions={actions} loading={!loaded} />
            </section>
          )}
          <div className="board-tools">
            <input className="field-input" style={{ maxWidth: 300 }} type="search" placeholder="Search action, patient or ID"
              aria-label="Search tickets" value={q} onChange={e => setQ(e.target.value)} />
            <label className="check">
              <input type="checkbox" checked={highOnly} onChange={e => setHighOnly(e.target.checked)} /> High priority only
            </label>
            <span className="text-sm text-muted" style={{ marginLeft: 'auto' }}>Drag a ticket to change its status</span>
          </div>

      {!loaded ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
      ) : (
        <div className="board">
          {COLUMNS.map(col => {
            const items = byCol(col.key)
            const shown = col.key === 'resolved' && !showAllResolved ? items.slice(0, RESOLVED_VISIBLE) : items
            return (
              <section key={col.key} aria-label={col.label}
                className={`board-col ${overCol === col.key ? 'drop' : ''}`}
                onDragOver={e => { e.preventDefault(); setOverCol(col.key) }}
                onDragLeave={() => setOverCol(c => (c === col.key ? null : c))}
                onDrop={e => {
                  e.preventDefault(); setOverCol(null)
                  const id = e.dataTransfer.getData('text/plain') || dragId
                  if (id) move(id, col.key)
                  setDragId(null)
                }}>
                <div className="board-col-head"><span>{col.label}</span><span className="dept-tab-count">{items.length}</span></div>
                {items.length === 0 && <div className="board-empty">{term || highOnly ? 'No matches' : 'Nothing here'}</div>}

                {shown.map(a => (
                  <article key={a.id}
                    className={`ticket ${a.priority} ${dragId === a.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move'; setDragId(a.id) }}
                    onDragEnd={() => { setDragId(null); setOverCol(null) }}>
                    <div className="ticket-top">
                      <span className={`prio ${a.priority}`}>{a.priority}</span>
                      {dept === 'All' && <span className="tag tag-outline">{a.department}</span>}
                      {OWNER[a.owner] && <span className="text-muted">{OWNER[a.owner].label}</span>}
                      <span className="ticket-time">{timeAgo(a.created_at)}</span>
                    </div>
                    <p className="action-text">{a.action_text}</p>
                    {a.due_by && <div className="due"><IconClock /> {a.due_by}</div>}
                    <button className="ticket-patient" onClick={() => navigate(`/calls/${a.call_id}`)}>
                      {a.patient_name || 'Unknown patient'}{a.patient_id ? <span className="mono"> · {a.patient_id}</span> : null}
                    </button>
                    <div className="ticket-foot">
                      <span>{a.assigned_to || '—'}</span>
                      <select className="status-select" value={a.status || 'open'} aria-label="Change status"
                        onChange={e => move(a.id, e.target.value)}>
                        {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </div>
                  </article>
                ))}

                {col.key === 'resolved' && items.length > RESOLVED_VISIBLE && (
                  <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => setShowAllResolved(v => !v)}>
                    {showAllResolved ? 'Show fewer' : `Show all ${items.length}`}
                  </button>
                )}
              </section>
            )
          })}
        </div>
      )}
        </div>
      </div>
      {toast && <div className="toast" role="alert">{toast}</div>}
    </>
  )
}

export default function Board() {
  return <Layout eyebrow="Department queues" title="Queue board"><Body /></Layout>
}
