<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MediaFileController extends Controller
{
    /**
     * Public static file serving with `nosniff` forced (matches the Node app's stance: the
     * browser must render as the sniffed/validated MIME, never guess). Symfony's
     * StreamedResponse (what Storage::response() actually returns for the local driver) handles
     * Range requests on its own, so stored video still supports seeking.
     */
    public function show(string $path): StreamedResponse
    {
        abort_unless(Storage::disk('media')->exists($path), 404);

        return Storage::disk('media')->response($path, null, [
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
