<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\AnakUsaha;
use App\Models\Article;
use App\Models\Category;
use App\Models\GuidePick;
use App\Models\HomeCuration;
use App\Models\User;
use Database\Seeders\Support\DemoAssetLibrary;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Local-dev only (never run in production — see DatabaseSeeder). The old Node app shipped no
 * equivalent of this at all — db/seed.sql only ever bootstrapped the first Owner account — so
 * every admin/web screen was empty until someone created content by hand. This exists purely so
 * a fresh `migrate:fresh --seed` has something to look at: a few categories, articles in each
 * pipeline stage, and guide picks ("reels"). Anak-usaha and partner rows come from their own
 * seeders, which carry the real logos.
 *
 * Media comes from DemoAssetLibrary — real, freely-licensed photos and videos cached on the media
 * disk — so no screen ever renders a generated placeholder. An asset that can't be fetched (first
 * run with no network) simply yields less demo content: an article without a featured image, a
 * guide pick skipped entirely.
 */
class DemoContentSeeder extends Seeder
{
    private DemoAssetLibrary $assets;

    public function run(): void
    {
        $this->assets = new DemoAssetLibrary;

        $owner = User::orderBy('created_at')->first();

        if ($owner === null) {
            return; // Nothing to attribute authorship/uploads to yet.
        }

        $categories = collect(['Berita', 'Bisnis', 'Gaya Hidup'])
            ->map(fn (string $name) => Category::firstOrCreate(['slug' => Str::slug($name)], ['name' => $name]));

        // Anak-usaha rows and their profiles (real logos, copy, links) belong to AnakUsahaSeeder,
        // which runs first — this seeder only borrows one to attribute a demo article to.
        $anakUsahaEntries = AnakUsaha::orderBy('name')->get();

        $featuredImages = collect(range(1, 3))->map(fn (int $i) => $this->assets->media("featured-{$i}", $owner));

        $articles = $this->seedArticles($owner, $categories, $anakUsahaEntries->first(), $featuredImages);

        HomeCuration::truncate();
        $articles->where('status', 'published')->take(2)->values()->each(
            fn (Article $article, int $index) => HomeCuration::create(['article_id' => $article->id, 'position' => $index]),
        );

        // Partners come from their real logos via PartnerSeeder, which runs before this seeder.
        $this->seedGuidePicks($owner);
    }

    /** @return Collection<int, Article> */
    private function seedArticles(User $owner, $categories, ?AnakUsaha $anakUsaha, $featuredImages)
    {
        $specs = [
            ['title' => 'Peluncuran Produk Baru Siders', 'status' => 'published', 'publishedAt' => now()->subDays(5)],
            ['title' => 'Tips Produktivitas ala Tim Siders', 'status' => 'published', 'publishedAt' => now()->subDays(1)],
            ['title' => 'Wawancara Eksklusif Bersama Founder', 'status' => 'published', 'publishedAt' => now()->subHours(3)],
            ['title' => 'Rencana Ekspansi Tahun Depan', 'status' => 'scheduled', 'publishedAt' => now()->addDays(2)],
            ['title' => 'Draf Artikel yang Belum Terbit', 'status' => 'draft', 'publishedAt' => null],
        ];

        $articles = collect($specs)->map(function (array $spec, int $index) use ($owner, $categories, $anakUsaha, $featuredImages) {
            $slug = Str::slug($spec['title']);

            // A body image, distinct from `featured_media_id` (the list/card thumbnail) — this
            // one sits inside the article content itself, same `image` node shape the editor's
            // `Image` extension produces (apps/admin/src/editor/extensions.ts).
            $bodyImage = $this->assets->media("article-body-{$index}", $owner);
            $bodyImageUrl = $bodyImage === null ? null : Storage::disk('public')->url($bodyImage->storage_path);

            $article = Article::updateOrCreate(
                ['slug' => $slug],
                [
                    'title' => $spec['title'],
                    'body_json' => [
                        'type' => 'doc',
                        'content' => array_values(array_filter([
                            [
                                'type' => 'paragraph',
                                'content' => [[
                                    'type' => 'text',
                                    'text' => 'Ini adalah konten demo untuk artikel "'.$spec['title'].'".',
                                ]],
                            ],
                            $bodyImageUrl === null ? null : [
                                'type' => 'image',
                                'attrs' => [
                                    'src' => $bodyImageUrl,
                                    'alt' => $bodyImage->alt ?? $spec['title'],
                                    'title' => null,
                                    'caption' => $bodyImage->caption,
                                    'align' => 'center',
                                    'width' => null,
                                ],
                            ],
                        ])),
                    ],
                    'body_html' => '<p>Ini adalah konten demo untuk artikel "'.e($spec['title']).'".</p>'
                        .($bodyImageUrl === null ? '' : '<img src="'.e($bodyImageUrl).'" alt="'.e($bodyImage->alt ?? $spec['title']).'">'),
                    'excerpt' => 'Ringkasan singkat demo untuk '.$spec['title'].'.',
                    'status' => $spec['status'],
                    'author_id' => $owner->id,
                    'featured_media_id' => $featuredImages[$index % $featuredImages->count()]?->id,
                    'anak_usaha_id' => $index === 0 ? $anakUsaha?->id : null,
                    'seo_title' => $spec['title'],
                    'seo_description' => 'Deskripsi SEO demo.',
                    'published_at' => $spec['publishedAt'],
                ],
            );

            $article->categories()->sync([$categories[$index % $categories->count()]->id]);

            return $article;
        });

        return $articles;
    }

    /** "Reels" — the Guide of the Week video picks. */
    private function seedGuidePicks(User $owner): void
    {
        $spots = [
            ['city' => 'Jakarta', 'place' => 'Monas'],
            ['city' => 'Surabaya', 'place' => 'Tugu Pahlawan'],
            ['city' => 'Jakarta', 'place' => 'Kota Tua'],
        ];

        foreach ($spots as $index => $spot) {
            $photo = $this->assets->media("guide-pick-photo-{$index}", $owner);
            $video = $this->assets->media("guide-pick-video-{$index}", $owner);

            // Both columns are NOT NULL — a pick without real media is skipped, never faked.
            if ($photo === null || $video === null) {
                continue;
            }

            // Keyed on the spot rather than guarded by `GuidePick::count()`, so re-seeding also
            // repoints a row an older run left on a placeholder.
            GuidePick::updateOrCreate(
                ['city' => $spot['city'], 'place' => $spot['place']],
                [
                    'description' => "Kunjungi {$spot['place']} di {$spot['city']} — rekomendasi demo.",
                    'photo_media_id' => $photo->id,
                    'video_media_id' => $video->id,
                    'sort_order' => $index,
                    'is_active' => true,
                ],
            );
        }
    }
}
