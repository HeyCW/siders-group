<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GuidePick extends Model
{
    use HasMillisecondTimestamps;
    use HasUuidPrimaryKey;

    protected $fillable = ['city', 'place', 'description', 'photo_media_id', 'video_media_id', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function photoMedia(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'photo_media_id');
    }

    public function videoMedia(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'video_media_id');
    }
}
