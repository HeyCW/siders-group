<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Partner extends Model
{
    use HasMillisecondTimestamps;
    use HasUuidPrimaryKey;

    protected $fillable = ['name', 'logo_media_id', 'website_url', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function logoMedia(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'logo_media_id');
    }
}
