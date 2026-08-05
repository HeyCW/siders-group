// Consumes the public-news-api by-slug endpoint. Implemented by the
// add-web-news-pages follow-up change.
export const revalidate = 60;

export default function NewsArticlePage({ params }: { params: { slug: string } }) {
  return <main>Article: {params.slug}</main>;
}
