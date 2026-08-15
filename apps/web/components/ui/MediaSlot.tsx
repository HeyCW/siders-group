/**
 * Every `<image-slot>` in the prototype (Claude Design's own drag-and-drop editor tooling, no
 * shipped equivalent — `proposal.md` — Non-Goals) becomes this: a real `<img>` when a URL is
 * available, a plain labeled placeholder box when it isn't.
 */
export function MediaSlot({
  src,
  alt,
  label,
  aspectClassName,
  className = '',
}: {
  src?: string | null;
  alt: string;
  label: string;
  aspectClassName: string;
  className?: string;
}) {
  return (
    <div className={`relative w-full border border-rule bg-white ${aspectClassName} ${className}`}>
      {src ? (
        // Plain <img>, not next/image: the media host is env-configured (R2/CDN) and not
        // registered in next.config.mjs's image remotePatterns.
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          {label}
        </div>
      )}
    </div>
  );
}
