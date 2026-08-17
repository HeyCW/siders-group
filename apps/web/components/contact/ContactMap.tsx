/**
 * Keyless `output=embed` iframe (undocumented Google URL form, no API key/billing
 * required) rather than the official Maps Embed API or a map library — see
 * `openspec/changes/add-contact-map/design.md`. Isolated here so swapping the
 * provider later only touches this file.
 */
export function ContactMap({ query }: { query: string }) {
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;

  return (
    <iframe
      src={src}
      title="Peta lokasi kantor Siders"
      loading="lazy"
      className="absolute inset-0 h-full w-full border-0"
    />
  );
}
