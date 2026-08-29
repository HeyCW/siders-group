<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommentReport extends Model
{
    use HasUuidPrimaryKey;

    const UPDATED_AT = null;

    protected $fillable = ['comment_id', 'reporter_id', 'reason', 'note', 'resolved_at', 'resolved_by'];

    protected function casts(): array
    {
        return [
            'resolved_at' => 'datetime',
            // is_open is a MySQL STORED generated column (`resolved_at is null`) — read-only,
            // never written by the app.
            'is_open' => 'boolean',
        ];
    }

    public function comment(): BelongsTo
    {
        return $this->belongsTo(Comment::class);
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(Reader::class, 'reporter_id');
    }
}
