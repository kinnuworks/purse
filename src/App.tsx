import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import CreatePage from './pages/CreatePage'
import HomePage from './pages/HomePage'
import ProofPage from './pages/ProofPage'
import PursePage from './pages/PursePage'

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/p/:id" element={<PursePage />} />
          <Route path="/new" element={<CreatePage />} />
          <Route path="/proof" element={<ProofPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
