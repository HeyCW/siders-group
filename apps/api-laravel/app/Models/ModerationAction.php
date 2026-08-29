<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Polymorphic target (comment|reader), deliberately with no FK — the audit trail survives even
 * if the target row is later deleted. `Relation::morphMap` (registered in AppServiceProvider)
 * maps the stored `target_type` string to a model class, matching the DB enum values exactly.
 */
class ModerationAction extends Model
{
    use HasUuidPrimaryKey;

    const UPDATED_AT = null;

    protected $fillable = ['actor_id', 'target_type', 'target_id', 'action', 'reason'];

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function target(): MorphTo
    {
        return $this->morphTo(type: 'target_type', id: 'target_id');
    }
}
