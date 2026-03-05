import { initWebDB, webDbApi } from './db'
import { webSettingApi } from './setting'
import { webChatApi } from './chat'
import { webExportApi } from './export'
import { webImportApi } from './import'

export async function initWebServices(): Promise<void> {
  await initWebDB()

  ;(window as any).db = webDbApi
  ;(window as any).setting = webSettingApi
  ;(window as any).chat = webChatApi
  ;(window as any).export = webExportApi
  ;(window as any).imp = webImportApi

  console.log('[web] all services initialized')
}
