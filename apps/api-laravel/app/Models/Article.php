<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Carbon;

class Article extends Model
{
    use HasMillisecondTimestamps;
    use HasUuidPrimaryKey;

    protected $fillable = [
        'title',
        'slug',
        'body_json',
        'body_html',
        'excerpt',
        'status',
        'author_id',
        'featured_media_id',
        'anak_usaha_id',
        'seo_title',
        'seo_description',
        'published_at',
    ];

    protected function casts(): array
    {
        return [
            'body_json' => 'array',
            'published_at' => 'datetime',
        ];
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function featuredMedia(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'featured_media_id');
    }

    public function anakUsaha(): BelongsTo
    {
        return $this->belongsTo(AnakUsaha::class);
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'article_categories');
    }

    /**
     * The single canonical definition of "publicly visible" — published (with a set
     * published_at), OR scheduled with a due published_at. Reused by public list/detail,
     * curation, engagement gating, and analytics; never re-derive this condition elsewhere.
     * A scheduled-but-due article counts as visible here even before the cron flips its status
     * (see ScheduledPublishService) — that flip is a latency optimization, not a correctness
     * dependency.
     */
    public function scopePubliclyVisible(Builder $query, ?Carbon $now = null): Builder
    {
        $now ??= now();

        return $query->where(function (Builder $q) use ($now) {
            $q->where(fn (Builder $q2) => $q2->where('status', 'published')->whereNotNull('published_at'))
                ->orWhere(fn (Builder $q2) => $q2->where('status', 'scheduled')->where('published_at', '<=', $now));
        });
    }

    /** Row-level twin of scopePubliclyVisible for an already-loaded model — keep both in sync by hand. */
    public function isCurrentlyVisible(): bool
    {
        if ($this->status === 'published' && $this->published_at !== null) {
            return true;
        }

        return $this->status === 'scheduled'
            && $this->published_at !== null
            && $this->published_at->lessThanOrEqualTo(now());
    }
}
