import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE, tokens } from '@/api/client'
import { api } from '@/api/client'

/**
 * One assistant conversation: the messages, and the stream that fills the last one in.
 *
 * `fetch` with a manual reader rather than `EventSource`, for two reasons that both rule it out:
 * `EventSource` cannot send a request body — and the question, the recent turns and the
 * conversation id all travel in one — and it cannot set an Authorization header, so the endpoint
 * would have to take a token in the query string, where it would end up in every access log.
 */

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
  /** Tools the model called while composing this reply, in order. */
  tools?: string[]
  error?: string
}

export interface AssistantInfo {
  enabled: boolean
  providerConfigured: boolean
  model: string
  quickPrompts: string[]
}

export function useAssistant() {
  const [info, setInfo] = useState<AssistantInfo | null>(null)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const conversationId = useRef<string | null>(null)
  // Kept so a new question, or closing the drawer, abandons an answer already in flight rather
  // than letting two streams write into the same message.
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<AssistantInfo>('/assistant')
      .then((next) => {
        if (!cancelled) setInfo(next)
      })
      .catch(() => {
        if (!cancelled) setInfo(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const stop = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    setStreaming(false)
  }, [])

  const reset = useCallback(() => {
    stop()
    setMessages([])
    conversationId.current = null
  }, [stop])

  const ask = useCallback(
    async (question: string, context?: { type: string; id: string } | null) => {
      const trimmed = question.trim()
      if (!trimmed || streaming) return

      stop()
      const controller = new AbortController()
      abort.current = controller
      setStreaming(true)

      // Both messages are appended before the request: the question should appear the instant it
      // is sent, and the empty assistant message is the slot tokens stream into.
      const history = messages.map(({ role, content }) => ({ role, content }))
      setMessages((current) => [
        ...current,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: '', tools: [] },
      ])

      const writeLast = (update: (message: AssistantMessage) => AssistantMessage) =>
        setMessages((current) =>
          current.map((message, index) =>
            index === current.length - 1 ? update(message) : message,
          ),
        )

      try {
        const response = await fetch(`${API_BASE}/assistant/ask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(tokens.access() ? { Authorization: `Bearer ${tokens.access()}` } : {}),
          },
          body: JSON.stringify({
            question: trimmed,
            history,
            conversationId: conversationId.current,
            // Sent per question, not per conversation: the user can navigate mid-thread, and the
            // record they are looking at now is the one "this deal" should mean.
            context: context ?? null,
          }),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          writeLast((message) => ({
            ...message,
            error:
              response.status === 401
                ? 'Your session expired. Sign in again.'
                : 'The assistant could not be reached.',
          }))
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        // Events are separated by a blank line and can be split across network chunks, so the
        // tail of the buffer is kept until a terminator actually arrives.
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''

          for (const part of parts) {
            const line = part.split('\n').find((candidate) => candidate.startsWith('data:'))
            if (!line) continue

            let event: { type: string; text?: string; name?: string; message?: string; conversationId?: string }
            try {
              event = JSON.parse(line.slice(5).trim())
            } catch {
              continue
            }

            if (event.type === 'start' && event.conversationId) {
              conversationId.current = event.conversationId
            } else if (event.type === 'token' && event.text) {
              writeLast((message) => ({ ...message, content: message.content + event.text }))
            } else if (event.type === 'tool' && event.name) {
              writeLast((message) => ({ ...message, tools: [...(message.tools ?? []), event.name!] }))
            } else if (event.type === 'error') {
              writeLast((message) => ({ ...message, error: event.message ?? 'Something went wrong.' }))
            }
          }
        }
      } catch (error) {
        // An abort is the user's own doing — a new question or a closed drawer — so it is not
        // reported as a failure.
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          writeLast((message) => ({ ...message, error: 'The connection dropped mid-answer.' }))
        }
      } finally {
        setStreaming(false)
        abort.current = null
      }
    },
    [messages, streaming, stop],
  )

  // Abandon any stream still running when the drawer unmounts.
  useEffect(() => () => abort.current?.abort(), [])

  return { info, messages, streaming, ask, stop, reset }
}
