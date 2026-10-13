// Small formatting + note-building helpers shared across pages.

export const fmtId = id => '#' + String(id || '').slice(0, 6).toUpperCase()
export const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
export const statusLabel = s => (s === 'needs_review' ? 'Needs review' : s === 'in_progress' ? 'In progress' : cap(s) || '—')

export const fmtTime = iso =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
export const fmtDate = iso =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
export const fmtDateTime = iso =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

export function fmtDuration(s) {
  if (!s) return '—'
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function timeAgo(iso) {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 60 / 24)}d ago`
}

export const PRIORITY_RANK = { high: 3, medium: 2, low: 1 }

// owner is saved by the backend (migration 003). Older rows have none.
export const OWNER = {
  patient_request:  { label: 'Patient request',  group: 'Patient requests' },
  staff_commitment: { label: 'Staff commitment', group: 'Staff commitments' },
  follow_up:        { label: 'Follow-up',        group: 'Follow-ups' },
}
export const OWNER_ORDER = ['patient_request', 'staff_commitment', 'follow_up']

const ENTITY_LABELS = { medications: 'Medications', doctors: 'Doctors', dates: 'Dates', amounts: 'Amounts' }
export const entityRows = entities =>
  Object.entries(ENTITY_LABELS)
    .map(([k, label]) => ({ key: k, label, values: Array.isArray(entities?.[k]) ? entities[k].filter(Boolean) : [] }))
    .filter(r => r.values.length)

// Plain-text call note staff can paste into the hospital system, so nobody retypes it.
export function buildNote(call, actions) {
  const lines = []
  lines.push(`CALL NOTE ${fmtId(call.id)}  |  ${fmtDateTime(call.created_at)}`)
  lines.push(`Patient: ${call.patient_name || 'Not identified'}${call.patient_id ? `  (ID ${call.patient_id})` : ''}`)
  lines.push(`Sentiment: ${cap(call.sentiment) || 'Unknown'}${call.language_detected ? `  |  Language: ${call.language_detected}` : ''}`)
  lines.push('')
  lines.push('SUMMARY')
  lines.push(call.ai_summary || 'No summary generated.')
  const ents = entityRows(call.entities)
  if (ents.length) {
    lines.push('', 'KEY DETAILS')
    ents.forEach(e => lines.push(`- ${e.label}: ${e.values.join(', ')}`))
  }
  lines.push('', 'ACTIONS')
  if (!actions.length) lines.push('None.')
  actions.forEach((a, i) => {
    const o = OWNER[a.owner]?.label
    lines.push(`${i + 1}. [${(a.priority || 'medium').toUpperCase()}] ${a.department}: ${a.action_text}`)
    const meta = [o, a.due_by && `Due: ${a.due_by}`, a.assigned_to && `Assigned: ${a.assigned_to}`, `Status: ${statusLabel(a.status || 'open')}`].filter(Boolean)
    lines.push(`   ${meta.join('  |  ')}`)
  })
  return lines.join('\n')
}

export function downloadText(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall through */ }
  try {
    const t = document.createElement('textarea')
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'
    document.body.appendChild(t); t.select()
    const ok = document.execCommand('copy'); t.remove(); return ok
  } catch { return false }
}
