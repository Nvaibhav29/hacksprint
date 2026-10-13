import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout, { useUpload } from '../components/Layout'
import { IconDownload } from '../components/Icons'
import { getCalls } from '../services/api'
import { useLive } from '../hooks/useLive'
import { DEPARTMENTS } from '../departments'
import { fmtId, fmtDate, fmtTime, statusLabel, downloadText } from '../lib/format'

const PER_PAGE = 20
const EMPTY = { q: '', department: '', priority: '', status: '', sentiment: '' }

const statusTag = s =>
  s === 'processing' ? 'tag tag-blue' : s === 'routed' ? 'tag tag-green' : s === 'needs_review' ? 'tag tag-amber' : 'tag tag-gray'

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`

function Body() {
  const navigate = useNavigate()
  const openUpload = useUpload()
  const [calls, setCalls] = useState([])
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState(EMPTY)
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(f => (f.q === searchText.trim() ? f : { ...f, q: searchText.trim() }))
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchText])

  const setFilter = (key, value) => { setFilters(f => ({ ...f, [key]: value })); setPage(1) }
  const clearAll = () => { setFilters(EMPTY); setSearchText(''); setPage(1) }
  const activeCount = Object.values(filters).filter(Boolean).length

  useLive(async () => {
    try {
      const data = await getCalls(page, filters)
      setCalls(data.calls || []); setError('')
    } catch (e) {
      setError('Could not reach the backend. Make sure the server is running.')
      throw e
    } finally {
      setLoaded(true)
    }
  }, { deps: [page, filters] })

  const exportCsv = () => {
    const head = ['Call ID', 'Date', 'Time', 'Patient', 'Patient ID', 'Departments', 'Actions', 'Sentiment', 'Status']
    const rows = calls.map(c => [fmtId(c.id), fmtDate(c.created_at), fmtTime(c.created_at), c.patient_name, c.patient_id,
      (c.departments || []).join('; '), c.action_count, c.sentiment, c.status])
    downloadText('medroute-calls.csv', [head, ...rows].map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv')
  }

  return (
    <>
      {error && <div className="banner" role="alert">{error}</div>}

      <div className="filter-bar">
        <input className="field-input filter-search" type="search" placeholder="Search patient, ID or file name"
          aria-label="Search calls" value={searchText} onChange={e => setSearchText(e.target.value)} />
        <select className="field-input" aria-label="Department" value={filters.department} onChange={e => setFilter('department', e.target.value)}>
          <option value="">All departments</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="field-input" aria-label="Priority" value={filters.priority} onChange={e => setFilter('priority', e.target.value)}>
          <option value="">Any priority</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
        <select className="field-input" aria-label="Status" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">Any status</option><option value="routed">Routed</option><option value="needs_review">Needs review</option><option value="processing">Processing</option>
        </select>
        <select className="field-input" aria-label="Sentiment" value={filters.sentiment} onChange={e => setFilter('sentiment', e.target.value)}>
          <option value="">Any sentiment</option><option value="frustrated">Frustrated</option><option value="neutral">Neutral</option><option value="satisfied">Satisfied</option>
        </select>
        {activeCount > 0 && <button className="btn btn-sm" onClick={clearAll}>Clear ({activeCount})</button>}
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={exportCsv} disabled={!calls.length}>
          <IconDownload /> Export page as CSV
        </button>
      </div>

      <section className="panel">
        {!loaded
          ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
          : calls.length === 0
            ? <div className="empty">
                <h3>{activeCount ? 'No calls match these filters' : 'No calls yet'}</h3>
                {activeCount
                  ? <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={clearAll}>Clear filters</button>
                  : <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={openUpload}>Process a call</button>}
              </div>
            : <div className="table-scroll"><table className="data-table" style={{ minWidth: 680 }}>
                <thead><tr>
                  <th>When</th><th>Patient</th><th>Routed to</th><th>Sentiment</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {calls.map(c => (
                    <tr key={c.id} className="clickable" onClick={() => navigate(`/calls/${c.id}`)}>
                      <td><div className="text-sm">{fmtDate(c.created_at)}</div><div className="cell-sub mono">{fmtTime(c.created_at)}</div></td>
                      <td>
                        <div className="cell-name">{c.patient_name || 'Unidentified'}</div>
                        <div className="cell-sub mono">{c.patient_id || fmtId(c.id)}</div>
                      </td>
                      <td>{c.departments?.length
                        ? <div className="chips">{c.departments.map(d => <span key={d} className="tag tag-accent">{d}</span>)}</div>
                        : <span className="text-muted">—</span>}</td>
                      <td><span className={`sent sent-${c.sentiment || 'neutral'}`}>{c.sentiment || '—'}</span></td>
                      <td><span className={statusTag(c.status)}>{statusLabel(c.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>}
      </section>

      {loaded && (calls.length > 0 || page > 1) && (
        <div className="pagination-row">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span className="pagination-label">Page {page}</span>
          <button className="btn btn-sm" disabled={calls.length < PER_PAGE} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </>
  )
}

export default function AllCalls() {
  return <Layout eyebrow="Archive" title="All calls"><Body /></Layout>
}
