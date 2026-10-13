import { useNavigate, useLocation } from 'react-router-dom'
import { useLiveState } from '../hooks/useLive'

const NAV = [
  {
    label: 'Dashboard', path: '/dashboard',
    icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>
  },
  {
    label: 'Queue Board', path: '/board',
    icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="1.5" width="3.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="6.2" y="1.5" width="3.5" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="10.9" y="1.5" width="2.6" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>
  },
  {
    label: 'All Calls', path: '/calls',
    icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 1.5h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h5M5 7.5h5M5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
  },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { status } = useLiveState()

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>MedRoute</h1>
        <span>Call Intelligence</span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(n => (
          <button
            key={n.path}
            className={`nav-item ${pathname.startsWith(n.path) ? 'active' : ''}`}
            onClick={() => navigate(n.path)}
          >
            {n.icon}
            {n.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="avatar">SA</div>
        <span className="name">Staff Admin</span>
        <div className={`live-dot ${status}`} title={status === 'offline' ? 'Backend unreachable' : status === 'paused' ? 'Auto-refresh paused' : 'Live'} />
      </div>
    </aside>
  )
}
