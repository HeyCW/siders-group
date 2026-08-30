<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\AnakUsaha;
use App\Models\AnakUsahaProfile;
use App\Models\Media;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Single source of truth for the three real anak-usaha brands: the logos dropped directly into
 * storage/app/public/media/2026/08/anak-perusahaan (not uploaded through the app, so there are no
 * Media rows for them yet) plus each brand's real copy and links.
 *
 * Everything is upserted by slug rather than skipped-if-present, so re-running also repairs a row
 * left behind by an earlier seed — e.g. a profile still pointing at a `media/seed/...` placeholder
 * logo. The catalog rows themselves come from PermissionCatalogSeeder (which runs first, and in
 * every environment); DemoContentSeeder deliberately no longer seeds these profiles.
 */
class AnakUsahaSeeder extends Seeder
{
    private const DISK = 'public';

    private const LOGO_DIR = 'media/2026/08/anak-perusahaan';

    private const ENTRIES = [
        [
            'name' => 'Siders Vox',
            'filename' => 'siders_vox.png',
            'background_color' => '#000000',
            'kind' => 'News & Community',
            'description' => 'Platform media yang menghadirkan perspektif, opini, dan cerita dari suara generasi muda. Membahas isu sosial, lifestyle, hingga topik yang dekat dengan kehidupan sehari-hari.',
            'links' => [
                ['label' => 'Instagram', 'href' => 'https://www.instagram.com/sidersvox?igsh=NXFqZGF2MG1kYTk5'],
            ],
        ],
        [
            'name' => 'Surabaya Siders',
            'filename' => 'surabaya_siders.png',
            'background_color' => '#ffffff',
            'kind' => 'News & Community',
            'description' => 'Media lokal yang mengangkat berbagai cerita dan perkembangan seputar Surabaya, mulai dari kuliner, lifestyle, tempat menarik, hingga tren yang sedang ramai di kota.',
            'links' => [
                ['label' => 'Instagram', 'href' => 'https://www.instagram.com/surabayasiders?igsh=MXNxdXB2N2N4N2th'],
                ['label' => 'TikTok', 'href' => 'https://www.tiktok.com/@surabaya.siders?_r=1&_t=ZS-992Gnls45US'],
            ],
        ],
        [
            'name' => 'Jakarta Siders',
            'filename' => 'jakarta_siders.png',
            'background_color' => '#000000',
            'kind' => 'Media Platform',
            'description' => 'Media yang mengeksplorasi kehidupan dan dinamika Jakarta, dari lifestyle, kuliner, entertainment, sampai berbagai tren dan tempat menarik yang sedang jadi perhatian.',
            'links' => [
                ['label' => 'Instagram', 'href' => 'https://www.instagram.com/jakarta_siders?igsh=NGRpNWQ2bXBtanFz'],
                ['label' => 'TikTok', 'href' => 'https://www.tiktok.com/@jakartasiders?_r=1&_t=ZS-992GpEooN0f'],
            ],
        ],
    ];

    public function run(): void
    {
        $owner = User::orderBy('created_at')->first();

        if ($owner === null) {
            return; // Nothing to attribute the logo uploads to yet.
        }

        foreach (self::ENTRIES as $index => $entry) {
            $slug = Str::slug($entry['name']);
            $path = self::LOGO_DIR.'/'.$entry['filename'];

            if (! Storage::disk(self::DISK)->exists($path)) {
                continue;
            }

            $logoMedia = Media::updateOrCreate(
                ['storage_path' => $path],
                [
                    'mime' => Storage::disk(self::DISK)->mimeType($path),
                    'size_bytes' => Storage::disk(self::DISK)->size($path),
                    'original_filename' => $entry['filename'],
                    'uploaded_by' => $owner->id,
                ],
            );

            // PermissionCatalogSeeder already inserted the catalog row under this slug; this is a
            // no-op there and a safety net when only this seeder runs.
            $anakUsaha = AnakUsaha::updateOrCreate(['slug' => $slug], ['name' => $entry['name']]);

            AnakUsahaProfile::updateOrCreate(
                ['anak_usaha_id' => $anakUsaha->id],
                [
                    'logo_media_id' => $logoMedia->id,
                    'background_color' => $entry['background_color'],
                    'description' => $entry['description'],
                    'kind' => $entry['kind'],
                    'links' => $entry['links'],
                    'sort_order' => $index,
                    'is_active' => true,
                ],
            );
        }
    }
}
