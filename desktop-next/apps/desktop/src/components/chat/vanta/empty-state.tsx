import type { FC } from "react";
import { Chip } from "@/components/ui/chip";

export interface StarterPrompt {
  /** What the chip says. */
  label: string;
  /** What lands in the composer when it is picked. */
  prompt: string;
}

export interface EmptyStateProps {
  onPick: (prompt: string) => void;
  prompts?: readonly StarterPrompt[];
}

export const EMPTY_HEADING = "What should Vanta do?";

export const EMPTY_CAPABILITY =
  "Research, write, work with files and websites, or keep an eye on something for you. Bring in tools when you need them.";

/** Four concrete starting points, one per kind of work. */
export const STARTER_PROMPTS: readonly StarterPrompt[] = [
  {
    label: "Compare three CRM tools",
    prompt: "Compare three CRM tools and save a brief",
  },
  {
    label: "Summarise my Downloads PDFs",
    prompt: "Summarise the PDFs in my Downloads folder",
  },
  {
    label: "Watch competitor pricing",
    prompt: "Check competitor pricing every morning and tell me what changed",
  },
  {
    label: "Draft follow-ups",
    prompt: "Draft a follow-up email to the last three leads",
  },
];

/**
 * A new chat: one capability line and four concrete prompts. Picking one fills
 * the composer and leaves it for the person to send or edit.
 */
export const EmptyState: FC<EmptyStateProps> = ({
  onPick,
  prompts = STARTER_PROMPTS,
}) => (
  <div className="vp-empty" data-slot="aui_intro" data-vp="empty">
    <h3 data-vp="empty-heading">{EMPTY_HEADING}</h3>
    <p data-vp="empty-copy">{EMPTY_CAPABILITY}</p>
    <div className="vp-chips" data-vp="empty-chips">
      {prompts.map((item) => (
        <Chip
          size="sm"
          key={item.label}
          onClick={() => onPick(item.prompt)}
          type="button"
        >
          {item.label}
        </Chip>
      ))}
    </div>
  </div>
);
