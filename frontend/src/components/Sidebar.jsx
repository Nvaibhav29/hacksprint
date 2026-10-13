import { useNavigate, useLocation } from 'react-router-dom'
import { useLiveState } from '../hooks/useLive'
import { BrandMark, IconDesk, IconBoard, IconCalls } from './Icons'

const NAV = [
  { label: 'Overview',    path: '/dashboard', icon: <IconDesk /> },
  { label: 'Queue board', path: '/board',     icon: <IconBoard /> },
  { label: 'All calls',   path: '/calls',     icon: <IconCalls /> },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { status } = useLiveState()

  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <div>
          <div className="brand-name">MedRoute</div>
          <div className="brand-sub">Call intelligence</div>
        </div>
      </div>

      <nav className="nav" aria-label="Main">
        <div className="nav-label">Workspace</div>
        {NAV.map(n => (
          <button key={n.path} className={`nav-item ${pathname.startsWith(n.path) ? 'active' : ''}`}
            aria-current={pathname.startsWith(n.path) ? 'page' : undefined}
            onClick={() => navigate(n.path)}>
            {n.icon}{n.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="avatar">SA</div>
        <div className="who">Staff Admin<small>Care coordination</small></div>
        <div className={`live-dot ${status}`}
          title={status === 'offline' ? 'Backend unreachable' : status === 'paused' ? 'Auto-refresh paused' : 'Connected'} />
      </div>
    </aside>
  )
}
