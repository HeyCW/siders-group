<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Comment;
use App\Services\EngagementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class EngagementController extends Controller
{
    public function __construct(private readonly EngagementService $engagementService) {}

    public function recordView(Request $request, string $id): JsonResponse
    {
        $article = $this->engagementService->findVisibleOrFail($id);
        $this->engagementService->recordView($article, $request->ip());

        return response()->json(['data' => null]);
    }

    /** Public — likedByReader is false for an anonymous caller, never an error. */
    public function summary(string $id): JsonResponse
    {
        $article = $this->engagementService->findVisibleOrFail($id);
        $summary = $this->engagementService->summary($article, Auth::guard('reader')->user());

        return response()->json(['data' => $summary]);
    }

    public function comments(Request $request, string $id): JsonResponse
    {
        $article = $this->engagementService->findVisibleOrFail($id);
        $limit = min((int) $request->query('limit', 10), 50);
        $offset = max((int) $request->query('offset', 0), 0);

        $comments = $this->engagementService->listComments($article, $limit, $offset);

        return response()->json(['data' => $comments->map(fn (Comment $c) => $this->commentShape($c))]);
    }

    public function like(Request $request, string $id): JsonResponse
    {
        $article = $this->engagementService->findVisibleOrFail($id);
        $result = $this->engagementService->toggleLike($article, $request->user('reader'));

        return response()->json(['data' => $result]);
    }

    public function createComment(Request $request, string $id): JsonResponse
    {
        $article = $this->engagementService->findVisibleOrFail($id);
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);

        $comment = $this->engagementService->createComment($article, $request->user('reader'), $data['body']);
        $comment->setRelation('reader', $request->user('reader'));

        return response()->json(['data' => $this->commentShape($comment)], 201);
    }

    /**
     * Matches packages/contracts/src/engagement.ts's commentResponseSchema — never the reader's
     * email or id, only what they agreed to be named on.
     */
    private function commentShape(Comment $comment): array
    {
        return [
            'id' => $comment->id,
            'body' => $comment->body,
            'authorName' => $comment->reader->name,
            'authorAvatarUrl' => $comment->reader->avatar_url,
            'createdAt' => $comment->created_at->toIso8601String(),
        ];
    }
}
