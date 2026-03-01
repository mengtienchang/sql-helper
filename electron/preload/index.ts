import { contextBridge, ipcRenderer } from 'electron'

const dbApi = {
  execute: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:execute', sql, params),
  tables: () => ipcRenderer.invoke('db:tables'),
  seed: () => ipcRenderer.invoke('db:seed'),
}

const settingApi = {
  get: (key: string) => ipcRenderer.invoke('setting:get', key),
  set: (key: string, value: string) => ipcRenderer.invoke('setting:set', key, value),
}

const chatApi = {
  send: (sessionId: number, message: string) => ipcRenderer.invoke('chat:send', sessionId, message),
  createSession: () => ipcRenderer.invoke('chat:createSession'),
  getSessions: () => ipcRenderer.invoke('chat:getSessions'),
  getMessages: (sessionId: number) => ipcRenderer.invoke('chat:getMessages', sessionId),
  deleteSession: (sessionId: number) => ipcRenderer.invoke('chat:deleteSession', sessionId),
}

const exportApi = {
  saveTemplate: (filePath: string, name: string, desc: string) => ipcRenderer.invoke('export:saveTemplate', filePath, name, desc),
  getTemplates: () => ipcRenderer.invoke('export:getTemplates'),
  deleteTemplate: (id: number) => ipcRenderer.invoke('export:deleteTemplate', id),
  scanVars: (id: number) => ipcRenderer.invoke('export:scanVars', id),
  generate: (id: number, vars: Record<string, string>) => ipcRenderer.invoke('export:generate', id, vars),
  simple: (data: { columns: string[], rows: Record<string, unknown>[] }) => ipcRenderer.invoke('export:simple', data),
  showOpenDialog: () => ipcRenderer.invoke('file:showOpenDialog'),
}

const menuApi = {
  onStartTour: (callback: () => void) => {
    ipcRenderer.on('menu:startTour', () => callback())
  },
}

contextBridge.exposeInMainWorld('db', dbApi)
contextBridge.exposeInMainWorld('setting', settingApi)
contextBridge.exposeInMainWorld('chat', chatApi)
contextBridge.exposeInMainWorld('export', exportApi)
contextBridge.exposeInMainWorld('menu', menuApi)
