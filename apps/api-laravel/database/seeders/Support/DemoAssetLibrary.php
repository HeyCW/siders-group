<?php

declare(strict_types=1);

namespace Database\Seeders\Support;

use App\Models\Media;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use Throwable;

/**
 * Real, freely-licensed demo assets — the replacement for the generated SVG / dummy-MP4
 * placeholders DemoContentSeeder used to write. Each entry is fetched once from its source and
 * cached on the media disk under the same `media/{Y}/{m}/{context}/` layout a real admin upload
 * lands in (MediaService::store), so a second seed run is fully offline.
 *
 * The cache is keyed by filename, so dropping your own file at that path (e.g. a real Instagram
 * reel export over `guide-pick-video-0.mp4`) makes the seeder use it and skip the download — that
 * is the intended way to swap in Siders' own footage later.
 *
 * `credit` is stored as the Media caption so the attribution these CC licenses require travels
 * with the row instead of living only in this file.
 */
final class DemoAssetLibrary
{
    private const DISK = 'public';

    private const DIR = 'media/2026/08';

    /**
     * Wikimedia's UA policy answers a bare tool name with 429; it wants a contact URL, and it
     * wants the requests spaced out (see self::THROTTLE_MICROSECONDS).
     */
    private const USER_AGENT = 'siders-group-seeder/1.0 (https://github.com/HeyCW/siders-group; local dev demo content)';

    private const THROTTLE_MICROSECONDS = 400_000;

    private const MAX_ATTEMPTS = 3;

    /**
     * key => [context, filename, url, alt, credit]
     *
     * Photos: Wikimedia Commons (CC BY / CC BY-SA / CC0), Jakarta and Surabaya subjects so the
     * demo looks like this product's actual beat. Videos: test-videos.co.uk's H.264 cuts of the
     * Blender open movies and the Jellyfish clip (CC BY 3.0) — real playable MP4s, unlike the old
     * 200-byte blob that only *looked* like one to a mime sniffer.
     */
    private const ASSETS = [
        'featured-1' => ['articles', 'jakarta-skyline.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/View_of_Jakarta_skyline_seen_from_Gambir_Station.jpg/1280px-View_of_Jakarta_skyline_seen_from_Gambir_Station.jpg', 'Skyline Jakarta dilihat dari Stasiun Gambir', 'Foto: Sam Hidayat / Wikimedia Commons (CC BY-SA 4.0)'],
        'featured-2' => ['articles', 'surabaya-city-hall.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Surabaya_City_Hall_by_Yamin_Nathaniel.jpg/1920px-Surabaya_City_Hall_by_Yamin_Nathaniel.jpg', 'Balai Kota Surabaya', 'Foto: Yamin Nathaniel / Wikimedia Commons (CC BY-SA 2.0)'],
        'featured-3' => ['articles', 'suramadu-bridge.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Madura_strait_and_Suramadu_2.jpg/1920px-Madura_strait_and_Suramadu_2.jpg', 'Jembatan Suramadu di Selat Madura', 'Foto: Consigliere Ivan / Wikimedia Commons (CC BY 2.0)'],

        'article-body-0' => ['articles', 'jakarta-kota-tua.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Jakarta_Indonesia_Business-in-Kota-Jakarta-01.jpg/1920px-Jakarta_Indonesia_Business-in-Kota-Jakarta-01.jpg', 'Aktivitas usaha di kawasan Kota Tua Jakarta', 'Foto: CEphoto, Uwe Aranas / Wikimedia Commons (CC BY-SA 3.0)'],
        'article-body-1' => ['articles', 'street-food.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Street_food_in_Garut_Regency.jpg/1920px-Street_food_in_Garut_Regency.jpg', 'Pedagang street food di Indonesia', 'Foto: Jauza01 / Wikimedia Commons (CC BY-SA 4.0)'],
        'article-body-2' => ['articles', 'jakarta-traffic-warden.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Traffic_warden_in_Jakarta_01.jpg/1920px-Traffic_warden_in_Jakarta_01.jpg', 'Petugas pengatur lalu lintas di Jakarta', 'Foto: Jeromi Mikhael / Wikimedia Commons (CC0)'],
        'article-body-3' => ['articles', 'surabaya-bus-terminal.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Peron_bus_kota_Surabaya%2C_31_Maret_2022.jpg/1920px-Peron_bus_kota_Surabaya%2C_31_Maret_2022.jpg', 'Peron bus kota Surabaya', 'Foto: Mujiono Maruf / Wikimedia Commons (CC BY-SA 4.0)'],
        'article-body-4' => ['articles', 'jakarta-panorama.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Jakarta_Panorama.jpg/1920px-Jakarta_Panorama.jpg', 'Panorama kota Jakarta', 'Foto: Gunawan Kartapranata / Wikimedia Commons (CC BY-SA 3.0)'],

        'guide-pick-photo-0' => ['guide-picks', 'monas.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Monumen_Nasional%2C_Jakarta%2C_Indonesia.jpg/1920px-Monumen_Nasional%2C_Jakarta%2C_Indonesia.jpg', 'Monumen Nasional (Monas), Jakarta', 'Foto: Ramayoni / Wikimedia Commons (CC BY-SA 4.0)'],
        'guide-pick-photo-1' => ['guide-picks', 'tugu-pahlawan.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Tugu_Pahlawan_Surabaya_Jawa_Timur.jpg/1920px-Tugu_Pahlawan_Surabaya_Jawa_Timur.jpg', 'Tugu Pahlawan, Surabaya', 'Foto: Eny Santiati / Wikimedia Commons (CC BY-SA 4.0)'],
        'guide-pick-photo-2' => ['guide-picks', 'kota-tua-hawkers.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Jakarta_Indonesia_Hawkers-in-Kota-Jakarta-02.jpg/1920px-Jakarta_Indonesia_Hawkers-in-Kota-Jakarta-02.jpg', 'Pedagang di Kota Tua Jakarta', 'Foto: CEphoto, Uwe Aranas / Wikimedia Commons (CC BY-SA 3.0)'],

        'guide-pick-video-0' => ['guide-picks', 'guide-pick-video-0.mp4', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4', 'Klip demo Guide Pick Jakarta', 'Video: Blender Foundation — Big Buck Bunny (CC BY 3.0)'],
        'guide-pick-video-1' => ['guide-picks', 'guide-pick-video-1.mp4', 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4', 'Klip demo Guide Pick Surabaya', 'Video: test-videos.co.uk — Jellyfish (CC BY 3.0)'],
        'guide-pick-video-2' => ['guide-picks', 'guide-pick-video-2.mp4', 'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4', 'Klip demo Guide Pick Kota Tua', 'Video: Blender Foundation — Sintel (CC BY 3.0)'],
    ];

    /** Keys whose fetch already failed this run, so one offline seed doesn't retry every entry. */
    private array $unavailable = [];

    /**
     * The Media row for an asset, downloading it on first use. Returns null when the file is
     * neither cached nor reachable — callers then seed *less* demo content rather than fall back
     * to fake bytes.
     */
    public function media(string $key, User $owner): ?Media
    {
        if (! isset(self::ASSETS[$key])) {
            throw new InvalidArgumentException("Unknown demo asset [{$key}].");
        }

        if (in_array($key, $this->unavailable, true)) {
            return null;
        }

        [$context, $filename, $url, $alt, $credit] = self::ASSETS[$key];
        $path = self::DIR."/{$context}/{$filename}";

        if (! Storage::disk(self::DISK)->exists($path) && ! $this->download($url, $path)) {
            $this->unavailable[] = $key;

            return null;
        }

        return Media::updateOrCreate(
            ['storage_path' => $path],
            [
                'mime' => Storage::disk(self::DISK)->mimeType($path),
                'size_bytes' => Storage::disk(self::DISK)->size($path),
                'original_filename' => $filename,
                'alt' => $alt,
                'caption' => $credit,
                'uploaded_by' => $owner->id,
            ],
        );
    }

    private function download(string $url, string $path): bool
    {
        for ($attempt = 1; $attempt <= self::MAX_ATTEMPTS; $attempt++) {
            usleep(self::THROTTLE_MICROSECONDS * $attempt);

            try {
                $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                    ->timeout(60)
                    ->get($url);
            } catch (Throwable) {
                return false; // Offline/DNS — retrying the same host won't help.
            }

            if ($response->successful() && $response->body() !== '') {
                Storage::disk(self::DISK)->put($path, $response->body());

                return true;
            }

            // 429/5xx are worth backing off for; a 404 means the manifest URL itself is stale.
            if ($response->status() < 429) {
                return false;
            }
        }

        return false;
    }
}
