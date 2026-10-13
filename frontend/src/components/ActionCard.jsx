import { useState } from 'react'
import { updateAction } from '../services/api'
import { DEPARTMENTS } from '../departments'
import { OWNER, statusLabel } from '../lib/format'
import { IconArrow, IconClock } from './Icons'

const STATUSES = ['open', 'in_progress', 'resolved']

// One extracted action: what to do, who it is routed to, and the evidence for why.
// Staff can change the status or re-route to another department (saved to the backend).
export default function ActionCard({ action, onChange, onHover, hot }) {
  const [status, setStatus] = useState(action.status || 'open')
  const [dept, setDept] = useState(action.department)
  const [assignee, setAssignee] = useState(action.assigned_to)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (patch, apply, rollback) => {
    apply()
    setSaving(true)
    setError('')
    try {
      const res = await updateAction(action.id, patch)
      if (res?.updated?.assigned_to) setAssignee(res.updated.assigned_to)
      onChange?.(action.id, { ...patch, ...(res?.updated ? { assigned_to: res.updated.assigned_to } : {}) })
    } catch (err) {
      rollback()
      setError(err.response?.data?.detail || 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = e => {
    const next = e.target.value, prev = status
    save({ status: next }, () => setStatus(next), () => setStatus(prev))
  }
  const changeDept = e => {
    const next = e.target.value, prev = dept, prevA = assignee
    save({ department: next }, () => setDept(next), () => { setDept(prev); setAssignee(prevA) })
  }

  const conf = Math.round((action.confidence || 0) * 100)
  const lowConf = conf < 70
  const owner = OWNER[action.owner]

  return (
    <article className={`action ${action.priority} ${status === 'resolved' ? 'resolved' : ''} ${hot ? 'hot' : ''}`}
      onMouseEnter={() => onHover?.(action.trigger_phrase)} onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(action.trigger_phrase)} onBlur={() => onHover?.(null)}>
      <div className="action-top">
        <span className={`prio ${action.priority}`}>{action.priority}</span>
        <span className="route" title="Routed to this department">
          <IconArrow /> {dept}
        </span>
        {owner && <span className="tag tag-outline">{owner.label}</span>}
        <span className={`action-conf ${lowConf ? 'low' : ''}`} title="Model confidence for this action">
          {lowConf ? 'Check · ' : ''}{conf}%
        </span>
      </div>

      <p className="action-text">{action.action_text}</p>

      {action.due_by && (
        <div className="due"><IconClock /> Due: <strong style={{ fontWeight: 500 }}>{action.due_by}</strong></div>
      )}

      {action.trigger_phrase && (
        <div className="evidence">
          <div className="evidence-label">Said on the call</div>
          <q>{action.trigger_phrase}</q>
          {action.reasoning && <p>{action.reasoning}</p>}
        </div>
      )}

      <div className="action-foot">
        <span>{saving ? 'Saving…' : <>Assigned to <strong style={{ fontWeight: 500, color: 'var(--ink)' }}>{assignee || '—'}</strong></>}</span>
        <span className="spacer" />
        <label>
          <span className="text-muted">Route to</span>
          <select className="status-select" value={dept} onChange={changeDept} disabled={saving} aria-label="Route to department">
            {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select className="status-select" value={status} onChange={changeStatus} disabled={saving} aria-label="Status">
            {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
    </article>
  )
}
