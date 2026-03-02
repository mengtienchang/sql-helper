import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'

async function bootstrap() {
  // 如果不在 Electron 環境（window.db 由 preload 注入），則用 web 版服務
  if (!(window as any).db) {
    const { initWebServices } = await import('./services/init')
    await initWebServices()
  }
  createApp(App).mount('#app')
}

bootstrap()
