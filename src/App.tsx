import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import BadgePage from './pages/BadgePage'
import BreakItPage from './pages/BreakItPage'
import JudgesPage from './pages/JudgesPage'
import { Shell } from './components/Shell'
import CreatePage from './pages/CreatePage'
import HomePage from './pages/HomePage'
import ProofPage from './pages/ProofPage'
import PursePage from './pages/PursePage'

function Guarded({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route
          path="/badge/:id"
          element={
            <Guarded>
              <BadgePage />
            </Guarded>
          }
        />
        <Route
          path="*"
          element={
            <Shell>
              <Guarded>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/p/:id" element={<PursePage />} />
                <Route path="/new" element={<CreatePage />} />
                <Route path="/proof" element={<ProofPage />} />
                <Route path="/judges" element={<JudgesPage />} />
                <Route path="/break-it" element={<BreakItPage />} />
                <Route path="*" element={<HomePage />} />
              </Routes>
              </Guarded>
            </Shell>
          }
        />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
