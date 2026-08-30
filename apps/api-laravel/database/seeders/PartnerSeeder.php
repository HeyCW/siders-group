<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Media;
use App\Models\Partner;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/**
 * Seeds the real partner logos dropped directly into
 * storage/app/public/media/2026/08/partners (not uploaded through the app, so there are no
 * Media rows for them yet) as Partner + Media rows. Safe to re-run: keyed by partner name.
 */
class PartnerSeeder extends Seeder
{
    private const DISK = 'public';

    private const LOGO_DIR = 'media/2026/08/partners';

    /** Filename => display name, in the order they should appear. */
    private const PARTNERS = [
        'aqua.png' => 'Aqua',
        'Binus.PNG' => 'Binus',
        'BRI.png' => 'BRI',
        'CiputraWorldSurabaya.webp' => 'Ciputra World Surabaya',
        'Erha.PNG' => 'Erha',
        'FamilyMart.png' => 'FamilyMart',
        'Kidzoona.png' => 'Kidzoona',
        'Nestle.PNG' => 'Nestlé',
        'Payakumbuah.png' => 'Payakumbuah',
        'PCM.PNG' => 'PCM',
        'PM.webp' => 'PM',
        'PocariSweat.PNG' => 'Pocari Sweat',
        'Popmart.PNG' => 'Popmart',
        'PTC.PNG' => 'PTC',
        'PUBG.PNG' => 'PUBG',
        'Scarlett.JPG' => 'Scarlett',
        'Shopee.png' => 'Shopee',
        'Sunsilk.PNG' => 'Sunsilk',
        'TransSnowWorld.webp' => 'Trans Snow World',
    ];

    public function run(): void
    {
        $owner = User::orderBy('created_at')->first();

        if ($owner === null) {
            return; // Nothing to attribute the logo uploads to yet.
        }

        foreach (self::PARTNERS as $filename => $name) {
            $path = self::LOGO_DIR.'/'.$filename;

            if (Partner::where('name', $name)->exists() || ! Storage::disk(self::DISK)->exists($path)) {
                continue;
            }

            $logoMedia = Media::firstOrCreate(
                ['storage_path' => $path],
                [
                    'mime' => Storage::disk(self::DISK)->mimeType($path),
                    'size_bytes' => Storage::disk(self::DISK)->size($path),
                    'original_filename' => $filename,
                    'uploaded_by' => $owner->id,
                ],
            );

            Partner::create([
                'name' => $name,
                'logo_media_id' => $logoMedia->id,
                'website_url' => null,
                'sort_order' => (int) (Partner::max('sort_order') ?? -1) + 1,
                'is_active' => true,
            ]);
        }
    }
}
