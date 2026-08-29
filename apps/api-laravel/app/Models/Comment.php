<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Comment extends Model
{
    use HasUuidPrimaryKey;

    const UPDATED_AT = null;

    protected $fillable = ['article_id', 'reader_id', 'body', 'status'];

    public function reader(): BelongsTo
    {
        return $this->belongsTo(Reader::class);
    }

    public function article(): BelongsTo
    {
        return $this->belongsTo(Article::class);
    }

    public function reports(): HasMany
    {
        return $this->hasMany(CommentReport::class);
    }

    public function isVisible(): bool
    {
        return $this->status === 'visible';
    }
}
