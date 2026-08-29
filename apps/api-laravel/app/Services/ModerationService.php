<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\AlreadyReportedException;
use App\Exceptions\NoOpenReportsException;
use App\Models\Comment;
use App\Models\CommentReport;
use App\Models\ModerationAction;
use App\Models\Reader;
use App\Models\User;
use App\Support\PlanReaderModeration;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ModerationService
{
    private const KEYSET_PAGE_SIZE = 20;

    /**
     * Keyset-paginated comment queue (createdAt, id) tuple comparison — MySQL supports row-value
     * comparison directly, so this stays a hand-written `where` rather than a library helper
     * (Laravel has no built-in keyset paginator).
     *
     * @return array{items: Collection<int, Comment>, nextCursor: ?string}
     */
    public function commentQueue(string $filter, ?string $cursor): array
    {
        $query = Comment::with(['article', 'reader', 'reports'])->orderByDesc('created_at')->orderByDesc('id');

        match ($filter) {
            'visible' => $query->where('status', 'visible'),
            'removed' => $query->where('status', 'removed'),
            'reported' => $query->whereHas('reports', fn ($q) => $q->where('is_open', true)),
            default => null, // 'all'
        };

        if ($cursor !== null) {
            [$createdAt, $id] = $this->decodeCursor($cursor);
            $query->where(fn ($q) => $q
                ->where('created_at', '<', $createdAt)
                ->orWhere(fn ($q2) => $q2->where('created_at', $createdAt)->where('id', '<', $id)));
        }

        $items = $query->limit(self::KEYSET_PAGE_SIZE + 1)->get();
        $hasMore = $items->count() > self::KEYSET_PAGE_SIZE;
        $items = $items->take(self::KEYSET_PAGE_SIZE);

        $nextCursor = $hasMore && $items->isNotEmpty()
            ? $this->encodeCursor($items->last()->created_at, $items->last()->id)
            : null;

        return ['items' => $items, 'nextCursor' => $nextCursor];
    }

    /**
     * Removing a comment resolves all its open reports in the same transaction; restoring a
     * comment never reopens them (no code path clears resolved_at once set).
     */
    public function moderateComment(Comment $comment, string $status, User $actor, ?string $reason): Comment
    {
        if ($status === $comment->status) {
            return $comment;
        }

        DB::transaction(function () use ($comment, $status, $actor, $reason) {
            $comment->update(['status' => $status]);

            if ($status === 'removed') {
                CommentReport::where('comment_id', $comment->id)
                    ->where('is_open', true)
                    ->update(['resolved_at' => now(), 'resolved_by' => $actor->id]);
            }

            ModerationAction::create([
                'actor_id' => $actor->id,
                'target_type' => 'comment',
                'target_id' => $comment->id,
                'action' => $status === 'removed' ? 'comment_removed' : 'comment_restored',
                'reason' => $reason,
            ]);
        });

        return $comment->fresh(['article', 'reader', 'reports']);
    }

    public function dismissReports(Comment $comment, User $actor, ?string $reason): Comment
    {
        DB::transaction(function () use ($comment, $actor, $reason) {
            $resolved = CommentReport::where('comment_id', $comment->id)
                ->where('is_open', true)
                ->update(['resolved_at' => now(), 'resolved_by' => $actor->id]);

            if ($resolved === 0) {
                throw new NoOpenReportsException();
            }

            ModerationAction::create([
                'actor_id' => $actor->id,
                'target_type' => 'comment',
                'target_id' => $comment->id,
                'action' => 'comment_reports_dismissed',
                'reason' => $reason,
            ]);
        });

        return $comment->fresh(['article', 'reader', 'reports']);
    }

    public function reportComment(Comment $comment, Reader $reporter, string $reason, ?string $note): CommentReport
    {
        if (CommentReport::where('comment_id', $comment->id)->where('reporter_id', $reporter->id)->exists()) {
            throw new AlreadyReportedException();
        }

        return CommentReport::create([
            'comment_id' => $comment->id,
            'reporter_id' => $reporter->id,
            'reason' => $reason,
            'note' => $note,
        ]);
    }

    /**
     * Offset-paginated per readerQueueQuerySchema — unlike the comment queue, a reader missing
     * from one page of a search is just re-found by scrolling/re-searching, no keyset needed.
     *
     * @return Collection<int, Reader>
     */
    public function readerQueue(?string $search, ?string $statusFilter, int $limit, int $offset): Collection
    {
        return Reader::query()
            ->withCount('comments')
            ->when($search, fn ($q, $s) => $q->where(fn ($q2) => $q2
                ->where('name', 'like', '%'.addcslashes($s, '%_\\').'%')
                ->orWhere('email', 'like', '%'.addcslashes($s, '%_\\').'%')))
            ->when($statusFilter && $statusFilter !== 'all', fn ($q) => $q->where('status', $statusFilter))
            ->orderBy('name')
            ->skip($offset)
            ->take($limit)
            ->get();
    }

    /**
     * Independent status/mutedUntil transitions in one request — only the transitions that
     * actually change something are applied and logged (see PlanReaderModeration).
     */
    public function moderateReader(
        Reader $reader,
        User $actor,
        bool $touchesStatus,
        ?string $status,
        bool $touchesMutedUntil,
        ?string $mutedUntil,
        ?string $reason,
    ): Reader {
        $actions = PlanReaderModeration::plan($reader, $touchesStatus, $status, $touchesMutedUntil, $mutedUntil);

        if ($actions === []) {
            return $reader->loadCount('comments');
        }

        DB::transaction(function () use ($reader, $actor, $actions, $reason) {
            foreach ($actions as $planned) {
                $reader->update($planned['field'] === 'status' ? ['status' => $planned['value']] : ['muted_until' => $planned['value']]);

                ModerationAction::create([
                    'actor_id' => $actor->id,
                    'target_type' => 'reader',
                    'target_id' => $reader->id,
                    'action' => $planned['action'],
                    'reason' => $reason,
                ]);
            }
        });

        return $reader->fresh()->loadCount('comments');
    }

    private function encodeCursor(\DateTimeInterface $createdAt, string $id): string
    {
        return base64_encode(json_encode(['createdAt' => $createdAt->format('Y-m-d H:i:s.u'), 'id' => $id]));
    }

    /** @return array{0: string, 1: string} */
    private function decodeCursor(string $cursor): array
    {
        $decoded = json_decode(base64_decode($cursor), true);

        return [$decoded['createdAt'], $decoded['id']];
    }
}
