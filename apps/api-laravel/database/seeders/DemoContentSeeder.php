<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\AnakUsaha;
use App\Models\AnakUsahaProfile;
use App\Models\Article;
use App\Models\Category;
use App\Models\GuidePick;
use App\Models\HomeCuration;
use App\Models\Media;
use App\Models\Partner;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Local-dev only (never run in production — see DatabaseSeeder). The old Node app shipped no
 * equivalent of this at all — db/seed.sql only ever bootstrapped the first Owner account — so
 * every admin/web screen was empty until someone created content by hand. This exists purely so
 * a fresh `migrate:fresh --seed` has something to look at: a few categories, anak-usaha profiles,
 * articles in each pipeline stage, partners, and guide picks ("reels").
 *
 * Media rows here point at placeholder bytes written directly to the media disk — a real 1x1
 * JPEG (so an <img> actually renders something) and a byte blob merely *shaped* like an MP4
 * header (not a real playable video) — this is demo filler, not a fixture for testing the
 * upload/sniffing pipeline itself.
 */
class DemoContentSeeder extends Seeder
{
    private const PLACEHOLDER_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

    private const PLACEHOLDER_MP4_HEX = '0000001c6674797069736f6d0000020069736f6d69736f32617663316d703431';

    public function run(): void
    {
        $owner = User::orderBy('created_at')->first();

        if ($owner === null) {
            return; // Nothing to attribute authorship/uploads to yet.
        }

        $categories = collect(['Berita', 'Bisnis', 'Gaya Hidup'])
            ->map(fn (string $name) => Category::firstOrCreate(['slug' => Str::slug($name)], ['name' => $name]));

        $anakUsahaEntries = AnakUsaha::orderBy('name')->get();
        $this->seedAnakUsahaProfiles($anakUsahaEntries, $owner);

        $featuredImages = collect(range(1, 3))->map(fn (int $i) => $this->placeholderImage($owner, "featured-{$i}"));

        $articles = $this->seedArticles($owner, $categories, $anakUsahaEntries->first(), $featuredImages);

        HomeCuration::truncate();
        $articles->where('status', 'published')->take(2)->values()->each(
            fn (Article $article, int $index) => HomeCuration::create(['article_id' => $article->id, 'position' => $index]),
        );

        $this->seedPartners($owner);
        $this->seedGuidePicks($owner);
    }

    private function seedAnakUsahaProfiles($anakUsahaEntries, User $owner): void
    {
        $kinds = ['Media Platform', 'News & Community'];

        foreach ($anakUsahaEntries->take(2) as $index => $anakUsaha) {
            if ($anakUsaha->profile !== null) {
                continue;
            }

            AnakUsahaProfile::create([
                'anak_usaha_id' => $anakUsaha->id,
                'logo_media_id' => $this->placeholderImage($owner, "anak-usaha-logo-{$index}")->id,
                'background_color' => '#1a1a2e',
                'description' => "Profil demo untuk {$anakUsaha->name}.",
                'kind' => $kinds[$index] ?? $kinds[0],
                'links' => [['label' => 'Instagram', 'url' => 'https://instagram.com/example']],
                'sort_order' => $index,
                'is_active' => true,
            ]);
        }
    }

    /** @return \Illuminate\Support\Collection<int, Article> */
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

            $article = Article::updateOrCreate(
                ['slug' => $slug],
                [
                    'title' => $spec['title'],
                    'body_json' => ['type' => 'doc', 'content' => [['type' => 'paragraph']]],
                    'body_html' => '<p>Ini adalah konten demo untuk artikel "'.e($spec['title']).'".</p>',
                    'excerpt' => 'Ringkasan singkat demo untuk '.$spec['title'].'.',
                    'status' => $spec['status'],
                    'author_id' => $owner->id,
                    'featured_media_id' => $featuredImages[$index % $featuredImages->count()]->id,
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

    private function seedPartners(User $owner): void
    {
        if (Partner::count() > 0) {
            return;
        }

        foreach (['Mitra Alpha', 'Mitra Beta', 'Mitra Gamma'] as $index => $name) {
            Partner::create([
                'name' => $name,
                'logo_media_id' => $this->placeholderImage($owner, "partner-logo-{$index}")->id,
                'website_url' => 'https://example.com/'.Str::slug($name),
                'sort_order' => $index,
                'is_active' => true,
            ]);
        }
    }

    /** "Reels" — the Guide of the Week video picks. */
    private function seedGuidePicks(User $owner): void
    {
        if (GuidePick::count() > 0) {
            return;
        }

        $spots = [
            ['city' => 'Jakarta', 'place' => 'Monas'],
            ['city' => 'Surabaya', 'place' => 'Tugu Pahlawan'],
            ['city' => 'Bandung', 'place' => 'Gedung Sate'],
        ];

        foreach ($spots as $index => $spot) {
            GuidePick::create([
                'city' => $spot['city'],
                'place' => $spot['place'],
                'description' => "Kunjungi {$spot['place']} di {$spot['city']} — rekomendasi demo.",
                'photo_media_id' => $this->placeholderImage($owner, "guide-pick-photo-{$index}")->id,
                'video_media_id' => $this->placeholderVideo($owner, "guide-pick-video-{$index}")->id,
                'sort_order' => $index,
                'is_active' => true,
            ]);
        }
    }

    private function placeholderImage(User $owner, string $tag): Media
    {
        $path = "media/seed/{$tag}.jpg";

        if (! Storage::disk('public')->exists($path)) {
            Storage::disk('public')->put($path, base64_decode(self::PLACEHOLDER_JPEG_BASE64));
        }

        return Media::firstOrCreate(
            ['storage_path' => $path],
            [
                'mime' => 'image/jpeg',
                'size_bytes' => Storage::disk('public')->size($path),
                'original_filename' => "{$tag}.jpg",
                'uploaded_by' => $owner->id,
            ],
        );
    }

    private function placeholderVideo(User $owner, string $tag): Media
    {
        $path = "media/seed/{$tag}.mp4";

        if (! Storage::disk('public')->exists($path)) {
            Storage::disk('public')->put($path, hex2bin(str_replace(' ', '', self::PLACEHOLDER_MP4_HEX)).str_repeat("\0", 200));
        }

        return Media::firstOrCreate(
            ['storage_path' => $path],
            [
                'mime' => 'video/mp4',
                'size_bytes' => Storage::disk('public')->size($path),
                'original_filename' => "{$tag}.mp4",
                'uploaded_by' => $owner->id,
            ],
        );
    }
}
