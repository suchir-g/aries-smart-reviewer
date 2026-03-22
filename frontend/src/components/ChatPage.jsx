import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { apiUrl } from '../utils/api'

const SUGGESTED = [
  'How is the economy being covered right now?',
  'Summarise my recently analysed articles',
  'Run a sentiment pulse on climate change',
  'Which topics have had the most negative coverage?',
  'Search for AI news and tell me the mood',
]

const TOOL_LABELS = {
  search_news: (input) => `Searching news for "${input.query}"`,
  run_pulse:   (input) => `Running sentiment pulse on "${input.topic}"`,
}

function ToolNote({ tool, input, done }) {
  return (
    <div className={`chat-tool-note${done ? ' chat-tool-done' : ''}`}>
      <span className="chat-tool-icon">{done ? '✓' : '○'}</span>
      {TOOL_LABELS[tool]?.(input) ?? tool}
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`chat-message chat-message-${isUser ? 'user' : 'ai'}`}>
      {!isUser && (
        <span className="chat-role-label">Assistant</span>
      )}
      {msg.toolUses?.map((t, i) => (
        <ToolNote key={i} tool={t.tool} input={t.input} done={t.done} />
      ))}
      {msg.content && (
        <div className="chat-bubble">
          {isUser ? msg.content : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content}
            </ReactMarkdown>
          )}
          {msg.streaming && <span className="chat-cursor" />}
        </div>
      )}
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef()
  const textareaRef = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text) {
    const content = text ?? input.trim()
    if (!content || streaming) return
    setInput('')

    const userMsg = { role: 'user', content }
    const aiMsg   = { role: 'assistant', content: '', toolUses: [], streaming: true }

    setMessages(prev => [...prev, userMsg, aiMsg])
    setStreaming(true)

    // Build message history for the API (exclude streaming placeholder)
    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Server error' }))
        throw new Error(err.error)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event
          try { event = JSON.parse(line.slice(6)) } catch { continue }

          setMessages(prev => {
            const msgs = [...prev]
            const last = { ...msgs[msgs.length - 1] }

            if (event.type === 'text') {
              last.content += event.text
            }

            if (event.type === 'tool_start') {
              last.toolUses = [...(last.toolUses ?? []), { tool: event.tool, input: event.input, done: false }]
            }

            if (event.type === 'tool_end') {
              last.toolUses = (last.toolUses ?? []).map(t =>
                t.tool === event.tool && !t.done ? { ...t, done: true } : t
              )
            }

            if (event.type === 'done' || event.type === 'error') {
              last.streaming = false
              if (event.type === 'error') last.content += `\n\n[Error: ${event.message}]`
            }

            msgs[msgs.length - 1] = last
            return msgs
          })
        }
      }
    } catch (err) {
      setMessages(prev => {
        const msgs = [...prev]
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `Error: ${err.message}`, streaming: false }
        return msgs
      })
    } finally {
      setStreaming(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="chat-wrap">
      <div className="chat-messages">
        {isEmpty && (
          <div className="chat-empty">
            <p className="chat-empty-title">Ask about the news</p>
            <p className="chat-empty-sub">
              I can search for articles, run sentiment analysis, and draw on the articles you've already analysed.
            </p>
            <div className="chat-suggestions">
              {SUGGESTED.map(s => (
                <button key={s} className="chat-suggestion" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message key={i} msg={msg} />
        ))}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-bar">
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about the news…"
          rows={1}
          disabled={streaming}
        />
        <button
          className="chat-send-btn"
          onClick={() => send()}
          disabled={streaming || !input.trim()}
        >
          {streaming ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
