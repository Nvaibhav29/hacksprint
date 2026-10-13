// Upload -> ASR -> LLM -> Routing, with the provider that actually ran each step.
const STEPS = [
  { key: 'upload',  label: 'Upload' },
  { key: 'asr',     label: 'ASR' },
  { key: 'llm',     label: 'LLM' },
  { key: 'routing', label: 'Routing' },
]

const STAGE_TO_STEP = { queued: 1, preprocessing: 1, asr: 1, llm: 2, routing: 3, saving: 3, done: 4 }
const STAGE_DETAIL = {
  queued: 'Waiting for a worker…',
  preprocessing: 'Preparing audio…',
  asr: 'Transcribing…',
  llm: 'Extracting actions…',
  routing: 'Routing to departments…',
  saving: 'Saving…',
}

// `fallback` comes from the backend: true when the first provider in the chain did not run.
function prettyProvider(name, fallback) {
  if (!name) return null
  return { text: name, fallback: !!fallback }
}

export default function PipelineStepper({ uploadPct = 0, job = null, failed = false, elapsed = 0 }) {
  let active
  if (!job) active = uploadPct >= 100 ? 1 : 0
  else active = job.status === 'done' ? 4 : (STAGE_TO_STEP[job.stage] ?? 1)

  const providers = job?.providers || {}
  const info = {
    asr: active >= 2 ? prettyProvider(providers.asr, providers.asr_fallback) : null,
    llm: active >= 3 ? prettyProvider(providers.llm, providers.llm_fallback) : null,
  }

  const sub = i => {
    const key = STEPS[i].key
    if (i === active && !failed) {
      if (key === 'upload') return `${uploadPct}%`
      return STAGE_DETAIL[job?.stage] || 'Working…'
    }
    if (i === active && failed) return 'Failed'
    if (i >= active) return ''
    if (key === 'upload') return 'Sent'
    if (key === 'routing') return 'Rules + priority'
    return ''
  }

  return (
    <div className="stepper" role="list" aria-label="Processing pipeline">
      {STEPS.map((s, i) => {
        const state = failed && i === active ? 'failed' : i < active ? 'done' : i === active ? 'active' : 'pending'
        const p = info[s.key]
        return (
          <div key={s.key} className={`step ${state}`} role="listitem">
            <div className="step-marker">
              {state === 'done' ? '✓' : state === 'failed' ? '!' : state === 'active' ? <span className="spinner spinner-sm" /> : i + 1}
            </div>
            <div className="step-body">
              <div className="step-label">{s.label}</div>
              <div className="step-sub">{sub(i)}</div>
              {p && (
                <div className="step-provider">
                  <span className="tag tag-gray">{p.text}</span>
                  {p.fallback && <span className="tag tag-amber">fallback</span>}
                </div>
              )}
            </div>
            {i < STEPS.length - 1 && <div className={`step-line ${i < active ? 'done' : ''}`} />}
          </div>
        )
      })}
      {job && job.status !== 'done' && !failed && (
        <div className="stepper-elapsed">{elapsed}s elapsed</div>
      )}
    </div>
  )
}
