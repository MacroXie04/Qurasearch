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
    onMessage: [] as Array<(msg: any, sender: any, sendResponse: (v: any) => void) => unknown>,
    onUpdated: [] as Array<(tabId: number, changeInfo: any, tab: any) => void>,
    onRemoved: [] as Array<(tabId: number) => void>,
  }
  const captureInto = (arr: any[]) => ({ addListener: (cb: any) => arr.push(cb) })

  // Recorded calls + programmable behavior for the newer surfaces.
  const calls = {
    executeScript: [] as any[],
    tabsCreate: [] as any[],
  }
  let executeScriptImpl: (injection: any) => Promise<any> = async () => [{ result: null }]
  let nextTabId = 100

  return {
    _handlers: handlers,
    _calls: calls,
    /** Override what chrome.scripting.executeScript resolves to (or throws). */
    _setExecuteScript(fn: (injection: any) => Promise<any>) {
      executeScriptImpl = fn
    },
    /** Deliver a message with an explicit sender (e.g. `{tab: {id: 5}}`). */
    _sendMessage: (msg: any, sender: any = {}) => mockSendMessage(msg, sender),
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
    scripting: {
      executeScript: async (injection: any) => {
        calls.executeScript.push(injection)
        return executeScriptImpl(injection)
      },
    },
    tabs: {
      create: async (props: any) => {
        calls.tabsCreate.push(props)
        return { id: nextTabId++, ...props }
      },
      onUpdated: captureInto(handlers.onUpdated),
      onRemoved: captureInto(handlers.onRemoved),
    },
    runtime: {
      getURL: (p: string) => 'chrome-extension://testid' + p,
      connect: () => ({ name: 'sidepanel', onDisconnect: captureInto([]) }),
      onInstalled: captureInto(handlers.onInstalled),
      onStartup: captureInto(handlers.onStartup),
      onConnect: captureInto(handlers.onConnect),
      onMessage: captureInto(handlers.onMessage),
      sendMessage: (msg: any) => mockSendMessage(msg, {}),
    },
  }

  // Mirrors MV3 promise-style messaging: handlers run in order; a handler
  // returning true keeps sendResponse usable past its synchronous return.
  function mockSendMessage(msg: any, sender: any): Promise<any> {
    return new Promise((resolve) => {
      let responded = false
      const sendResponse = (v: any) => {
        if (!responded) {
          responded = true
          resolve(v)
        }
      }
      let keepAlive = false
      for (const h of handlers.onMessage) {
        if (h(msg, sender, sendResponse) === true) keepAlive = true
      }
      if (!keepAlive && !responded) resolve(undefined)
    })
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
