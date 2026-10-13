import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import ActionCard from '../components/ActionCard'
import { IconCopy, IconDownload } from '../components/Icons'
import { getCall, updateCall } from '../services/api'
import { URGENT_DEPARTMENTS } from '../departments'
import {
  fmtId, fmtDuration, fmtDateTime, cap, OWNER, OWNER_ORDER, entityRows,
  buildNote, copyText, downloadText,
} from '../lib/format'

const SPEAKER_CYCLE = [null, 'PATIENT', 'STAFF']
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Underline every trigger phrase; the one for the hovered action is shown strongly.
// String.split with a capture group puts each match at an odd index (no stateful /g regex).
function Highlight({ text, triggers, active }) {
  const clean = [...new Set(triggers.map(t => (t || '').trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!clean.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${clean.map(esc).join('|')})`, 'i'))
  const act = (active || '').trim().toLowerCase()
  return (
    <>
      {parts.map((p, i) => i % 2 === 1
        ? <mark key={i} className={act && p.toLowerCase() === act ? 'live' : ''}>{p}</mark>
        : <span key={i}>{p}</span>)}
    </>
  )
}

// ASR gives no speaker labels, so split the paragraph into readable turns.
function splitTurns(raw = '') {
  const out = []
  raw.split('\n').map(l => l.trim()).filter(Boolean).forEach(block => {
    block.split(/(?<=[.?!।|])\s+/).forEach(piece => {
      const t = piece.trim()
      if (!t) return
      if (out.length && (t.length < 20 || out[out.length - 1].text.length < 20)) out[out.length - 1].text += ' ' + t
      else out.push({ speaker: null, text: t })
    })
  })
  return out.map((l, i) => ({ ...l, lineNum: i + 1 }))
}

function parseTranscript(raw = '') {
  if (!raw) return { lines: [], tagged: false }
  if (/\[(PATIENT|STAFF)\]/i.test(raw)) {
    const parts = raw.split(/(\[(?:PATIENT|STAFF)\])/gi).filter(Boolean)
    const lines = []
    for (let i = 0; i < parts.length; i++) {
      const tag = parts[i].match(/^\[(PATIENT|STAFF)\]$/i)
      if (tag) {
        const text = (parts[i + 1] || '').trim()
        if (text) lines.push({ lineNum: lines.length + 1, speaker: tag[1].toUpperCase(), text })
        i++
      }
    }
    if (lines.length) return { lines, tagged: true }
  }
  return { lines: splitTurns(raw), tagged: false }
}

const isUrgent = a => URGENT_DEPARTMENTS.includes(a.department) && a.priority === 'high' && a.status !== 'resolved'

function Body({ id }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [patches, setPatches] = useState({})          // action id -> fields changed on this page
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [headerError, setHeaderError] = useState('')
  const [headerSaving, setHeaderSaving] = useState(false)
  const [verifiedLocal, setVerifiedLocal] = useState(false)
  const [speakerTags, setSpeakerTags] = useState({})
  const [activeTrigger, setActiveTrigger] = useState(null)
  const [toast, setToast] = useState('')
  const transcriptRef = useRef(null)

  useEffect(() => {
    getCall(id).then(setData).catch(() => setError('Call not found or backend unavailable.')).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    try { setSpeakerTags(JSON.parse(localStorage.getItem(`speakers:${id}`) || '{}')) } catch { setSpeakerTags({}) }
  }, [id])

  const call = data?.call
  const actions = (data?.actions || []).map(a => (patches[a.id] ? { ...a, ...patches[a.id] } : a))
  const verified = !!call?.patient_verified || verifiedLocal
  const urgentActions = actions.filter(isUrgent)
  const hasClinical = actions.some(a => URGENT_DEPARTMENTS.includes(a.department))
  const urgent = urgentActions.length > 0 || (!!call?.urgent_clinical_flag && !hasClinical)
  const triggers = actions.map(a => a.trigger_phrase).filter(Boolean)
  const entities = entityRows(call?.entities)

  const { lines: parsed, tagged } = useMemo(() => parseTranscript(call?.raw_transcript), [call?.raw_transcript])
  const lines = parsed.map((l, i) => ({ ...l, speaker: tagged ? l.speaker : (speakerTags[i] || null) }))
  const isHit = text => !!activeTrigger && text.toLowerCase().includes(activeTrigger.trim().toLowerCase())

  // bring the evidence line into view when an action is hovered
  useEffect(() => {
    if (!activeTrigger || !transcriptRef.current) return
    const el = transcriptRef.current.querySelector('.t-line.has-hit')
    if (!el) return
    const box = transcriptRef.current
    const top = el.offsetTop - box.offsetTop
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTo({ top: Math.max(0, top - 60), behavior: 'smooth' })
  }, [activeTrigger])

  const groups = useMemo(() => {
    const hasOwner = actions.some(a => OWNER[a.owner])
    if (!hasOwner) return [{ key: 'all', title: 'Actions', items: actions }]
    return OWNER_ORDER
      .map(k => ({ key: k, title: OWNER[k].group, items: actions.filter(a => (OWNER[a.owner] ? a.owner : 'patient_request') === k) }))
      .filter(g => g.items.length)
  }, [actions])

  const routeCounts = useMemo(() => {
    const m = {}
    actions.forEach(a => { m[a.department] = (m[a.department] || 0) + 1 })
    return Object.entries(m)
  }, [actions])

  const cycleSpeaker = i => {
    const cur = speakerTags[i] || null
    const next = SPEAKER_CYCLE[(SPEAKER_CYCLE.indexOf(cur) + 1) % SPEAKER_CYCLE.length]
    const updated = { ...speakerTags }
    if (next) updated[i] = next; else delete updated[i]
    setSpeakerTags(updated)
    try { localStorage.setItem(`speakers:${id}`, JSON.stringify(updated)) } catch { /* tags just won't persist */ }
  }

  const saveHeader = async body => {
    setHeaderSaving(true); setHeaderError('')
    try {
      const res = await updateCall(id, body)
      setData(d => ({ ...d, call: { ...d.call, ...res.updated } }))
      setVerifiedLocal(true); setEditing(false)
    } catch (err) {
      setHeaderError(err.response?.data?.detail || 'Could not save. Please try again.')
    } finally {
      setHeaderSaving(false)
    }
  }

  const flash = msg => { setToast(msg); setTimeout(() => setToast(''), 2400) }
  const copyNote = async () => flash((await copyText(buildNote(call, actions))) ? 'Call note copied' : 'Could not copy. Select the text manually.')
  const downloadJson = () =>
    downloadText(`call-${fmtId(call.id).slice(1)}.json`, JSON.stringify({ call: { ...call, raw_transcript: undefined }, actions }, null, 2), 'application/json')

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
  if (error) return <div className="banner" role="alert">{error}</div>
  if (!call) return null

  const conf = Math.round((call.confidence_score ?? 0.8) * 100)

  return (
    <>
      {urgent && (
        <div className="urgent-banner" role="alert">
          <strong>Urgent clinical attention</strong>
          <span>{urgentActions.length ? urgentActions.map(a => a.action_text).join(' · ') : 'The AI flagged this call as clinically urgent.'}</span>
        </div>
      )}

      <section className="panel patient-head">
        <div className="patient-avatar" aria-hidden="true">{(call.patient_name || '?').trim().charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div className="name-edit">
              <input className="field-input" autoFocus value={nameDraft} maxLength={120} placeholder="Patient name" aria-label="Patient name"
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveHeader({ patient_name: nameDraft, patient_verified: true })
                  if (e.key === 'Escape') setEditing(false)
                }} />
              <button className="btn btn-primary btn-sm" disabled={headerSaving}
                onClick={() => saveHeader({ patient_name: nameDraft, patient_verified: true })}>{headerSaving ? 'Saving…' : 'Save'}</button>
              <button className="btn btn-sm" disabled={headerSaving} onClick={() => { setEditing(false); setHeaderError('') }}>Cancel</button>
            </div>
          ) : (
            <div className="patient-name-row">
              <span className="patient-name">{call.patient_name || 'Name not detected'}</span>
              {verified
                ? <span className="tag tag-green">Verified</span>
                : <span className="tag tag-amber" title="The name comes from speech recognition and can be wrong">{call.patient_name ? 'Please verify' : 'Add name'}</span>}
              <button className="link-btn" onClick={() => { setNameDraft(call.patient_name || ''); setEditing(true); setHeaderError('') }}>Edit</button>
              {!verified && call.patient_name && (
                <button className="link-btn" disabled={headerSaving} onClick={() => saveHeader({ patient_verified: true })}>Confirm name</button>
              )}
            </div>
          )}
          <div className="meta-line">
            <span>Patient ID <b className="mono">{call.patient_id || 'not given'}</b></span>
            <span>Call <b className="mono">{fmtId(call.id)}</b></span>
            <span>{fmtDateTime(call.created_at)}</span>
            <span>Length <b>{fmtDuration(call.duration_seconds)}</b></span>
            {call.language_detected && <span>Language <b>{call.language_detected}</b></span>}
          </div>
          {headerError && <p className="err">{headerError}</p>}
        </div>
        <div className="head-actions">
          <button className="btn btn-sm" onClick={copyNote}><IconCopy /> Copy note</button>
          <button className="btn btn-sm" onClick={downloadJson}><IconDownload /> JSON</button>
        </div>
      </section>

      {call.needs_review && (
        <div className="banner">At least one action has low confidence. Check the evidence quote before acting on it.</div>
      )}

      <div className="call-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2 className="panel-title">Call summary</h2></div>
            <div className="panel-body">
              <p className="brief-summary">{call.ai_summary || 'No summary was generated for this call.'}</p>
              <dl className="brief-stats">
                <div className="brief-stat">
                  <dt>Caller sentiment</dt>
                  <dd><span className={`sent sent-${call.sentiment || 'neutral'}`}>{call.sentiment || 'unknown'}</span></dd>
                </div>
                <div className="brief-stat">
                  <dt>Extraction confidence</dt>
                  <dd className="conf-row">
                    <span className="conf-track"><span className={`conf-fill ${conf < 70 ? 'low' : ''}`} style={{ width: `${conf}%`, display: 'block' }} /></span>
                    <span className="conf-label">{conf}%</span>
                  </dd>
                </div>
                <div className="brief-stat">
                  <dt>Processed with</dt>
                  <dd className="text-sm">{call.asr_provider || '—'} <span className="text-muted">→</span> {call.llm_provider || '—'}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section>
            <div className="section-head">
              <h2 className="section-title">Actions and routing</h2>
              <span className="section-sub">{actions.length} extracted</span>
            </div>
            {routeCounts.length > 0 && (
              <div className="route-strip" style={{ marginBottom: 14 }}>
                <span>Routed to</span>
                {routeCounts.map(([d, n]) => (
                  <span key={d} className="tag tag-accent">{d}{n > 1 ? ` ×${n}` : ''}</span>
                ))}
              </div>
            )}
            {actions.length === 0
              ? <div className="panel"><div className="empty"><h3>No actions found</h3>Nothing in this call needs a follow-up.</div></div>
              : groups.map(g => (
                  <div className="action-group" key={g.key}>
                    {g.key !== 'all' && <div className="action-group-head"><h3>{g.title}</h3><span>{g.items.length}</span></div>}
                    {g.items.map(a => (
                      <ActionCard key={a.id} action={a} hot={!!activeTrigger && a.trigger_phrase === activeTrigger}
                        onHover={setActiveTrigger}
                        onChange={(aid, patch) => setPatches(p => ({ ...p, [aid]: { ...p[aid], ...patch } }))} />
                    ))}
                  </div>
                ))}
          </section>

          {entities.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2 className="panel-title">Key details mentioned</h2></div>
              <dl className="panel-body entities">
                {entities.map(e => (
                  <div key={e.key} style={{ display: 'contents' }}>
                    <dt>{e.label}</dt>
                    <dd className="chips">{e.values.map(v => <span key={v} className="tag tag-outline">{v}</span>)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>

        <div className="sticky-col">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Transcript</h2>
              <span className="panel-sub">{lines.length} lines · highlights show evidence</span>
            </div>
            {!tagged && lines.length > 0 && (
              <p className="transcript-hint">Speech recognition does not label speakers. Click a label to mark who is speaking.</p>
            )}
            <div className="transcript" ref={transcriptRef}>
              {lines.length === 0
                ? <p className="empty">No transcript.</p>
                : lines.map((l, i) => (
                    <div key={l.lineNum} className={`t-line ${isHit(l.text) ? 'has-hit' : ''}`}>
                      <span className="t-num">{String(l.lineNum).padStart(2, '0')}</span>
                      {tagged
                        ? <span className={`t-speaker ${l.speaker === 'PATIENT' ? 'patient' : 'staff'}`}>{cap(l.speaker.toLowerCase())}</span>
                        : <button className={`t-speaker ${l.speaker === 'PATIENT' ? 'patient' : l.speaker === 'STAFF' ? 'staff' : ''}`}
                            onClick={() => cycleSpeaker(i)} title="Click to set speaker: Patient, Staff, none">
                            {l.speaker ? cap(l.speaker.toLowerCase()) : 'Speaker'}
                          </button>}
                      <span className="t-text"><Highlight text={l.text} triggers={triggers} active={activeTrigger} /></span>
                    </div>
                  ))}
            </div>
          </section>
        </div>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}

export default function CallDetail() {
  const { id } = useParams()
  return <Layout back={{ to: '/calls', label: 'All calls' }} title="Call brief" showLive={false}><Body id={id} /></Layout>
}
