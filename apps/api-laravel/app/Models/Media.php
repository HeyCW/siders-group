<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;

class Media extends Model
{
    use HasUuidPrimaryKey;

    /** No `updated_at` column on this table. */
    const UPDATED_AT = null;

    protected $fillable = [
        'storage_path',
        'mime',
        'size_bytes',
        'original_filename',
        'alt',
        'caption',
        'uploaded_by',
    ];

    public function isImage(): bool
    {
        return str_starts_with($this->mime, 'image/');
    }

    public function isVideo(): bool
    {
        return str_starts_with($this->mime, 'video/');
    }
}
