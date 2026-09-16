/**
 * Renders a JSON-LD block into the document.
 *
 * Schema.org allows this in `<body>`, and rendering it as part of the React tree is what lets the
 * build-time prerender (`scripts/prerender.mjs`) capture it in the served HTML — the same markup
 * then also exists for a reader who arrives via client-side navigation.
 *
 * `<` is escaped so a stray `</script>` inside any string can never close the tag early; that is
 * the one injection route `dangerouslySetInnerHTML` opens here, and JSON's own escaping does not
 * cover it.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
