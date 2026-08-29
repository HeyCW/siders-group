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
        $page = (int) $request->query('page', 1);
        $perPage = min((int) $request->query('perPage', 20), 50);

        $comments = $this->engagementService->listComments($article, $page, $perPage);

        return response()->json([
            'data' => collect($comments->items())->map(fn (Comment $c) => [
                'id' => $c->id,
                'body' => $c->body,
                'readerName' => $c->reader->name,
                'createdAt' => $c->created_at->toIso8601String(),
            ]),
            'meta' => ['total' => $comments->total(), 'page' => $comments->currentPage(), 'perPage' => $comments->perPage()],
        ]);
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

        return response()->json(['data' => [
            'id' => $comment->id,
            'body' => $comment->body,
            'createdAt' => $comment->created_at->toIso8601String(),
        ]], 201);
    }
}
