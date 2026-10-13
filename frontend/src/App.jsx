import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import AllCalls from './pages/AllCalls'
import CallDetail from './pages/CallDetail'
import Board from './pages/Board'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/board" element={<Board />} />
      <Route path="/calls" element={<AllCalls />} />
      <Route path="/calls/:id" element={<CallDetail />} />
    </Routes>
  )
}
