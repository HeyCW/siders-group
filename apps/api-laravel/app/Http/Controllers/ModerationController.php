<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Comment;
use App\Models\Reader;
use App\Services\ModerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ModerationController extends Controller
{
    public function __construct(private readonly ModerationService $moderationService) {}

    public function commentQueue(Request $request): JsonResponse
    {
        $status = $request->query('status', 'all');
        $result = $this->moderationService->commentQueue($status, $request->query('cursor'));

        return response()->json(['data' => [
            'items' => $result['items']->map(fn (Comment $c) => $this->commentRowShape($c))->values(),
            'nextCursor' => $result['nextCursor'],
        ]]);
    }

    public function moderateComment(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:visible,removed'], 'reason' => ['nullable', 'string']]);
        $comment = $this->moderationService->moderateComment(Comment::findOrFail($id), $data['status'], $request->user('staff'), $data['reason'] ?? null);

        return response()->json(['data' => $this->commentRowShape($comment)]);
    }

    public function dismissReports(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string']]);
        $comment = $this->moderationService->dismissReports(Comment::findOrFail($id), $request->user('staff'), $data['reason'] ?? null);

        return response()->json(['data' => $this->commentRowShape($comment)]);
    }

    public function readerQueue(Request $request): JsonResponse
    {
        $readers = $this->moderationService->readerQueue(
            $request->query('search'),
            $request->query('status'),
            min((int) $request->query('limit', 20), 100),
            max((int) $request->query('offset', 0), 0),
        );

        return response()->json(['data' => $readers->map(fn (Reader $r) => $this->readerRowShape($r))->values()]);
    }

    public function moderateReader(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'status' => ['sometimes', 'in:active,banned'],
            'mutedUntil' => ['sometimes', 'nullable', 'date'],
            'reason' => ['nullable', 'string'],
        ]);

        if (! $request->has('status') && ! $request->has('mutedUntil')) {
            abort(422, 'At least one of status or mutedUntil is required.');
        }

        $reader = $this->moderationService->moderateReader(
            Reader::findOrFail($id),
            $request->user('staff'),
            $request->has('status'),
            $data['status'] ?? null,
            $request->has('mutedUntil'),
            $data['mutedUntil'] ?? null,
            $data['reason'] ?? null,
        );

        return response()->json(['data' => $this->readerRowShape($reader)]);
    }

    public function reportComment(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'in:spam,harassment,off_topic,other'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $report = $this->moderationService->reportComment(
            Comment::findOrFail($id),
            $request->user('reader'),
            $data['reason'],
            $data['note'] ?? null,
        );

        return response()->json(['data' => [
            'id' => $report->id,
            'commentId' => $report->comment_id,
            'reason' => $report->reason,
            'note' => $report->note,
            'createdAt' => $report->created_at->toIso8601String(),
        ]], 201);
    }

    /** Matches packages/contracts/src/moderation.ts's commentQueueRowSchema. */
    private function commentRowShape(Comment $comment): array
    {
        $openReports = $comment->reports->where('is_open', true);

        $shape = [
            'id' => $comment->id,
            'body' => $comment->body,
            'status' => $comment->status,
            'articleId' => $comment->article_id,
            'articleTitle' => $comment->article?->title,
            'articleSlug' => $comment->article?->slug,
            'authorName' => $comment->reader?->name,
            'createdAt' => $comment->created_at->toIso8601String(),
        ];

        // Present only when the comment carries at least one unresolved report — absence, not
        // zero, is how "no open reports" is represented.
        if ($openReports->isNotEmpty()) {
            $shape['openReportCount'] = $openReports->count();
            $shape['reportReasons'] = $openReports->pluck('reason')->unique()->values();
        }

        return $shape;
    }

    /** Matches packages/contracts/src/moderation.ts's readerQueueRowSchema. */
    private function readerRowShape(Reader $reader): array
    {
        return [
            'id' => $reader->id,
            'name' => $reader->name,
            'email' => $reader->email,
            'avatarUrl' => $reader->avatar_url,
            'status' => $reader->status,
            'mutedUntil' => $reader->muted_until?->toIso8601String(),
            'commentCount' => $reader->comments_count ?? $reader->comments()->count(),
            'createdAt' => $reader->created_at->toIso8601String(),
        ];
    }
}
