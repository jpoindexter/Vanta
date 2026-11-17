import { KeyboardShortcuts, ModelPicker, SettingsDialog, SetupWizard, ApprovalOverlay } from "./overlays.js";
import { ChatCommandPalette } from "./chat-first-command-palette.js";
import { ChatProjectDialog } from "./chat-first-project-dialog.js";
import { CompletionSoundSettings } from "./sound-settings.js";
import { reconnectProviderAndResume } from "./provider-auth-recovery.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";

type Props = { state: ChatFirstState; actions: ChatFirstActions };

export function ChatFirstOverlays({ state, actions }: Props) {
  const { data, sound, warning } = state;
  return <>
    <ChatCommandPalette state={state} actions={actions} />
    {state.view !== "work" || state.inspector ? <ApprovalOverlay approval={state.approval.approval} onAnswer={state.approval.answerApproval} /> : null}
    <ModelPicker open={data.modelOpen} models={data.models} status={data.status} onClose={data.closeModelPicker}
      onRefresh={data.refreshProviderModels} onSelect={data.setModel} onSettings={data.setModelSettings} />
    <ChatProjectDialog open={state.taskOpen} root={data.status?.root} model={data.status?.model} initialDraft={state.projectTaskRecovery?.draft}
      initialError={state.projectTaskRecovery?.error} onClose={() => state.setTaskOpen(false)} onCreate={actions.createTask} />
    <SettingsDialog open={data.settingsOpen} models={data.models} status={data.status} theme={state.theme}
      fullAccessWarningAcknowledged={warning.acknowledged} onResetFullAccessWarning={warning.reset}
      onTheme={state.setTheme}
      onClose={data.closeSettings} onModel={() => { data.closeSettings(); data.openModelPicker(); }}
      onSetup={() => { data.closeSettings(); data.openSetup(); }} />
    <KeyboardShortcuts open={data.shortcutsOpen} onClose={data.closeShortcuts} />
    <SetupWizard open={data.setupOpen} models={data.models} onClose={data.closeSetup} onSave={async (provider, model, apiKey) => {
      await reconnectProviderAndResume(data.saveSetup, async () => { await state.convo.retry(); },
        { provider, model, apiKey, resume: state.convo.recovery?.failureKind === "provider_auth" });
    }} />
    <CompletionSoundSettings open={data.soundOpen} settings={sound.settings} onChange={sound.update}
      onPreview={() => void sound.preview()} onClose={data.closeSoundSettings} />
  </>;
}
