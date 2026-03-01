<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { X, Send, Plus, Trash2, MessageSquare, Bot, User, Loader2 } from 'lucide-vue-next'
import ResultsTable from './ResultsTable.vue'

const emit = defineEmits<{ close: [] }>()

interface Session { id: number; title: string; created_at: string }
interface Message {
  id: number; role: string; content: string; sql_text: string | null; created_at: string
  queryResult?: any
}

const sessions = ref<Session[]>([])
const activeSessionId = ref<number | null>(null)
const messages = ref<Message[]>([])
const input = ref('')
const sending = ref(false)
const showSessions = ref(false)
const messagesEl = ref<HTMLElement | null>(null)

onMounted(async () => {
  await loadSessions()
  if (sessions.value.length > 0) {
    selectSession(sessions.value[0].id)
  }
})

async function loadSessions() {
  sessions.value = await window.chat.getSessions()
}

async function selectSession(id: number) {
  activeSessionId.value = id
  showSessions.value = false
  const msgs = await window.chat.getMessages(id)
  messages.value = msgs
  await nextTick()
  scrollToBottom()
}

async function createSession() {
  const id = await window.chat.createSession()
  if (id) {
    await loadSessions()
    selectSession(id)
  }
}

async function deleteSession(id: number) {
  await window.chat.deleteSession(id)
  await loadSessions()
  if (activeSessionId.value === id) {
    if (sessions.value.length > 0) {
      selectSession(sessions.value[0].id)
    } else {
      activeSessionId.value = null
      messages.value = []
    }
  }
}

async function sendMessage() {
  if (!input.value.trim() || sending.value) return
  if (!activeSessionId.value) {
    await createSession()
    if (!activeSessionId.value) return
  }

  const userMsg = input.value.trim()
  input.value = ''

  // 立即顯示 user message
  messages.value.push({
    id: Date.now(), role: 'user', content: userMsg,
    sql_text: null, created_at: new Date().toISOString(),
  })
  await nextTick()
  scrollToBottom()

  sending.value = true
  const result = await window.chat.send(activeSessionId.value, userMsg)
  sending.value = false

  if (result.success) {
    messages.value.push({
      id: Date.now() + 1, role: 'assistant', content: result.content ?? '',
      sql_text: result.sql ?? null, created_at: new Date().toISOString(),
      queryResult: result.queryResult,
    })
  } else {
    messages.value.push({
      id: Date.now() + 1, role: 'assistant',
      content: `錯誤：${result.message}`,
      sql_text: null, created_at: new Date().toISOString(),
    })
  }

  // 刷新 session title
  await loadSessions()
  await nextTick()
  scrollToBottom()
}

function scrollToBottom() {
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function formatContent(content: string): string {
  // 簡單 markdown: 把 ```sql...``` 區塊轉成 <pre>
  return content
    .replace(/```sql\s*([\s\S]*?)```/g, '<pre class="sql-block">$1</pre>')
    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

const currentTitle = ref('')
watch(activeSessionId, () => {
  const s = sessions.value.find(s => s.id === activeSessionId.value)
  currentTitle.value = s?.title ?? '新對話'
})
</script>

<template>
  <div class="chat-panel">
    <div class="chat-header">
      <div class="header-left">
        <button class="icon-btn" @click="showSessions = !showSessions" title="對話列表">
          <MessageSquare :size="16" />
        </button>
        <span class="header-title">{{ currentTitle }}</span>
      </div>
      <div class="header-right">
        <button class="icon-btn" @click="createSession" title="新對話"><Plus :size="16" /></button>
        <button class="icon-btn" @click="emit('close')" title="關閉"><X :size="16" /></button>
      </div>
    </div>

    <!-- Session list dropdown -->
    <div v-if="showSessions" class="sessions-dropdown">
      <div
        v-for="s in sessions"
        :key="s.id"
        :class="['session-item', { active: s.id === activeSessionId }]"
        @click="selectSession(s.id)"
      >
        <span class="session-title">{{ s.title }}</span>
        <button class="session-delete" @click.stop="deleteSession(s.id)"><Trash2 :size="12" /></button>
      </div>
      <div v-if="sessions.length === 0" class="session-empty">尚無對話</div>
    </div>

    <!-- Messages -->
    <div ref="messagesEl" class="messages">
      <div v-if="messages.length === 0" class="welcome">
        <Bot :size="32" />
        <p>你好！我是財報分析助手</p>
        <p class="welcome-sub">問我任何財報相關問題，我會幫你生成 SQL 查詢</p>
      </div>

      <div v-for="msg in messages" :key="msg.id" :class="['message', msg.role]">
        <div class="msg-avatar">
          <User v-if="msg.role === 'user'" :size="14" />
          <Bot v-else :size="14" />
        </div>
        <div class="msg-body">
          <div class="msg-content" v-html="formatContent(msg.content)"></div>
          <div v-if="(msg as any).queryResult?.success && (msg as any).queryResult?.rows?.length" class="msg-result">
            <ResultsTable :result="(msg as any).queryResult" />
          </div>
        </div>
      </div>

      <div v-if="sending" class="message assistant">
        <div class="msg-avatar"><Bot :size="14" /></div>
        <div class="msg-body">
          <div class="msg-typing"><Loader2 :size="14" class="spin" /> 思考中...</div>
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="chat-input">
      <textarea
        v-model="input"
        @keydown="handleKeydown"
        placeholder="問問題...（Enter 發送，Shift+Enter 換行）"
        rows="2"
        :disabled="sending"
      />
      <button class="send-btn" @click="sendMessage" :disabled="sending || !input.trim()">
        <Send :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  width: 420px; height: 100vh;
  display: flex; flex-direction: column;
  background: #fff; border-left: 1px solid #e5e7eb;
  box-shadow: -4px 0 20px rgba(0,0,0,0.08);
  position: relative;
}

.chat-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid #e5e7eb;
  background: #f9fafb; flex-shrink: 0;
}
.header-left { display: flex; align-items: center; gap: 8px; }
.header-right { display: flex; align-items: center; gap: 4px; }
.header-title { font-size: 14px; font-weight: 600; color: #111827; }
.icon-btn {
  border: none; background: none; color: #6b7280; cursor: pointer;
  padding: 6px; border-radius: 6px;
}
.icon-btn:hover { background: #e5e7eb; color: #374151; }

.sessions-dropdown {
  position: absolute; top: 48px; left: 0; right: 0; z-index: 10;
  background: #fff; border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  max-height: 300px; overflow-y: auto;
}
.session-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; cursor: pointer; font-size: 13px; color: #374151;
}
.session-item:hover { background: #f3f4f6; }
.session-item.active { background: #eff6ff; color: #2563eb; }
.session-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-delete {
  border: none; background: none; color: #9ca3af; cursor: pointer; padding: 2px;
  border-radius: 4px; flex-shrink: 0;
}
.session-delete:hover { color: #dc2626; background: #fef2f2; }
.session-empty { padding: 20px; text-align: center; color: #9ca3af; font-size: 13px; }

.messages {
  flex: 1; overflow-y: auto; padding: 16px 14px;
  display: flex; flex-direction: column; gap: 16px;
}

.welcome {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; flex: 1; color: #9ca3af; gap: 8px;
  text-align: center;
}
.welcome p { font-size: 15px; font-weight: 500; margin: 0; color: #6b7280; }
.welcome-sub { font-size: 13px !important; font-weight: 400 !important; color: #9ca3af !important; }

.message { display: flex; gap: 10px; }
.msg-avatar {
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.message.user .msg-avatar { background: #dbeafe; color: #2563eb; }
.message.assistant .msg-avatar { background: #d1fae5; color: #059669; }

.msg-body { flex: 1; min-width: 0; }
.msg-content {
  font-size: 13px; line-height: 1.6; color: #374151;
  word-break: break-word;
}
.msg-content :deep(pre) {
  background: #1e293b; color: #e2e8f0; padding: 10px 12px;
  border-radius: 6px; font-size: 12px; overflow-x: auto;
  margin: 8px 0; font-family: 'SF Mono', 'Fira Code', monospace;
}
.msg-content :deep(pre.sql-block) { background: #0f172a; }
.msg-content :deep(code) {
  background: #f1f5f9; padding: 1px 5px; border-radius: 3px;
  font-size: 12px; font-family: 'SF Mono', 'Fira Code', monospace;
}

.msg-result {
  margin-top: 8px; max-height: 200px; overflow: auto;
  border: 1px solid #e5e7eb; border-radius: 6px;
}

.msg-typing {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: #9ca3af;
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.chat-input {
  display: flex; align-items: flex-end; gap: 8px;
  padding: 12px 14px; border-top: 1px solid #e5e7eb;
  background: #f9fafb; flex-shrink: 0;
}
.chat-input textarea {
  flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px;
  font-size: 13px; color: #111827; resize: none;
  font-family: inherit; line-height: 1.5;
  background: #fff;
}
.chat-input textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }
.chat-input textarea:disabled { background: #f3f4f6; }

.send-btn {
  padding: 8px 12px; border: none; border-radius: 8px;
  background: #2563eb; color: #fff; cursor: pointer;
  display: flex; align-items: center;
}
.send-btn:hover { background: #1d4ed8; }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
