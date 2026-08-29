const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v)$/i;

/**
 * Every `<image-slot>` in the prototype (Claude Design's own drag-and-drop editor tooling, no
 * shipped equivalent — `proposal.md` — Non-Goals) becomes this: a real `<img>` when a URL is
 * available, a plain labeled placeholder box when it isn't. A URL ending in a video extension
 * renders as a looping, muted `<video>` instead — same slot, same aspect box, no separate media
 * field on the article schema.
 */
export function MediaSlot({
  src,
  alt,
  label,
  aspectClassName,
  className = '',
  fit = 'cover',
}: {
  src?: string | null;
  alt: string;
  label: string;
  aspectClassName: string;
  className?: string;
  fit?: 'cover' | 'contain';
}) {
  const fitClassName = fit === 'contain' ? 'object-contain' : 'object-cover';
  return (
    <div className={`relative w-full border border-rule bg-white ${aspectClassName} ${className}`}>
      {src && VIDEO_EXTENSIONS.test(src) ? (
        <video
          src={src}
          className={`absolute inset-0 h-full w-full ${fitClassName}`}
          autoPlay
          loop
          muted
          playsInline
          aria-label={alt}
        />
      ) : src ? (
        <img src={src} alt={alt} className={`absolute inset-0 h-full w-full ${fitClassName}`} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
          {label}
        </div>
      )}
    </div>
  );
}
