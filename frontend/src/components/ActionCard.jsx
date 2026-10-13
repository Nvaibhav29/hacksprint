import { useState } from 'react'
import { updateAction } from '../services/api'

const PRIORITY_TAG = {
  high:   'tag tag-red',
  medium: 'tag tag-amber',
  low:    'tag tag-gray',
}

export default function ActionCard({ action, onUpdate }) {
  const [status, setStatus] = useState(action.status || 'open')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Fix #8: optimistic update, but roll back and show an error if the save fails.
  const handleStatus = async e => {
    const newStatus = e.target.value
    const previous = status
    setStatus(newStatus)
    setSaving(true)
    setError('')
    try {
      await updateAction(action.id, newStatus, action.assigned_to)
      if (onUpdate) onUpdate(action.id, newStatus)
    } catch (err) {
      setStatus(previous)
      setError(err.response?.data?.detail || 'Could not save status. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`action-card ${action.priority}`}>
      <div className="action-card-top">
        <span className="tag tag-outline">{action.department}</span>
        <span className={PRIORITY_TAG[action.priority] || 'tag tag-gray'}>
          {action.priority?.toUpperCase()}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--c-text-muted)' }}>
          {Math.round((action.confidence || 0) * 100)}% confidence
        </span>
      </div>

      <p className="action-text">{action.action_text}</p>

      {action.trigger_phrase && (
        <div style={{ marginTop: 6 }}>
          <p className="action-why-label">Why routed here</p>
          <span className="action-trigger">"{action.trigger_phrase}"</span>
          {action.reasoning && (
            <p className="action-reasoning">{action.reasoning}</p>
          )}
        </div>
      )}

      <div className="action-footer">
        <span className="action-assignee">
          {saving
            ? <span style={{ color: 'var(--c-text-muted)' }}>Saving…</span>
            : `Assigned: ${action.assigned_to || '—'}`
          }
        </span>
        <select
          className="status-select"
          value={status}
          onChange={handleStatus}
          disabled={saving}
          style={{ marginLeft: 'auto' }}
        >
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--c-danger)' }}>{error}</p>
      )}
    </div>
  )
}
