<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Shared PK/FK with `articles` — article_id IS the row identity, no surrogate id. */
class HomeCuration extends Model
{
    /** Eloquent's naive pluralization would guess `home_curations`; the real table is singular. */
    protected $table = 'home_curation';

    protected $primaryKey = 'article_id';

    public $incrementing = false;

    protected $keyType = 'string';

    const UPDATED_AT = null;

    protected $fillable = ['article_id', 'position'];

    public function article(): BelongsTo
    {
        return $this->belongsTo(Article::class);
    }
}
