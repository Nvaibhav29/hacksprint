import { APPOINTMENT_CAPACITY } from '../departments'

// Appointment capacity: every Scheduling ticket is one appointment.
// The bar grows as the schedule fills toward APPOINTMENT_CAPACITY.
// Solid = confirmed (ticket resolved), light = still being arranged.
export default function AppointmentBar({ actions = [], loading = false }) {
  const appts = actions.filter(a => a.department === 'Scheduling')
  const total = appts.length
  const confirmed = appts.filter(a => a.status === 'resolved').length
  const pending = total - confirmed
  const pct = n => `${Math.min(100, (n / APPOINTMENT_CAPACITY) * 100)}%`
  const level = total >= APPOINTMENT_CAPACITY ? 'full' : total >= APPOINTMENT_CAPACITY * 0.8 ? 'near' : ''
  const left = Math.max(0, APPOINTMENT_CAPACITY - total)

  return (
    <div className={`appt ${level}`}>
      <div className="appt-head">
        <span className="appt-num">{loading ? '—' : total}<small> / {APPOINTMENT_CAPACITY}</small></span>
        <span className="appt-note">
          {loading ? '' : level === 'full' ? 'Schedule full' : `${left} slots left`}
        </span>
      </div>
      <div className="appt-track" role="progressbar" aria-valuemin={0} aria-valuemax={APPOINTMENT_CAPACITY}
        aria-valuenow={total} aria-label="Appointments scheduled">
        <i className="appt-done" style={{ width: pct(confirmed) }} />
        <i className="appt-pend" style={{ width: pct(pending) }} />
      </div>
      <div className="appt-legend">
        <span className="l-done">{confirmed} confirmed</span>
        <span className="l-pend">{pending} being arranged</span>
      </div>
    </div>
  )
}
