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
        $filter = $request->query('filter', 'all');
        $result = $this->moderationService->commentQueue($filter, $request->query('cursor'));

        return response()->json([
            'data' => $result['items']->map(fn (Comment $c) => [
                'id' => $c->id,
                'body' => $c->body,
                'status' => $c->status,
                'articleId' => $c->article_id,
                'articleTitle' => $c->article?->title,
                'readerName' => $c->reader?->name,
                'createdAt' => $c->created_at->toIso8601String(),
            ]),
            'meta' => ['nextCursor' => $result['nextCursor']],
        ]);
    }

    public function moderateComment(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:visible,removed'], 'reason' => ['nullable', 'string']]);
        $comment = $this->moderationService->moderateComment(Comment::findOrFail($id), $data['status'], $request->user('staff'), $data['reason'] ?? null);

        return response()->json(['data' => ['id' => $comment->id, 'status' => $comment->status]]);
    }

    public function dismissReports(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string']]);
        $this->moderationService->dismissReports(Comment::findOrFail($id), $request->user('staff'), $data['reason'] ?? null);

        return response()->json(['data' => null]);
    }

    public function readerQueue(Request $request): JsonResponse
    {
        $readers = $this->moderationService->readerQueue(
            $request->query('search'),
            $request->query('status'),
            (int) $request->query('page', 1),
            min((int) $request->query('perPage', 20), 50),
        );

        return response()->json([
            'data' => collect($readers->items())->map(fn (Reader $r) => [
                'id' => $r->id,
                'name' => $r->name,
                'email' => $r->email,
                'status' => $r->status,
                'mutedUntil' => $r->muted_until?->toIso8601String(),
            ]),
            'meta' => ['total' => $readers->total(), 'page' => $readers->currentPage()],
        ]);
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

        return response()->json(['data' => [
            'id' => $reader->id,
            'status' => $reader->status,
            'mutedUntil' => $reader->muted_until?->toIso8601String(),
        ]]);
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

        return response()->json(['data' => ['id' => $report->id]], 201);
    }
}
