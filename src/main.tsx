import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import './app.css'
import { App } from './App'
import { initStore } from './store'

// Open a runtime port so the background can detect when this panel closes
// (port disconnect → reset the "current group"). Keep a reference alive.
const port = chrome.runtime.connect({ name: 'sidepanel' })
// Touch the port so bundlers don't tree-shake it away.
void port.name

const root = createRoot(document.getElementById('root')!)

// Hydrate the store from chrome.storage before the first paint, then render.
initStore().finally(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
