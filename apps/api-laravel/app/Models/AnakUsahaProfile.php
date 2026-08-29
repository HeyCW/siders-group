<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Shared PK/FK with `anak_usaha` — no surrogate id, and deliberately NOT using
 * HasUuidPrimaryKey (that trait would generate a fresh UUID; this key must instead be explicitly
 * set to an existing AnakUsaha's id, since a profile is 1:1 with one).
 */
class AnakUsahaProfile extends Model
{
    use HasMillisecondTimestamps;

    /** Eloquent's naive pluralization would guess `anak_usaha_profiles`; the real table is singular. */
    protected $table = 'anak_usaha_profile';

    protected $primaryKey = 'anak_usaha_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'anak_usaha_id',
        'logo_media_id',
        'background_color',
        'description',
        'kind',
        'links',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'links' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function anakUsaha(): BelongsTo
    {
        return $this->belongsTo(AnakUsaha::class);
    }

    public function logoMedia(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'logo_media_id');
    }
}
