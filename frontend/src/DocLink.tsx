import type { ReactNode } from "react";

// Inputs are kept only in this page, so leaving it would discard a user's work.
export function DocLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} className={className} target="_blank" rel="noreferrer">
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
