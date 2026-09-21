<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The hyperlocal spotlight: one permanent row (`slot = 'default'`, seeded by its migration and
 * never inserted or deleted again), holding at most one editor-picked article
 * (openspec/changes/add-hyperlocal-spotlight). `article_id` is nullable — `NULL` is the ordinary
 * "no editor pick" state, not an exceptional one, and resolves to the most recently published
 * article at read time (see HyperlocalSpotlightService).
 */
class HyperlocalSpotlight extends Model
{
    use HasMillisecondTimestamps;

    protected $table = 'hyperlocal_spotlight';

    protected $primaryKey = 'slot';

    public $incrementing = false;

    protected $keyType = 'string';

    /** No `created_at` column — the row is seeded once by its migration, never created again. */
    const CREATED_AT = null;

    protected $fillable = ['article_id'];

    public function article(): BelongsTo
    {
        return $this->belongsTo(Article::class);
    }
}
