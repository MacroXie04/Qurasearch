// Minimal in-memory chrome.storage mock for tests (local + session + onChanged).
// set/remove fire onChanged synchronously so awaiting a mutation reflects in state.
export type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>

export function makeChrome(
  seedLocal: Record<string, unknown> = {},
  seedSession: Record<string, unknown> = {},
) {
  const local: Record<string, unknown> = { ...seedLocal }
  const session: Record<string, unknown> = { ...seedSession }
  const listeners: Array<(changes: Changes, area: string) => void> = []
  const emit = (changes: Changes, area: string) => {
    for (const l of listeners) l(changes, area)
  }

  function makeArea(store: Record<string, unknown>, name: string) {
    return {
      async get(keys: string | string[]) {
        const ks = Array.isArray(keys) ? keys : [keys]
        const out: Record<string, unknown> = {}
        for (const k of ks) if (k in store) out[k] = store[k]
        return out
      },
      async set(obj: Record<string, unknown>) {
        const changes: Changes = {}
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = { oldValue: store[k], newValue: v }
          store[k] = v
        }
        emit(changes, name)
      },
      async remove(keys: string | string[]) {
        const ks = Array.isArray(keys) ? keys : [keys]
        const changes: Changes = {}
        for (const k of ks)
          if (k in store) {
            changes[k] = { oldValue: store[k], newValue: undefined }
            delete store[k]
          }
        if (Object.keys(changes).length) emit(changes, name)
      },
    }
  }

  return {
    storage: {
      local: makeArea(local, 'local'),
      session: makeArea(session, 'session'),
      onChanged: {
        addListener: (cb: (changes: Changes, area: string) => void) => listeners.push(cb),
      },
    },
    runtime: {
      getURL: (p: string) => 'chrome-extension://testid' + p,
      connect: () => ({ name: 'sidepanel', onDisconnect: { addListener: () => {} } }),
    },
  }
}

export function installChrome(
  seedLocal?: Record<string, unknown>,
  seedSession?: Record<string, unknown>,
) {
  const chrome = makeChrome(seedLocal, seedSession)
  ;(globalThis as unknown as { chrome: unknown }).chrome = chrome
  return chrome
}
