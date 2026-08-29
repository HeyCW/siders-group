<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Article;
use App\Services\HomeCurationService;
use App\Services\HomeFeedService;
use App\Support\ArticlePresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CurationController extends Controller
{
    public function __construct(
        private readonly HomeCurationService $homeCurationService,
        private readonly HomeFeedService $homeFeedService,
    ) {}

    public function adminIndex(): JsonResponse
    {
        $entries = $this->homeCurationService->listWithVisibility();

        return response()->json(['data' => $entries->map(fn ($e) => [
            'articleId' => $e['article']?->id,
            'title' => $e['article']?->title,
            'position' => $e['position'],
            'isVisible' => $e['isVisible'],
        ])]);
    }

    public function replace(Request $request): JsonResponse
    {
        $request->validate(['articleIds' => ['required', 'array', 'max:10']]);
        $this->homeCurationService->replace($request->input('articleIds'));

        return response()->json(['data' => null]);
    }

    public function publicFeed(Request $request): JsonResponse
    {
        $limit = min((int) $request->query('limit', 10), 20);
        $articles = $this->homeFeedService->compose($limit);

        return response()->json(['data' => $articles->map(fn (Article $a) => ArticlePresenter::public($a))]);
    }
}
