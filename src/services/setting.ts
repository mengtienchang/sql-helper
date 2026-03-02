import { rawExecute } from './db'

export const webSettingApi = {
  async get(key: string): Promise<string | null> {
    try {
      const r = rawExecute('SELECT value FROM app_setting WHERE key=?', [key])
      return (r.rows?.[0]?.value as string) ?? null
    } catch {
      return null
    }
  },
  async set(key: string, value: string): Promise<void> {
    rawExecute(
      'INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      [key, value],
    )
  },
}
