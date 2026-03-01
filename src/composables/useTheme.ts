import { reactive, watch } from 'vue'

export interface ThemeConfig {
  sidebarBg: string
  sidebarText: string
  sidebarActive: string
  mainBg: string
  accentColor: string
}

const presets: Record<string, ThemeConfig> = {
  dark: {
    sidebarBg: '#111827',
    sidebarText: '#9ca3af',
    sidebarActive: '#1f2937',
    mainBg: '#f9fafb',
    accentColor: '#2563eb',
  },
  midnight: {
    sidebarBg: '#0f172a',
    sidebarText: '#94a3b8',
    sidebarActive: '#1e293b',
    mainBg: '#f8fafc',
    accentColor: '#6366f1',
  },
  ocean: {
    sidebarBg: '#0c4a6e',
    sidebarText: '#bae6fd',
    sidebarActive: '#075985',
    mainBg: '#f0f9ff',
    accentColor: '#0284c7',
  },
  forest: {
    sidebarBg: '#14532d',
    sidebarText: '#bbf7d0',
    sidebarActive: '#166534',
    mainBg: '#f0fdf4',
    accentColor: '#16a34a',
  },
  wine: {
    sidebarBg: '#4c0519',
    sidebarText: '#fda4af',
    sidebarActive: '#881337',
    mainBg: '#fff1f2',
    accentColor: '#e11d48',
  },
  light: {
    sidebarBg: '#ffffff',
    sidebarText: '#6b7280',
    sidebarActive: '#f3f4f6',
    mainBg: '#f9fafb',
    accentColor: '#2563eb',
  },
}

const STORAGE_KEY = 'sql-helper-theme'

function loadSaved(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? 'dark'
  } catch {
    return 'dark'
  }
}

const state = reactive({
  current: loadSaved(),
})

function applyTheme(name: string) {
  const theme = presets[name]
  if (!theme) return
  const root = document.documentElement
  root.style.setProperty('--sidebar-bg', theme.sidebarBg)
  root.style.setProperty('--sidebar-text', theme.sidebarText)
  root.style.setProperty('--sidebar-active', theme.sidebarActive)
  root.style.setProperty('--main-bg', theme.mainBg)
  root.style.setProperty('--accent-color', theme.accentColor)
}

watch(() => state.current, (name) => {
  applyTheme(name)
  try { localStorage.setItem(STORAGE_KEY, name) } catch {}
}, { immediate: true })

export function useTheme() {
  return {
    current: state,
    presets,
    presetNames: Object.keys(presets),
    setTheme(name: string) {
      if (presets[name]) state.current = name
    },
  }
}
