import type { ReactNode } from 'react';

/** The design's one repeated shell: `max-width:1120px; margin:0 auto; padding:0 clamp(16px,4vw,40px)`. */
export function Container({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-[1120px] px-[clamp(16px,4vw,40px)] ${className}`}>
      {children}
    </div>
  );
}
