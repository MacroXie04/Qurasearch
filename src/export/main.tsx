// Entry for the standalone export page (a full browser tab, not the panel).
// Unlike src/main.tsx it must NOT open the 'sidepanel' runtime port — that
// port is how the background detects the side panel closing.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../theme.css'
import '../app.css'
import './export.css'
import { ExportApp } from './ExportApp'
import { initStore } from '../store'

const root = createRoot(document.getElementById('root')!)

initStore().finally(() => {
  root.render(
    <StrictMode>
      <ExportApp />
    </StrictMode>,
  )
})
