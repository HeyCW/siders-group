<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Article;
use App\Services\HyperlocalSpotlightService;
use App\Support\ArticlePresenter;
use Illuminate\Http\JsonResponse;

/**
 * Read-only on both sides — there is no write endpoint here. The spotlight is set only through
 * ArticleController's store/update (isHyperlocalSpotlight), never through a dedicated write
 * route (specs/hyperlocal-spotlight/spec.md - "No separate write surface exists").
 */
class HyperlocalSpotlightController extends Controller
{
    public function __construct(private readonly HyperlocalSpotlightService $spotlightService) {}

    /** Matches packages/contracts/src/hyperlocalSpotlight.ts's hyperlocalSpotlightResponseSchema. */
    public function adminShow(): JsonResponse
    {
        $resolved = $this->spotlightService->resolveAdmin();

        return response()->json(['data' => [
            'editorPick' => $resolved['editorPick'] === null ? null : [
                'article' => $this->summary($resolved['editorPick']),
                'status' => $resolved['editorPick']->status,
                'isPubliclyVisible' => $resolved['editorPickVisible'],
            ],
            'resolved' => $resolved['resolved'] === null ? null : $this->summary($resolved['resolved']),
            'resolvedIsEditorPick' => $resolved['resolvedIsEditorPick'],
        ]]);
    }

    /** Matches packages/contracts/src/hyperlocalSpotlight.ts's publicHyperlocalSpotlightSchema. */
    public function publicShow(): JsonResponse
    {
        $resolved = $this->spotlightService->resolvePublic();

        return response()->json(['data' => [
            'article' => $resolved['article'] === null ? null : ArticlePresenter::public($resolved['article']),
            'isEditorPick' => $resolved['isEditorPick'],
        ]]);
    }

    /** The bare {id, title, slug} shape shared by the admin response's editorPick and resolved
     *  fields — matches homeCurationArticleSummarySchema, reused rather than declaring a new one. */
    private function summary(Article $article): array
    {
        return ['id' => $article->id, 'title' => $article->title, 'slug' => $article->slug];
    }
}
