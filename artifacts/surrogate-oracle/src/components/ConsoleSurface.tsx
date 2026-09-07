import type { HTMLAttributes, ReactNode } from 'react';

type ConsoleSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/**
 * Shared framing primitive for tools that temporarily sit above the alley.
 * It intentionally owns no open/close state so each surface keeps its
 * existing workflow and can remain a reversible overlay.
 */
export function ConsoleSurface({ children, className = '', ...props }: ConsoleSurfaceProps) {
  return (
    <div className={`oracle-console-frame ${className}`.trim()} data-console-surface {...props}>
      {children}
    </div>
  );
}