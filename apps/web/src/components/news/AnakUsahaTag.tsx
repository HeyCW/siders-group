/**
 * Per-sub-brand tag colors, keyed by slug. Hardcoded rather than pulled from the anak usaha
 * admin profile's `backgroundColor` (that field drives `AnakUsahaTiles.tsx`'s tile instead) —
 * this tag needs a color even for entries with no active profile.
 */
const ANAK_USAHA_TAG_COLORS: Record<string, { bg: string; ink: string }> = {
  'surabaya-siders': { bg: '#C1440E', ink: '#F7F6F2' },
  'jakarta-siders': { bg: '#1D4E89', ink: '#F7F6F2' },
  sidersvox: { bg: '#000000', ink: '#F7F6F2' },
};

const DEFAULT_TAG_COLOR = { bg: '#55534D', ink: '#F7F6F2' };

export function AnakUsahaTag({ name, slug }: { name: string; slug: string }) {
  const { bg, ink } = ANAK_USAHA_TAG_COLORS[slug] ?? DEFAULT_TAG_COLOR;
  return (
    <span
      className="inline-block px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-widest"
      style={{ backgroundColor: bg, color: ink }}
    >
      {name}
    </span>
  );
}
