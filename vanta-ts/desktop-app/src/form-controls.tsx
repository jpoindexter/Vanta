import { ChevronDown } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function ControlButton({ className = "", tone = "default", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "primary" | "danger" }) {
  return <button {...props} className={`control-button tone-${tone}${className ? ` ${className}` : ""}`} />;
}

export function TextField({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`control-field${className ? ` ${className}` : ""}`} />;
}

export function InlineError({ children, className = "", ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={`inline-error${className ? ` ${className}` : ""}`} role="alert">{children}</p>;
}

export function LoadingIndicator({ label = "Loading" }: { label?: string }) {
  return <span className="loading-indicator" role="status"><span className="loader" aria-hidden="true" /><span className="sr-only">{label}</span></span>;
}

export function ConfirmationActions({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={`confirmation-actions${className ? ` ${className}` : ""}`}>{children}</div>;
}

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
