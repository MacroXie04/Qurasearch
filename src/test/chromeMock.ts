// Minimal in-memory chrome mock for tests. storage.local/session model get/set/
// remove and fire onChanged SYNCHRONOUSLY (a test convenience — real Chrome
// dispatches onChanged asynchronously; tests that depend on ordering should not
// rely on this exact timing). Also stubs the surfaces background.ts touches and
// captures listener callbacks under `_handlers` so tests can invoke them.
export type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>
export type Listener = (changes: Changes, area: string) => void

export function makeChrome(
  seedLocal: Record<string, unknown> = {},
  seedSession: Record<string, unknown> = {},
) {
  const local: Record<string, unknown> = { ...seedLocal }
  const session: Record<string, unknown> = { ...seedSession }
  const storageListeners: Listener[] = []
  const emit = (changes: Changes, area: string) => {
    for (const l of storageListeners) l(changes, area)
  }

  function makeArea(store: Record<string, unknown>, name: string) {
    return {
      async get(keys: string | string[]): Promise<any> {
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

  const handlers = {
    onClicked: [] as Array<(info: any, tab: any) => void>,
    onInstalled: [] as Array<(details: any) => void>,
    onStartup: [] as Array<() => void>,
    onConnect: [] as Array<(port: any) => void>,
  }
  const captureInto = (arr: any[]) => ({ addListener: (cb: any) => arr.push(cb) })

  return {
    _handlers: handlers,
    storage: {
      local: makeArea(local, 'local'),
      session: makeArea(session, 'session'),
      onChanged: { addListener: (cb: Listener) => storageListeners.push(cb) },
    },
    contextMenus: {
      onClicked: captureInto(handlers.onClicked),
      removeAll: (cb?: () => void) => {
        if (typeof cb === 'function') cb()
      },
      create: () => {},
    },
    sidePanel: {
      setPanelBehavior: async () => {},
      open: async () => {},
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
      setBadgeTextColor: async () => {},
    },
    tabs: {
      create: async () => {},
    },
    runtime: {
      getURL: (p: string) => 'chrome-extension://testid' + p,
      connect: () => ({ name: 'sidepanel', onDisconnect: captureInto([]) }),
      onInstalled: captureInto(handlers.onInstalled),
      onStartup: captureInto(handlers.onStartup),
      onConnect: captureInto(handlers.onConnect),
    },
  }
}

export type MockChrome = ReturnType<typeof makeChrome>

export function installChrome(
  seedLocal?: Record<string, unknown>,
  seedSession?: Record<string, unknown>,
): MockChrome {
  const chrome = makeChrome(seedLocal, seedSession)
  ;(globalThis as unknown as { chrome: unknown }).chrome = chrome
  return chrome
}
