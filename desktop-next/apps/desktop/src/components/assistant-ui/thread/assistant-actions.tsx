import { ActionBarPrimitive, BranchPickerPrimitive, useAuiState } from '@assistant-ui/react'
import { useStore } from '@nanostores/react'
import { type FC, useCallback, useState } from 'react'

import { useComposerScope } from '@/app/chat/composer/scope'
import { useSessionView } from '@/app/chat/session-view'
import { ReactionPicker } from '@/components/assistant-ui/thread/message-reactions'
import { useMessageReactions } from '@/components/assistant-ui/thread/use-message-reactions'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { formatElapsed } from '@/components/chat/activity-timer'
import { CopyAction, RateActions } from '@/components/chat/vanta/message-actions'
import { Codicon } from '@/components/ui/codicon'
import { CopyButton } from '@/components/ui/copy-button'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { AudioLines, GitForkIcon, Loader2Icon, SmilePlusIcon, VolumeXIcon } from '@/lib/icons'
import { markAssistantIdSpoken } from '@/lib/spoken-reply'
import { cn } from '@/lib/utils'
import { playSpeechText, stopVoicePlayback } from '@/lib/voice-playback'
import { DESKTOP_BUTTON_ACTIONS, recordAction } from '@/store/desktop-metrics'
import { notifyError } from '@/store/notifications'
import { $voicePlayback } from '@/store/voice-playback'

export interface MessageActionProps {
  messageId: string
  /** Lazy accessor — reads the live message text at action time. Passing the
   *  text itself as a prop forces the whole footer to re-render on every
   *  streaming delta flush (the text changes ~30×/s), which profiling showed
   *  was a large slice of per-token script time on long transcripts. */
  getMessageText: () => string
  /** Lazy accessor for the whole response group's blank-line-joined text — the
   *  explicit full-response copy/read-aloud scope (#118864). Identical to
   *  `getMessageText` on a solo reply. */
  getFullResponseText: () => string
  /** True when the response group carries more than one text-bearing reply, so
   *  the current-reply and full-response scopes actually differ. */
  fullResponseAvailable: boolean
  onBranchInNewChat?: (messageId: string) => void
}

const ReadAloudButton: FC<{
  fullResponseAvailable: boolean
  getFullText: () => string
  getText: () => string
  messageId: string
}> = ({ fullResponseAvailable, getFullText, getText, messageId }) => {
  const { t } = useI18n()
  const copy = t.assistant.thread
  const voicePlayback = useStore($voicePlayback)
  const view = useSessionView()
  const sessionId = useStore(view.$runtimeId)
  // A Bot chat's session owns its own (connection, profile) → its own TTS voice.
  const { connectionId, profile } = useComposerScope()

  const readAloudStatus =
    voicePlayback.source === 'read-aloud' && voicePlayback.messageId === messageId ? voicePlayback.status : 'idle'

  const isPreparing = readAloudStatus === 'preparing'
  const isSpeaking = readAloudStatus === 'speaking'
  const anyPlaybackActive = voicePlayback.status !== 'idle'
  const Icon = isPreparing ? Loader2Icon : isSpeaking ? VolumeXIcon : AudioLines

  const tooltip = isPreparing
    ? copy.preparingAudio
    : isSpeaking
      ? copy.stopReading
      : fullResponseAvailable
        ? `${copy.readAloud} (${copy.readAloudFullResponseHint})`
        : copy.readAloud

  // Default reads the current reply only; Shift-click reads the whole response
  // group — the read-aloud mirror of the two copy scopes (#118864).
  const read = useCallback(
    async (full: boolean) => {
      const text = full ? getFullText() : getText()

      if (!text || $voicePlayback.get().status !== 'idle') {
        return
      }

      try {
        await playSpeechText(text, { connectionId, messageId, profile, source: 'read-aloud' })
        markAssistantIdSpoken(sessionId, view.$messages.get(), messageId)
      } catch (error) {
        notifyError(error, copy.readAloudFailed)
      }
    },
    [connectionId, copy.readAloudFailed, getFullText, getText, messageId, profile, sessionId, view.$messages]
  )

  return (
    <TooltipIconButton
      disabled={isPreparing || (!isSpeaking && anyPlaybackActive)}
      onClick={event => {
        triggerHaptic('selection')
        void (isSpeaking ? stopVoicePlayback() : read(event.shiftKey))
      }}
      tooltip={tooltip}
    >
      <Icon className={cn('size-3.5', isPreparing && 'animate-spin')} />
    </TooltipIconButton>
  )
}

const AssistantActionBar: FC<MessageActionProps & { durationS?: number }> = ({
  durationS,
  fullResponseAvailable,
  getFullResponseText,
  messageId,
  getMessageText,
  onBranchInNewChat
}) => {
  const { t } = useI18n()
  const copy = t.assistant.thread

  const [pickerOpen, setPickerOpen] = useState(false)
  const { enabled: reactionsEnabled, react, reactions: shownReactions } = useMessageReactions(messageId, 'assistant')

  const pickEmoji = useCallback(
    (emoji: null | string) => {
      setPickerOpen(false)
      react(emoji)
    },
    [react]
  )

  return (
    // NOTE: intentionally NOT `hideWhenRunning`. That prop unmounts the bar
    // while the thread streams, which collapses every completed assistant
    // message's footer by this bar's height and shifts the whole conversation
    // when the turn resolves. The bar is invisible at rest (opacity 0, revealed
    // by hover or focus), so keeping it mounted reserves stable layout height.
    <ActionBarPrimitive.Root className="vp-hover-actions" data-slot="aui_msg-actions" data-vp="assistant-actions">
      {durationS !== undefined && (
        <span
          className="vp-action-time select-none tabular-nums"
          data-slot="aui_turn-duration"
          title={t.assistant.thread.turnDuration(formatElapsed(durationS))}
        >
          {formatElapsed(durationS)}
        </span>
      )}
      <CopyAction
        label={copy.copy}
        onCopied={() => recordAction(DESKTOP_BUTTON_ACTIONS.messageCopy, 'click')}
        text={getMessageText}
      />
      <RateActions messageId={messageId} />
      <ActionBarPrimitive.Reload asChild>
        <button
          className="vp-action"
          onClick={() => {
            triggerHaptic('submit')
            recordAction(DESKTOP_BUTTON_ACTIONS.messageRetry, 'click')
          }}
          type="button"
        >
          {copy.errorRetry}
        </button>
      </ActionBarPrimitive.Reload>
      {onBranchInNewChat && (
        <TooltipIconButton
          onClick={() => {
            triggerHaptic('selection')
            onBranchInNewChat(messageId)
          }}
          tooltip={copy.branchNewChat}
        >
          <GitForkIcon className="size-3.5" />
        </TooltipIconButton>
      )}
      {fullResponseAvailable && (
        <CopyButton appearance="icon" buttonSize="icon" label={copy.copyFullResponse} text={getFullResponseText} />
      )}
      <ReadAloudButton
        fullResponseAvailable={fullResponseAvailable}
        getFullText={getFullResponseText}
        getText={getMessageText}
        messageId={messageId}
      />
      {/* ONE slot, Slack-style: the picker trigger and the landed reaction are
          the same element, so reacting never shifts layout. Empty is a smiley;
          a landed reaction is the emoji itself, and clicking it reopens the
          picker to switch or retract. */}
      {(reactionsEnabled || shownReactions.length > 0) && (
        <ReactionPicker
          onOpenChange={setPickerOpen}
          onSelect={pickEmoji}
          open={pickerOpen}
          selected={shownReactions.find(reaction => reaction.author === 'user')?.emoji}
        >
          <TooltipIconButton
            data-reacted={shownReactions.length > 0 || undefined}
            data-slot="aui_msg-reactions"
            data-state={pickerOpen ? 'open' : undefined}
            onClick={reactionsEnabled ? () => setPickerOpen(open => !open) : undefined}
            tooltip={copy.react}
          >
            {shownReactions.length > 0 ? (
              <span className="flex items-center gap-0.5 text-ui leading-none">
                {shownReactions.map(reaction => (
                  <span className="reaction-pop" key={`${reaction.author}-${reaction.emoji}`}>
                    {reaction.emoji}
                  </span>
                ))}
              </span>
            ) : (
              <SmilePlusIcon className="size-3.5" />
            )}
          </TooltipIconButton>
        </ReactionPicker>
      )}
    </ActionBarPrimitive.Root>
  )
}

export const AssistantFooter: FC<MessageActionProps & { durationS?: number }> = ({ durationS, ...props }) => {
  // Copy, rate and retry belong to a finished reply: a running or failed turn
  // shows none, so the cards around it keep the column's rhythm. The check
  // lives in this leaf so a settling turn does not re-render the message root.
  const isComplete = useAuiState(state => state.message.status?.type === 'complete')

  if (!isComplete) {
    return null
  }

  return (
    <div className="vp-assistant-footer flex min-h-6 flex-col items-start gap-1">
      <BranchPickerPrimitive.Root
        className="inline-flex h-6 items-center gap-1 text-xs text-muted-foreground"
        hideWhenSingleBranch
      >
        <BranchPickerPrimitive.Previous className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-35">
          <Codicon name="chevron-left" size="0.875rem" />
        </BranchPickerPrimitive.Previous>
        <span className="tabular-nums">
          <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
        </span>
        <BranchPickerPrimitive.Next className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-35">
          <Codicon name="chevron-right" size="0.875rem" />
        </BranchPickerPrimitive.Next>
      </BranchPickerPrimitive.Root>
      <AssistantActionBar durationS={durationS} {...props} />
    </div>
  )
}
