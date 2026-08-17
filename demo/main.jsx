// Minimal demo harness — mounts the library exactly as a host app would.
// Run:  npm run demo   then open http://localhost:8017
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import Canvas from '../ui/src/Canvas'
import CanvasSettings from '../ui/src/CanvasSettings'
import '../ui/canvas.css'

function Demo() {
  const [view, setView] = useState('canvas')
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 20 }}>
        <h1 style={{ font: '600 20px/1.2 system-ui, sans-serif', margin: 0 }}>solance-canvas demo</h1>
        <nav style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setView('canvas')} disabled={view === 'canvas'}>Canvas</button>
          <button onClick={() => setView('settings')} disabled={view === 'settings'}>Settings</button>
        </nav>
      </header>
      {view === 'canvas'
        ? <Canvas onOpenSettings={() => setView('settings')} />
        : <CanvasSettings onClose={() => setView('canvas')} />}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<Demo />)
