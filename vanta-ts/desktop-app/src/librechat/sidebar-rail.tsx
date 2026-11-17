// Adapted from LibreChat UnifiedSidebar/ExpandedPanel.tsx at
// f10b1d91f1eee3a2c82d5247bf620351486b7c1b. Copyright (c) 2026 LibreChat.
// MIT; see ./LICENSE. Host commands replace its router, Recoil and auth bindings.
import { memo } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type NavigationItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type Props = {
  items: NavigationItem[];
  header?: ReactNode;
  extra?: ReactNode;
  footer?: ReactNode;
};

const NavIconButton = memo(function NavIconButton({ item }: { item: NavigationItem }) {
  return <button type="button" className="lc-rail-control" aria-label={item.label}
    title={item.label} aria-pressed={item.active} disabled={item.disabled} onClick={item.onSelect}>
    <item.icon size={19} aria-hidden="true" />
    <span className="lc-rail-tooltip" aria-hidden="true">{item.label}</span>
  </button>;
});

export function SidebarRail({ items, header, extra, footer }: Props) {
  return <nav className="lc-sidebar-rail" aria-label="Workspace navigation">
    {header}
    <div className="lc-rail-divider" />
    <div className="lc-rail-destinations">
      {items.map((item) => <NavIconButton key={item.id} item={item} />)}
      {extra}
    </div>
    <div className="lc-rail-footer">{footer}</div>
  </nav>;
}
