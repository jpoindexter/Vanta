import type { ChatMessage } from '@/lib/chat-messages'

/** A refreshed transcript can put later same-request segments after the live stream row. */
export function terminalStreamIndex(
  messages: ChatMessage[],
  lastUserIndex: number,
  streamId: string | null,
  failed: boolean
): number {
  const streamIndex = streamId
    ? messages.findIndex((message, index) => index > lastUserIndex && message.id === streamId)
    : -1
  if (streamIndex < 0 || !failed) return streamIndex
  return messages.findLastIndex(
    (message, index) => index > lastUserIndex && message.role === 'assistant' && !message.hidden
  )
}

interface TerminalSettlement {
  messages: ChatMessage[]
  index: number
  failed: boolean
  complete: (message: ChatMessage) => ChatMessage
}

/** Keep the failure on its request's tail; earlier live segments must stop showing activity. */
export function settleTerminalMessage({ messages, index, failed, complete }: TerminalSettlement): ChatMessage[] {
  const userIndex = messages.slice(0, index).findLastIndex((message) => message.role === 'user')
  return messages.map((message, messageIndex) => {
    if (messageIndex === index) return complete(message)
    if (failed && messageIndex > userIndex && messageIndex < index && message.role === 'assistant' && message.pending) {
      return { ...message, pending: false, interim: true }
    }
    return message
  })
}
