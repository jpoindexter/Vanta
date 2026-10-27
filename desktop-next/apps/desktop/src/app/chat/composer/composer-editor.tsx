import { ComposerPrimitive } from '@assistant-ui/react'
import type { ComponentProps, CompositionEvent, RefObject } from 'react'

import { isMacPlatform } from '@/lib/platform'
import { cn } from '@/lib/utils'

import { ComposerDirectiveActions } from './directive-actions'
import { beginComposerComposition, RICH_INPUT_SLOT } from './rich-editor'

interface CompositionOptions {
  composingRef: RefObject<boolean>
  blurCloseTimer: RefObject<number | null>
  closeTrigger: () => void
  flushEditorToDraft: (editor: HTMLDivElement) => void
}

function editorCompositionHandlers(options: CompositionOptions) {
  return {
    onBlur: () => {
      // A missed compositionend must not leave Send permanently blocked after blur.
      options.composingRef.current = false
      if (options.blurCloseTimer.current !== null) window.clearTimeout(options.blurCloseTimer.current)
      options.blurCloseTimer.current = window.setTimeout(() => {
        options.blurCloseTimer.current = null
        options.closeTrigger()
      }, 80)
    },
    onCompositionEnd: (event: CompositionEvent<HTMLDivElement>) => {
      options.composingRef.current = false
      // Windows IMEs may not emit an input event after committing their preedit.
      options.flushEditorToDraft(event.currentTarget)
    },
    onCompositionStart: (event: CompositionEvent<HTMLDivElement>) => {
      options.composingRef.current = true
      beginComposerComposition(event.currentTarget)
    }
  }
}

/** Keep assistant-ui's binding without its hidden per-keystroke autosize layouts. */
function AssistantComposerBinding() {
  return (
    <ComposerPrimitive.Input asChild submitMode="ctrlEnter" tabIndex={-1} unstable_focusOnScrollToBottom={false}>
      <textarea aria-hidden autoCapitalize="off" autoComplete="off" autoCorrect="off"
        className="sr-only" spellCheck={false} tabIndex={-1} />
    </ComposerPrimitive.Input>
  )
}

interface ComposerEditorProps extends Omit<ComponentProps<'div'>, 'children' | 'ref'>, CompositionOptions {
  editorRef: RefObject<HTMLDivElement | null>
  inputDisabled: boolean
  inputWidthClass: string
  stacked: boolean
  hudNativeDrag: boolean
  placeholder: string
}

export function ComposerEditor(props: ComposerEditorProps) {
  const { editorRef, inputDisabled, inputWidthClass, stacked, hudNativeDrag, placeholder,
    composingRef, blurCloseTimer, closeTrigger, flushEditorToDraft, ...inputProps } = props
  return (
    <div className={cn('relative', inputWidthClass)}>
      <div {...inputProps}
        {...editorCompositionHandlers({ composingRef, blurCloseTimer, closeTrigger, flushEditorToDraft })}
        aria-disabled={inputDisabled ? true : undefined}
        autoCapitalize="off"
        // macOS text replacement shares the autocorrect gate; spellcheck stays off.
        autoCorrect={isMacPlatform() ? 'on' : 'off'}
        className={cn(
          'min-h-[1.625rem] min-h-(--composer-input-min-height) max-h-(--composer-input-max-height) cursor-text overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] bg-transparent pb-1 pr-1 pt-1 leading-normal text-foreground outline-none disabled:cursor-not-allowed',
          '**:data-ref-text:cursor-default', stacked && 'pl-3', inputWidthClass,
          // Native Wayland drag regions otherwise swallow input mouse events.
          hudNativeDrag && '[-webkit-app-region:no-drag]'
        )}
        contentEditable={!inputDisabled}
        data-placeholder={placeholder}
        data-slot={RICH_INPUT_SLOT}
        data-vp="composer-input"
        ref={editorRef}
        role="textbox"
        spellCheck={false}
        suppressContentEditableWarning
      />
      <ComposerDirectiveActions editorRef={editorRef} />
      <AssistantComposerBinding />
    </div>
  )
}
