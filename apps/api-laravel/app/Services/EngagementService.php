<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Article;
use App\Models\Comment;
use App\Models\Like;
use App\Models\Reader;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class EngagementService
{
    /**
     * Every engagement action first checks the article exists AND is publicly visible — a
     * missing OR draft article both 404, never 403, so a caller can't distinguish "doesn't
     * exist" from "exists but not visible yet" (never leak draft existence).
     */
    public function findVisibleOrFail(string $articleId): Article
    {
        return Article::publiclyVisible()->where('id', $articleId)->firstOrFail();
    }

    /**
     * Anonymous visitor identified by an HMAC of their IP (never the raw IP) keyed on APP_KEY.
     * `insertOrIgnore` into the dedup table decides "is this the first time today" from its
     * affected-row count, then the daily counter is incremented in the same spirit as the
     * dedup check (both views and unique_views), via a raw upsert since Laravel's `upsert()`
     * helper copies values rather than incrementing them.
     */
    public function recordView(Article $article, string $ip): void
    {
        $visitorHash = hash_hmac('sha256', $ip, (string) config('app.key'));
        $date = now()->toDateString();

        $isNewVisitor = DB::table('view_seen')->insertOrIgnore([
            'article_id' => $article->id,
            'visitor_hash' => $visitorHash,
            'date' => $date,
        ]) > 0;

        DB::statement(
            'insert into article_views_daily (article_id, date, views, unique_views)
             values (?, ?, 1, ?)
             on duplicate key update views = views + 1, unique_views = unique_views + values(unique_views)',
            [$article->id, $date, $isNewVisitor ? 1 : 0],
        );
    }

    /**
     * Matches packages/contracts/src/engagement.ts's articleEngagementSchema field-for-field.
     *
     * @return array{viewCount: int, likeCount: int, commentCount: int, likedByReader: bool}
     */
    public function summary(Article $article, ?Reader $reader): array
    {
        $viewCount = (int) DB::table('article_views_daily')->where('article_id', $article->id)->sum('views');
        $likeCount = Like::where('article_id', $article->id)->count();
        $commentCount = Comment::where('article_id', $article->id)->where('status', 'visible')->count();

        $likedByReader = $reader !== null
            && Like::where('article_id', $article->id)->where('reader_id', $reader->id)->exists();

        return [
            'viewCount' => $viewCount,
            'likeCount' => $likeCount,
            'commentCount' => $commentCount,
            'likedByReader' => $likedByReader,
        ];
    }

    /**
     * Offset-paginated, matching packages/contracts/src/engagement.ts's commentListQuerySchema —
     * the listing returns a bare array, so a full page (== $limit) is itself the client's signal
     * that more may exist, not a separate total count.
     *
     * @return Collection<int, Comment>
     */
    public function listComments(Article $article, int $limit, int $offset): Collection
    {
        return Comment::with('reader')
            ->where('article_id', $article->id)
            ->where('status', 'visible')
            ->orderByDesc('created_at')
            ->skip($offset)
            ->take($limit)
            ->get();
    }

    /**
     * Toggle: delete-if-exists else insert. A race on the unique (reader_id, article_id) index
     * is treated as success (the losing insert's constraint violation just means someone else's
     * concurrent request already created the like), never surfaced as an error.
     *
     * @return array{liked: bool, likeCount: int}
     */
    public function toggleLike(Article $article, Reader $reader): array
    {
        $deleted = Like::where('article_id', $article->id)->where('reader_id', $reader->id)->delete();

        $liked = $deleted === 0;

        if ($liked) {
            try {
                Like::create(['article_id' => $article->id, 'reader_id' => $reader->id]);
            } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                // Someone else's concurrent like already exists — treat as success, not an error.
            }
        }

        return ['liked' => $liked, 'likeCount' => Like::where('article_id', $article->id)->count()];
    }

    public function createComment(Article $article, Reader $reader, string $body): Comment
    {
        return Comment::create([
            'article_id' => $article->id,
            'reader_id' => $reader->id,
            'body' => $body,
            'status' => 'visible',
        ]);
    }
}
