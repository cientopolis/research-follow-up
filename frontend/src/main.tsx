import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PomodoroTimer } from './components/PomodoroTimer.tsx'

const queryParams = new URLSearchParams(window.location.search);
const view = queryParams.get('view');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {view === 'pomodoro' ? (
      <div style={{ width: '100vw', height: '100vh', background: 'var(--bg-surface)', padding: 0, margin: 0, boxSizing: 'border-box' }}>
        <PomodoroTimer showCloseButton={false} />
      </div>
    ) : (
      <App />
    )}
  </StrictMode>,
)

