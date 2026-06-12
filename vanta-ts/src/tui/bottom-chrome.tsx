import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { SessionsPicker } from "./sessions-picker.js";
import { ModelPicker } from "./model-picker.js";
import { ApprovalPrompt } from "./approval.js";
import { Palette } from "./transcript.js";
import { SkillsPicker } from "./skills-picker.js";
import { tokenWarningLevel, tokenWarnDecor } from "./status-bar.js";
import { Composer, type VimMode } from "./composer.js";
import { HelpOverlay } from "./help-overlay.js";
import { composerColors } from "./composer-colors.js";
import { ChromeTheme } from "./theme-picker.js";
import { FooterHint } from "./footer-hint.js";
import { NewMessagesPill } from "./new-messages-pill.js";
import { ChromeCockpit } from "./mission-control/chrome-cockpit.js";
import { PROVIDER_CATALOG, type ProviderEntry } from "../providers/catalog.js";
import type { State } from "./app-reducer.js";
import type { ApprovalMode } from "./approval-mode.js";
import type { VantaTheme } from "./theme.js";
import type { useApproval } from "./use-approval.js";
import type { useOverlays } from "./use-overlays.js";
import type { ReplState } from "../repl-commands.js";
import type { LLMProvider } from "../providers/interface.js";

// The bottom slot of the fullscreen layout: the approval prompt, the modal
// pickers (sessions / model / skills / theme / cockpit), and — by default — the
// composer with its footer hint, palettes, and status bar. BottomChrome is the
// slot router; each Chrome* is one mutually-exclusive occupant. Extracted from
// app.tsx so that file stays a thin orchestrator under the size gate.

const VIM_ENABLED = !!process.env.VANTA_VIM;

/** Picker availability: keyless backends + any provider whose API key is set. */
const hasKey = (entry: ProviderEntry): boolean => entry.envVar === null || !!process.env[entry.envVar];

export type ChromeProps = {
  pending: ReturnType<typeof useApproval>["pending"];
  overlay: string | null;
  state: State;
  editMode: { active: boolean; messageIndex: number };
  showHelp: boolean;
  showPalette: boolean;
  showAtPalette: boolean;
  matchesWithRisk: Array<{ name: string; desc: string; risk: string }>;
  atMatches: string[];
  sel: number;
  atSel: number;
  input: string;
  inputHistory: string[];
  vimMode: VimMode;
  hint: string;
  frame: number;
  w: number;
  activeProvider: LLMProvider;
  estTokens: number;
  mode: ApprovalMode;
  theme: VantaTheme;
  themeName: string;
  setTheme: (name: string) => void;
  sessionList: ReturnType<typeof useOverlays>["sessionList"];
  replStateRef: React.MutableRefObject<ReplState>;
  chooseApproval: ReturnType<typeof useApproval>["chooseApproval"];
  resumeSession: ReturnType<typeof useOverlays>["resumeSession"];
  newSession: ReturnType<typeof useOverlays>["newSession"];
  removeSession: ReturnType<typeof useOverlays>["removeSession"];
  selectModel: ReturnType<typeof useOverlays>["selectModel"];
  skillList: ReturnType<typeof useOverlays>["skillList"];
  cockpitData: ReturnType<typeof useOverlays>["cockpitData"];
  newMessages: number;
  invokeSkill: (name: string) => void;
  setOverlay: ReturnType<typeof useOverlays>["setOverlay"];
  setInput: (v: string) => void;
  submit: (v: string) => void;
};

function SimpleBar(p: { turnIndex: number; estTokens: number; contextWindow: number; w: number }): ReactElement {
  const pct = p.contextWindow > 0 ? Math.round((p.estTokens / p.contextWindow) * 100) : 0;
  const level = tokenWarningLevel(p.estTokens, p.contextWindow);
  const decor = tokenWarnDecor(level);
  return (
    <Box flexDirection="column" paddingX={1} width={p.w}>
      <Box>
        <Text dimColor>Composer {p.turnIndex}</Text>
        <Text dimColor> · </Text>
        <Text color={decor.pctColor} dimColor={!decor.pctColor}>{pct}%</Text>
        {decor.tagText ? <Text color={decor.tagColor}>{decor.tagText}</Text> : null}
      </Box>
      <Text dimColor>/ commands · @ files · ! shell</Text>
    </Box>
  );
}

/** The dim "› doing…" footer shared by every modal picker. */
function PickerFooter(p: { label: string; w: number }): ReactElement {
  return <Box borderStyle="round" borderColor="gray" paddingX={1} width={p.w}><Text dimColor>{"› "}{p.label}</Text></Box>;
}

function ChromeApproval(p: Pick<ChromeProps, "pending" | "chooseApproval" | "w">): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <ApprovalPrompt action={p.pending!.action} reason={p.pending!.reason} toolName={p.pending!.toolName} width={p.w} onChoose={p.chooseApproval} />
      <PickerFooter label="awaiting approval…" w={p.w} />
    </Box>
  );
}

function ChromeSessions(p: Pick<ChromeProps, "sessionList" | "replStateRef" | "resumeSession" | "newSession" | "removeSession" | "setOverlay" | "w">): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <SessionsPicker sessions={p.sessionList} currentId={p.replStateRef.current.sessionId} currentTurns={p.replStateRef.current.turnIndex} nowMs={Date.now()} width={p.w} onResume={p.resumeSession} onNew={p.newSession} onDelete={p.removeSession} onCancel={() => p.setOverlay(null)} />
      <PickerFooter label="choosing session…" w={p.w} />
    </Box>
  );
}

function ChromeSkills(p: Pick<ChromeProps, "skillList" | "invokeSkill" | "setOverlay" | "w">): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <SkillsPicker skills={p.skillList} onInvoke={p.invokeSkill} onCancel={() => p.setOverlay(null)} width={p.w} />
      <PickerFooter label="browsing skills…" w={p.w} />
    </Box>
  );
}

function ChromeModel(p: Pick<ChromeProps, "activeProvider" | "selectModel" | "setOverlay" | "w">): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <ModelPicker providers={PROVIDER_CATALOG} currentProviderId={process.env.VANTA_PROVIDER ?? "openai"} currentModel={p.activeProvider.modelId()} hasKey={hasKey} width={p.w} onSelect={p.selectModel} onCancel={() => p.setOverlay(null)} />
      <PickerFooter label="picking model…" w={p.w} />
    </Box>
  );
}

function ChromeComposer(p: ChromeProps): ReactElement {
  const { borderColor, promptColor, placeholder: basePlaceholder, isHistoryActive } = composerColors({ theme: p.theme, editActive: p.editMode.active, busy: p.state.busy, showPalette: p.showPalette, showAtPalette: p.showAtPalette });
  const vimMode = VIM_ENABLED ? p.vimMode : undefined;
  const placeholder = p.state.busy ? "Add a follow-up..." : basePlaceholder;
  return (
    <Box flexDirection="column" marginTop={1}>
      {p.showHelp && <HelpOverlay width={p.w} vimEnabled={VIM_ENABLED} />}
      <NewMessagesPill count={p.newMessages} accent={p.theme.accent} width={p.w} />
      <FooterHint mode={p.mode ?? "review"} model={p.activeProvider.modelId()} accentColor={p.theme.accent} width={p.w} />
      <Box borderStyle="round" borderColor={borderColor} paddingX={1} width={p.w}>
        <Text color={promptColor}>{"› "}</Text>
        <Composer value={p.input} onChange={p.setInput} onSubmit={p.submit} placeholder={placeholder} history={p.inputHistory} isHistoryActive={isHistoryActive} vimEnabled={VIM_ENABLED} onVimModeChange={() => {}} />
      </Box>
      {p.state.busy ? (
        <Box width={p.w} justifyContent="flex-end" paddingX={2}>
          <Text dimColor>ctrl+c to stop</Text>
        </Box>
      ) : null}
      {p.showPalette ? <Palette matches={p.matchesWithRisk} sel={Math.min(p.sel, p.matchesWithRisk.length - 1)} width={p.w} /> : null}
      {p.showAtPalette ? <Palette matches={p.atMatches.map((f) => ({ name: f, desc: "" }))} sel={Math.min(p.atSel, p.atMatches.length - 1)} width={p.w} /> : null}
      <SimpleBar turnIndex={p.replStateRef.current.turnIndex} estTokens={p.estTokens} contextWindow={p.activeProvider.contextWindow()} w={p.w} />
    </Box>
  );
}

/** Bottom-slot router: pending approval → modal overlay → composer. */
export function BottomChrome(p: ChromeProps): ReactElement {
  if (p.pending) return <ChromeApproval pending={p.pending} chooseApproval={p.chooseApproval} w={p.w} />;
  if (p.overlay === "sessions") return <ChromeSessions sessionList={p.sessionList} replStateRef={p.replStateRef} resumeSession={p.resumeSession} newSession={p.newSession} removeSession={p.removeSession} setOverlay={p.setOverlay} w={p.w} />;
  if (p.overlay === "model") return <ChromeModel activeProvider={p.activeProvider} selectModel={p.selectModel} setOverlay={p.setOverlay} w={p.w} />;
  if (p.overlay === "skills") return <ChromeSkills skillList={p.skillList} invokeSkill={p.invokeSkill} setOverlay={p.setOverlay} w={p.w} />;
  if (p.overlay === "theme") return <ChromeTheme themeName={p.themeName} setTheme={p.setTheme} setOverlay={p.setOverlay} w={p.w} />;
  if (p.overlay === "cockpit") return <ChromeCockpit data={p.cockpitData} onClose={() => p.setOverlay(null)} w={p.w} />;
  return <ChromeComposer {...p} />;
}
