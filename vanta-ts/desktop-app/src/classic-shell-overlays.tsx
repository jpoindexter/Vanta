import type { useFullAccessWarning } from "./full-access-warning.js";
import { CommandPalette,KeyboardShortcuts,ModelPicker,SettingsDialog,SetupWizard } from "./overlays.js";
import { reconnectProviderAndResume } from "./provider-auth-recovery.js";
import { CompletionSoundSettings } from "./sound-settings.js";
import type { useCompletionSound,useConversation,useDesktopData } from "./state.js";
import type { DesktopTheme,DesktopView } from "./types.js";

type DesktopData = ReturnType<typeof useDesktopData>;
type CompletionSound = ReturnType<typeof useCompletionSound>;

export function DesktopOverlays(props: {
  data: DesktopData;
  sound: CompletionSound;
  convo: ReturnType<typeof useConversation>;
  theme: DesktopTheme;
  accessWarning: ReturnType<typeof useFullAccessWarning>;
  onTheme: (theme: DesktopTheme) => void;
  onNew: () => void;
  onTelegram: () => void;
  onReview: () => void;
  onSidebar: () => void;
  onCycleMode: () => void;
  onView: (view: DesktopView) => void;
}) {
  const { data, sound, convo } = props;
  return (
    <>
      <CommandPalette
        open={data.paletteOpen}
        onClose={data.closePalette}
        onNew={props.onNew}
        onReview={props.onReview}
        onSidebar={props.onSidebar}
        onCycleMode={props.onCycleMode}
        onView={props.onView}
        onModel={data.openModelPicker}
        onTelegram={props.onTelegram}
        onSound={data.openSoundSettings}
        onSettings={data.openSettings}
      />
      <ModelPicker open={data.modelOpen} models={data.models} status={data.status} onClose={data.closeModelPicker} onRefresh={data.refreshProviderModels} onSelect={data.setModel} onSettings={data.setModelSettings} />
      <SettingsDialog open={data.settingsOpen} models={data.models} status={data.status} theme={props.theme} fullAccessWarningAcknowledged={props.accessWarning.acknowledged} onResetFullAccessWarning={props.accessWarning.reset} onTheme={props.onTheme} onClose={data.closeSettings} onModel={data.openModelPicker} onSetup={data.openSetup} />
      <KeyboardShortcuts open={data.shortcutsOpen} onClose={data.closeShortcuts} />
      <SetupWizard open={data.setupOpen} models={data.models} onClose={data.closeSetup} onSave={async (provider, model, apiKey) => {
        const resume = convo.recovery?.failureKind === "provider_auth";
        await reconnectProviderAndResume(data.saveSetup, async () => { await convo.retry(); }, { provider, model, apiKey, resume });
      }} />
      <CompletionSoundSettings
        open={data.soundOpen}
        settings={sound.settings}
        onChange={sound.update}
        onPreview={() => { void sound.preview(); }}
        onClose={data.closeSoundSettings}
      />
    </>
  );
}
