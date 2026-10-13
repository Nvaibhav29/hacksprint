import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import ActionCard from '../components/ActionCard'
import { getCall, updateCall } from '../services/api'
import { URGENT_DEPARTMENTS } from '../departments'

function sentimentTag(s) {
  const map = { frustrated: 'tag tag-red', neutral: 'tag tag-gray', satisfied: 'tag tag-green' }
  return map[s] || 'tag tag-gray'
}

function fmtDuration(s) {
  if (!s) return '—'
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtDatetime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function fmtId(id) {
  return '#' + id.slice(0, 6).toUpperCase()
}

// Highlight trigger phrases in transcript line.
// Fix #8: the old code called regex.test() on a /g regex, which keeps state
// (lastIndex) between calls and skipped some matches. String.split with a
// capture group puts every match at an odd index, so no .test() is needed.
function HighlightText({ text, triggers = [] }) {
  const clean = [...new Set(triggers.map(t => (t || '').trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)          // longest first
  if (!clean.length) return <>{text}</>
  const pattern = clean.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const parts = text.split(new RegExp(`(${pattern})`, 'i'))
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <u key={i}>{p}</u> : <span key={i}>{p}</span>
      )}
    </>
  )
}


const SPEAKER_CYCLE = [null, 'PATIENT', 'STAFF']

// ASR gives no speaker labels, so the transcript is one paragraph. Split it into
// readable turns (sentence boundaries, tiny fragments merged into the previous line).
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
  // Transcripts that already carry [PATIENT]/[STAFF] markers keep them.
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

const isUnresolvedClinicalHigh = a =>
  URGENT_DEPARTMENTS.includes(a.department) && a.priority === 'high' && a.status !== 'resolved'

export default function CallDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusOverrides, setStatusOverrides] = useState({})   // action id -> status changed on this page
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [headerError, setHeaderError] = useState('')
  const [headerSaving, setHeaderSaving] = useState(false)
  const [verifiedLocal, setVerifiedLocal] = useState(false)
  const [speakerTags, setSpeakerTags] = useState({})           // line index -> PATIENT | STAFF (manual)

  useEffect(() => {
    getCall(id)
      .then(setData)
      .catch(() => setError('Call not found or backend unavailable.'))
      .finally(() => setLoading(false))
  }, [id])

  // manual speaker tags are remembered per call in this browser
  useEffect(() => {
    try { setSpeakerTags(JSON.parse(localStorage.getItem(`speakers:${id}`) || '{}')) } catch { setSpeakerTags({}) }
  }, [id])

  const call = data?.call
  const actions = (data?.actions || []).map(a => (statusOverrides[a.id] ? { ...a, status: statusOverrides[a.id] } : a))
  const verified = !!call?.patient_verified || verifiedLocal
  const urgentActions = actions.filter(isUnresolvedClinicalHigh)
  const hasClinical = actions.some(a => URGENT_DEPARTMENTS.includes(a.department))
  const urgent = urgentActions.length > 0 || (!!call?.urgent_clinical_flag && !hasClinical)
  const triggers = actions.map(a => a.trigger_phrase).filter(Boolean)
  const { lines: parsedLines, tagged } = useMemo(() => parseTranscript(call?.raw_transcript), [call?.raw_transcript])
  const transcriptLines = parsedLines.map((l, i) => ({ ...l, speaker: tagged ? l.speaker : (speakerTags[i] || null) }))

  const cycleSpeaker = i => {
    const cur = speakerTags[i] || null
    const next = SPEAKER_CYCLE[(SPEAKER_CYCLE.indexOf(cur) + 1) % SPEAKER_CYCLE.length]
    const updated = { ...speakerTags }
    if (next) updated[i] = next; else delete updated[i]
    setSpeakerTags(updated)
    try { localStorage.setItem(`speakers:${id}`, JSON.stringify(updated)) } catch { /* storage full/blocked: tags just won't persist */ }
  }

  const saveHeader = async body => {
    setHeaderSaving(true)
    setHeaderError('')
    try {
      const res = await updateCall(id, body)
      setData(d => ({ ...d, call: { ...d.call, ...res.updated } }))
      setVerifiedLocal(true)
      setEditing(false)
    } catch (err) {
      setHeaderError(err.response?.data?.detail || 'Could not save. Please try again.')
    } finally {
      setHeaderSaving(false)
    }
  }


  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-breadcrumb">
            <span
              style={{ cursor: 'pointer', color: 'var(--c-primary)' }}
              onClick={() => navigate('/dashboard')}
            >Dashboard</span>
            <span> / </span>
            <strong>{call ? fmtId(call.id) : '…'}</strong>
          </div>
          {call && (
            <div className="topbar-meta" style={{ display: 'flex', gap: 12, alignItems: 'center',
              fontSize: 12, color: 'var(--c-text-muted)' }}>
              <span>Duration {fmtDuration(call.duration_seconds)}</span>
              <span>ASR: {call.asr_provider}</span>
              <span>LLM: {call.llm_provider}</span>
            </div>
          )}
        </div>

        <div className="page-content">
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <div className="spinner" />
            </div>
          )}
          {error && <div className="review-banner">{error}</div>}

          {call && (
            <>
              {urgent && (
                <div className="urgent-banner" role="alert">
                  <strong>Urgent clinical attention</strong>
                  <span>
                    {urgentActions.length
                      ? urgentActions.map(a => a.action_text).join(' · ')
                      : 'The AI flagged this call as clinically urgent.'}
                  </span>
                </div>
              )}

              {/* Patient header */}
              <div className="card card-body patient-header" style={{ marginBottom: 16 }}>
                <div className="patient-avatar">{(call.patient_name || '?').trim().charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editing ? (
                    <div className="name-edit">
                      <input className="field-input" autoFocus value={nameDraft} maxLength={120}
                        placeholder="Patient name"
                        aria-label="Patient name"
                        onChange={e => setNameDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveHeader({ patient_name: nameDraft, patient_verified: true })
                          if (e.key === 'Escape') setEditing(false)
                        }} />
                      <button className="btn btn-primary btn-sm" disabled={headerSaving}
                        onClick={() => saveHeader({ patient_name: nameDraft, patient_verified: true })}>
                        {headerSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn btn-outline btn-sm" disabled={headerSaving}
                        onClick={() => { setEditing(false); setHeaderError('') }}>Cancel</button>
                    </div>
                  ) : (
                    <div className="patient-name-row">
                      <span className="patient-name">{call.patient_name || 'Name not detected'}</span>
                      <button className="link-btn"
                        onClick={() => { setNameDraft(call.patient_name || ''); setEditing(true); setHeaderError('') }}>
                        Edit
                      </button>
                      {verified
                        ? <span className="tag tag-green">Verified</span>
                        : <span className="tag tag-amber" title="The name comes from speech recognition and can be wrong">
                            {call.patient_name ? 'Please verify' : 'Add name'}
                          </span>}
                      {!verified && call.patient_name && (
                        <button className="link-btn" disabled={headerSaving}
                          onClick={() => saveHeader({ patient_verified: true })}>
                          Confirm name
                        </button>
                      )}
                    </div>
                  )}
                  <div className="patient-meta">
                    <span>Patient ID: <span className="mono">{call.patient_id || '—'}</span></span>
                  </div>
                  {headerError && <p style={{ marginTop: 6, fontSize: 12, color: 'var(--c-danger)' }}>{headerError}</p>}
                </div>
              </div>

              {/* Call header card */}
              <div className="card card-body" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
                    {fmtId(call.id)}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>
                    {fmtDatetime(call.created_at)}
                  </span>
                  {call.language_detected && (
                    <span className="tag tag-outline">{call.language_detected}</span>
                  )}
                  <span className={sentimentTag(call.sentiment)}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: 11 }}>
                    {call.sentiment || 'unknown'}
                  </span>
                  {call.needs_review && (
                    <span className="tag tag-amber">Needs Review</span>
                  )}
                </div>

                {/* Confidence + speaker bars */}
                <div className="grid-2" style={{ marginTop: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Extraction Confidence
                    </div>
                    <div className="conf-row">
                      <div className="conf-track">
                        <div className="conf-fill"
                          style={{ width: `${Math.round((call.confidence_score || 0.8) * 100)}%` }} />
                      </div>
                      <span className="conf-label">
                        {Math.round((call.confidence_score || 0.8) * 100)}%
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {actions.length} Action{actions.length !== 1 ? 's' : ''} Extracted
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['high', 'medium', 'low'].map(p => {
                        const count = actions.filter(a => a.priority === p).length
                        return count ? (
                          <span key={p} className={`tag tag-${p === 'high' ? 'red' : p === 'medium' ? 'amber' : 'gray'}`}>
                            {count} {p}
                          </span>
                        ) : null
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {call.needs_review && (
                <div className="review-banner">
                  One or more actions have low confidence. Review and verify before acting.
                </div>
              )}

              {/* Two-col */}
              <div className="two-col">
                {/* Left: Summary + Actions */}
                <div>
                  {/* AI Summary */}
                  <div className="section-header">
                    <span className="section-title">AI Summary</span>
                  </div>
                  <div className="card card-body" style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 13, color: 'var(--c-text-primary)', lineHeight: 1.7 }}>
                      {call.ai_summary || 'No summary generated.'}
                    </p>
                  </div>

                  {/* Extracted Actions */}
                  <div className="section-header">
                    <span className="section-title">Extracted Actions</span>
                    <span className="section-sub">{actions.length} items</span>
                  </div>
                  {actions.length === 0
                    ? <div className="card card-body">
                        <p style={{ color: 'var(--c-text-muted)', fontSize: 13 }}>
                          No actions extracted.
                        </p>
                      </div>
                    : actions.map(a => (
                        <ActionCard key={a.id} action={a}
                          onUpdate={(aid, st) => setStatusOverrides(o => ({ ...o, [aid]: st }))} />
                      ))
                  }
                </div>

                {/* Right: Transcript */}
                <div>
                  <div className="section-header">
                    <span className="section-title">Full Transcript</span>
                    {call.language_detected && (
                      <span className="tag tag-outline" style={{ fontSize: 10 }}>
                        {call.language_detected}
                      </span>
                    )}
                  </div>
                  <div className="card">
                    <div className="transcript-block">
                      {!tagged && transcriptLines.length > 0 && (
                        <p className="transcript-hint">
                          Speech recognition doesn't label speakers. Click a line's label to mark who is speaking.
                        </p>
                      )}
                      {transcriptLines.length === 0
                        ? <p style={{ color: 'var(--c-text-muted)', fontSize: 13 }}>No transcript.</p>
                        : transcriptLines.map((l, i) => (
                            <div key={l.lineNum} className={`transcript-line ${l.speaker ? l.speaker.toLowerCase() : ''}`}>
                              <span className="t-line-num">{String(l.lineNum).padStart(2, '0')}</span>
                              {tagged
                                ? <span className={`t-speaker ${l.speaker === 'PATIENT' ? 'patient' : 'staff'}`}>[{l.speaker}]</span>
                                : <button className={`t-speaker t-speaker-btn ${l.speaker === 'PATIENT' ? 'patient' : 'staff'}`}
                                    onClick={() => cycleSpeaker(i)}
                                    title="Click to set speaker: Patient / Staff / none">
                                    {l.speaker ? `[${l.speaker}]` : '[ — ]'}
                                  </button>}
                              <span className="t-text">
                                <HighlightText text={l.text} triggers={triggers} />
                              </span>
                            </div>
                          ))
                      }
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
