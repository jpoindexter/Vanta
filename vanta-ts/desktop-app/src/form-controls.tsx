import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

export function StyledSelect({ children, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`select-control${className ? ` ${className}` : ""}`}>
      <select {...props}>
        {children}
      </select>
      <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
    </span>
  );
}
