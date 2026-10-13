import { createContext, useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import LiveStatus from './LiveStatus'
import UploadModal from './UploadModal'
import { IconBack } from './Icons'

const UploadCtx = createContext(() => {})
export const useUpload = () => useContext(UploadCtx)

// Shell for every page: sidebar, title bar, live badge, and the upload dialog.
export default function Layout({ eyebrow, title, back, showLive = true, children }) {
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)

  return (
    <UploadCtx.Provider value={() => setUploading(true)}>
      <div className="app-shell">
        <Sidebar />
        <div className="main">
          <header className="topbar">
            <div className="topbar-text">
              {back
                ? <button className="back-link" onClick={() => navigate(back.to)}><IconBack /> {back.label}</button>
                : eyebrow && <div className="eyebrow">{eyebrow}</div>}
              <h1 className="topbar-title">{title}</h1>
            </div>
            {showLive && <LiveStatus />}
            <button className="btn btn-primary" onClick={() => setUploading(true)}>Process a call</button>
          </header>
          <main className="page">{children}</main>
        </div>

        {uploading && (
          <UploadModal onClose={() => setUploading(false)}
            onDone={r => { setUploading(false); navigate(`/calls/${r.call_id}`) }} />
        )}
      </div>
    </UploadCtx.Provider>
  )
}
