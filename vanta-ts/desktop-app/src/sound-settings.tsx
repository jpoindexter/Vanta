import { useEffect, useRef } from "react";
import {
  COMPLETION_SOUND_IDS,
  COMPLETION_SOUND_LABELS,
  type CompletionSoundId,
  type CompletionSoundSettings as CompletionSoundPrefs,
} from "./completion-sound.js";

export function CompletionSoundSettings(props: {
  open: boolean;
  settings: CompletionSoundPrefs;
  onChange: (settings: CompletionSoundPrefs) => void;
  onPreview: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstControl = useRef<HTMLInputElement>(null);
  useModalDialog(props.open, props.onClose, dialog, firstControl);

  if (!props.open) return null;
  return (
      <dialog ref={dialog} className="sound-settings" aria-labelledby="completion-sound-title" onCancel={(event) => { event.preventDefault(); props.onClose(); }}>
        <h2 id="completion-sound-title">Completion sound</h2>
        <label className="toggle-row">
          <input
            ref={firstControl}
            type="checkbox"
            checked={props.settings.enabled}
            onChange={(event) => props.onChange({ ...props.settings, enabled: event.currentTarget.checked })}
          />
          <span>Play after each completed turn</span>
        </label>
        <label className="select-row" htmlFor="completion-sound-choice">
          <span>Chime</span>
          <select
            id="completion-sound-choice"
            value={props.settings.sound}
            disabled={!props.settings.enabled}
            onChange={(event) => props.onChange({ ...props.settings, sound: event.currentTarget.value as CompletionSoundId })}
          >
            {COMPLETION_SOUND_IDS.map((sound) => <option key={sound} value={sound}>{COMPLETION_SOUND_LABELS[sound]}</option>)}
          </select>
        </label>
        <div className="dialog-actions">
          <button type="button" disabled={!props.settings.enabled} onClick={props.onPreview}>Preview</button>
          <button type="button" onClick={props.onClose}>Close</button>
        </div>
      </dialog>
  );
}

function useModalDialog(
  open: boolean,
  onClose: () => void,
  dialog: React.RefObject<HTMLDialogElement | null>,
  firstControl: React.RefObject<HTMLInputElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    firstControl.current?.focus();
    return () => { if (dialog.current?.open) dialog.current.close(); };
  }, [open, onClose, dialog, firstControl]);
}
