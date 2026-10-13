import { useState, useRef, useEffect } from 'react'
import { uploadCall } from '../services/api'
import PipelineStepper from './PipelineStepper'

export default function UploadModal({ onClose, onDone }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(0)
  const [language, setLanguage] = useState('auto')
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const inputRef = useRef()

  // elapsed-seconds counter while a call is processing
  useEffect(() => {
    if (!loading) return
    const start = Date.now()
    const t = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [loading])

  const handleFile = f => {
    setError('')
    setFailed(false)
    setFile(f)
  }

  const handleDrop = e => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleSubmit = async () => {
    if (!file) return
    setLoading(true)
    setFailed(false)
    setError('')
    setProgress(0)
    setJob(null)
    setElapsed(0)
    try {
      const result = await uploadCall(file, {
        language,
        onUploadProgress: setProgress,
        onStage: setJob,
      })
      onDone(result)
    } catch (e) {
      setError(e.response?.data?.detail || 'Upload failed. Check backend.')
      setFailed(true)
      setLoading(false)
    }
  }

  const showStepper = loading || failed

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Process new call">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 15, fontWeight: 700 }}>
            Process New Call
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close" disabled={loading}>×</button>
        </div>

        <div
          className={`upload-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current.click()}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="var(--c-text-muted)" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {file
            ? <p><strong>{file.name}</strong> ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>
            : <p>Drop audio file here or <strong>click to browse</strong></p>
          }
          <p className="text-sm" style={{ marginTop: 4 }}>
            Supports WAV, MP3, M4A, OGG, FLAC — max 50 MB
          </p>
          <input ref={inputRef} type="file"
            accept=".wav,.mp3,.m4a,.ogg,.flac,.webm"
            style={{ display: 'none' }}
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        </div>

        <div style={{ marginTop: 14 }}>
          <label className="field-label" htmlFor="call-language">Call language</label>
          <select id="call-language" className="field-input" value={language}
            onChange={e => setLanguage(e.target.value)} disabled={loading}>
            <option value="auto">Auto-detect</option>
            <option value="hi">Hindi</option>
            <option value="kn">Kannada</option>
            <option value="en">English</option>
            <option value="ta">Tamil</option>
            <option value="te">Telugu</option>
            <option value="ml">Malayalam</option>
          </select>
        </div>

        {showStepper && (
          <div style={{ marginTop: 18 }}>
            <PipelineStepper uploadPct={progress} job={job} failed={failed} elapsed={elapsed} />
            {!failed && (
              <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 10 }}>
                Longer calls take longer. You can keep using the dashboard in another tab.
              </p>
            )}
          </div>
        )}

        {error && (
          <p style={{ marginTop: 12, fontSize: 12, color: 'var(--c-danger)' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}
            disabled={!file || loading}>
            {loading ? <><div className="spinner spinner-sm spinner-light" /> Processing</> : failed ? 'Try again' : 'Process Call'}
          </button>
        </div>
      </div>
    </div>
  )
}
