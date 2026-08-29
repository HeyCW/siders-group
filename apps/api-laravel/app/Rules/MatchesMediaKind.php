<?php

declare(strict_types=1);

namespace App\Rules;

use App\Models\Media;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * `MatchesMediaKind:image` / `MatchesMediaKind:video` — for fields that reference an *existing*
 * Media row by id (guide picks' photo/video), cross-checks the referenced row is actually that
 * kind, not just any media id (a photo field pointed at an uploaded mp4 would otherwise pass).
 */
class MatchesMediaKind implements ValidationRule
{
    public function __construct(private readonly string $expectedKind) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $media = Media::find($value);

        if ($media === null) {
            return; // an `exists:media,id` rule alongside this one reports the missing-reference case
        }

        $matches = $this->expectedKind === 'image' ? $media->isImage() : $media->isVideo();

        if (! $matches) {
            $fail("The :attribute must reference a {$this->expectedKind} media file.");
        }
    }
}
