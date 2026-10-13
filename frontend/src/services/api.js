import axios from 'axios'

// In dev: Vite proxy forwards /api → localhost:8000
// In production (Vercel): set VITE_API_URL=https://your-app.railway.app in Vercel dashboard
const BASE = (import.meta.env.VITE_API_URL || '') + '/api'

const api = axios.create({ baseURL: BASE })

// ── Calls ──────────────────────────────────────────────────────────────────
export const getCalls = (page = 1, filters = {}) => {
  const params = { page, per_page: 20 }
  Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
  return api.get('/calls', { params }).then(r => r.data)
}

export const updateCall = (id, body) =>
  api.patch(`/calls/${id}`, body).then(r => r.data)

// Routed tickets for the department queue board
export const getActions = (params = {}) =>
  api.get('/actions', { params }).then(r => r.data.actions || [])

export const getCall = (id) =>
  api.get(`/calls/${id}`).then(r => r.data)

// ── Stats ──────────────────────────────────────────────────────────────────
export const getStats = () =>
  api.get('/stats').then(r => r.data)

// ── Upload ─────────────────────────────────────────────────────────────────
// The backend now processes uploads in the background (Fix #3):
//   POST /calls/upload -> { job_id }, then poll GET /calls/jobs/{job_id}.
const sleep = ms => new Promise(r => setTimeout(r, ms))

export const getJob = (jobId) =>
  api.get(`/calls/jobs/${jobId}`).then(r => r.data)

export const uploadCall = async (file, { language = 'auto', onUploadProgress, onStage } = {}) => {
  const form = new FormData()
  form.append('file', file)
  form.append('language', language)

  const { job_id } = await api.post('/calls/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => {
      if (onUploadProgress && e.total) onUploadProgress(Math.round((e.loaded * 100) / e.total))
    },
  }).then(r => r.data)

  const deadline = Date.now() + 10 * 60 * 1000   // give up after 10 min
  while (Date.now() < deadline) {
    await sleep(1500)
    const job = await getJob(job_id)
    if (onStage) onStage(job)
    if (job.status === 'done') return job.result
    if (job.status === 'error') {
      const err = new Error(job.error || 'Processing failed')
      err.response = { data: { detail: job.error || 'Processing failed' } }
      throw err
    }
  }
  throw new Error('Processing timed out')
}

// ── Actions ────────────────────────────────────────────────────────────────
// patch: any of { status, assigned_to, department }
export const updateAction = (id, patch) =>
  api.patch(`/actions/${id}`, patch).then(r => r.data)
