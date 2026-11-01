import { BrowserRouter, Route, Routes } from 'react-router-dom'
import BadgePage from './pages/BadgePage'
import BreakItPage from './pages/BreakItPage'
import JudgesPage from './pages/JudgesPage'
import { Shell } from './components/Shell'
import CreatePage from './pages/CreatePage'
import HomePage from './pages/HomePage'
import ProofPage from './pages/ProofPage'
import PursePage from './pages/PursePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/badge/:id" element={<BadgePage />} />
        <Route
          path="*"
          element={
            <Shell>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/p/:id" element={<PursePage />} />
                <Route path="/new" element={<CreatePage />} />
                <Route path="/proof" element={<ProofPage />} />
                <Route path="/judges" element={<JudgesPage />} />
                <Route path="/break-it" element={<BreakItPage />} />
                <Route path="*" element={<HomePage />} />
              </Routes>
            </Shell>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
