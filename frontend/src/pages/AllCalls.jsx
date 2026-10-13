import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import UploadModal from '../components/UploadModal'
import LiveStatus from '../components/LiveStatus'
import { getCalls } from '../services/api'
import { useLive } from '../hooks/useLive'
import { DEPARTMENTS } from '../departments'

const PER_PAGE = 20
const EMPTY = { q: '', department: '', priority: '', status: '', sentiment: '' }

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

const fmtDate = iso => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtTime = iso => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
const fmtId = id => '#' + id.slice(0, 6).toUpperCase()

export default function AllCalls() {
  const navigate = useNavigate()
  const [calls, setCalls] = useState([])
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [showUpload, setShowUpload] = useState(false)

  const [filters, setFilters] = useState(EMPTY)
  const [searchText, setSearchText] = useState('')       // what's typed; debounced into filters.q

  // debounce the search box so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(f => (f.q === searchText.trim() ? f : { ...f, q: searchText.trim() }))
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchText])

  const setFilter = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }))
    setPage(1)
  }
  const clearAll = () => { setFilters(EMPTY); setSearchText(''); setPage(1) }
  const activeCount = Object.values(filters).filter(Boolean).length

  // Live: re-fetches every 15s, and immediately when the page or any filter changes.
  useLive(async () => {
    try {
      const data = await getCalls(page, filters)
      setCalls(data.calls || [])
      setError('')
    } catch (e) {
      setError('Could not reach backend. Make sure the server is running.')
      throw e
    } finally {
      setLoaded(true)
    }
  }, { deps: [page, filters] })

  const handleDone = result => {
    setShowUpload(false)
    navigate(`/calls/${result.call_id}`)
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="main-area">
        <div className="topbar">
          <div className="topbar-breadcrumb"><strong>All Calls</strong></div>
          <LiveStatus />
          <button className="btn btn-primary btn-sm" onClick={() => setShowUpload(true)}>
            Process New Call
          </button>
        </div>

        <div className="page-content">
          {error && <div className="review-banner" style={{ marginBottom: 20 }}>{error}</div>}

          {/* Search + filters */}
          <div className="filter-bar">
            <input
              className="field-input filter-search"
              type="search"
              placeholder="Search name, patient ID, file or summary…"
              aria-label="Search calls"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <select className="field-input" aria-label="Department" value={filters.department}
              onChange={e => setFilter('department', e.target.value)}>
              <option value="">All departments</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="field-input" aria-label="Priority" value={filters.priority}
              onChange={e => setFilter('priority', e.target.value)}>
              <option value="">Any priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select className="field-input" aria-label="Status" value={filters.status}
              onChange={e => setFilter('status', e.target.value)}>
              <option value="">Any status</option>
              <option value="routed">Routed</option>
              <option value="needs_review">Needs review</option>
              <option value="processing">Processing</option>
            </select>
            <select className="field-input" aria-label="Sentiment" value={filters.sentiment}
              onChange={e => setFilter('sentiment', e.target.value)}>
              <option value="">Any sentiment</option>
              <option value="frustrated">Frustrated</option>
              <option value="neutral">Neutral</option>
              <option value="satisfied">Satisfied</option>
            </select>
            {activeCount > 0 && (
              <button className="btn btn-outline btn-sm" onClick={clearAll}>Clear ({activeCount})</button>
            )}
          </div>

          <div className="section-header">
            <span className="section-title">Processed Calls</span>
            <span className="section-sub">{calls.length} on this page{activeCount ? ' · filtered' : ''}</span>
          </div>

          <div className="card">
            {!loaded
              ? <div style={{ padding: 24, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
              : calls.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-muted)', fontSize: 13 }}>
                    {activeCount ? 'No calls match these filters.' : 'No calls processed yet. Upload one to get started.'}
                    {activeCount > 0 && <div style={{ marginTop: 10 }}>
                      <button className="btn btn-outline btn-sm" onClick={clearAll}>Clear filters</button>
                    </div>}
                  </div>
                : <div className="table-scroll"><table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Call ID</th>
                        <th>Name</th>
                        <th>Patient ID</th>
                        <th>Departments</th>
                        <th>Sentiment</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calls.map(c => (
                        <tr key={c.id} className="clickable" onClick={() => navigate(`/calls/${c.id}`)}>
                          <td className="text-sm">{fmtDate(c.created_at)}</td>
                          <td className="mono text-sm">{fmtTime(c.created_at)}</td>
                          <td className="mono text-sm">{fmtId(c.id)}</td>
                          <td>{c.patient_name || '—'}</td>
                          <td className="mono text-sm">{c.patient_id || '—'}</td>
                          <td className="text-sm">{c.departments?.length ? c.departments.join(', ') : '—'}</td>
                          <td>
                            <span className={sentimentClass(c.sentiment)}>
                              {c.sentiment ? c.sentiment.charAt(0).toUpperCase() + c.sentiment.slice(1) : '—'}
                            </span>
                          </td>
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

          {loaded && (calls.length > 0 || page > 1) && (
            <div className="pagination-row">
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span className="pagination-label">Page {page}</span>
              <button className="btn btn-sm" disabled={calls.length < PER_PAGE} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </div>
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={handleDone} />}
    </div>
  )
}
