<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Article\AutosaveArticleRequest;
use App\Http\Requests\Article\PublicArticleIndexRequest;
use App\Http\Requests\Article\ScheduleArticleRequest;
use App\Http\Requests\Article\StoreArticleRequest;
use App\Http\Requests\Article\UpdateArticleRequest;
use App\Models\Article;
use App\Services\ArticleService;
use App\Services\HyperlocalSpotlightService;
use App\Support\ArticlePresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ArticleController extends Controller
{
    public function __construct(
        private readonly ArticleService $articleService,
        private readonly HyperlocalSpotlightService $spotlightService,
    ) {}

    // --- Admin ---

    public function adminIndex(Request $request): JsonResponse
    {
        $articles = Article::with(['author', 'categories', 'anakUsaha', 'featuredMedia'])
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('created_at')
            ->paginate(max(1, min((int) $request->query('perPage', 20), 100)));

        // One lookup for the whole page, not one per article.
        $spotlightId = $this->spotlightService->getPickArticleId();

        return response()->json([
            'data' => collect($articles->items())->map(
                fn (Article $a) => ArticlePresenter::admin($a, $a->id === $spotlightId)
            ),
            'meta' => ['total' => $articles->total(), 'page' => $articles->currentPage(), 'limit' => $articles->perPage()],
        ]);
    }

    public function adminShow(string $id): JsonResponse
    {
        return response()->json(['data' => $this->presentAdmin(Article::findOrFail($id))]);
    }

    public function store(StoreArticleRequest $request): JsonResponse
    {
        $article = $this->articleService->create($request->validated(), $request->user('staff')->id);

        return response()->json(['data' => $this->presentAdmin($article)], 201);
    }

    public function update(UpdateArticleRequest $request, string $id): JsonResponse
    {
        $article = $this->articleService->update(Article::findOrFail($id), $request->validated());

        return response()->json(['data' => $this->presentAdmin($article)]);
    }

    public function autosave(AutosaveArticleRequest $request, string $id): JsonResponse
    {
        $article = $this->articleService->autosave(Article::findOrFail($id), $request->validated());

        return response()->json(['data' => $this->presentAdmin($article)]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->articleService->delete(Article::findOrFail($id));

        return response()->json(['data' => null]);
    }

    public function publish(string $id): JsonResponse
    {
        return response()->json(['data' => $this->presentAdmin($this->articleService->publish(Article::findOrFail($id)))]);
    }

    public function unpublish(string $id): JsonResponse
    {
        return response()->json(['data' => $this->presentAdmin($this->articleService->unpublish(Article::findOrFail($id)))]);
    }

    public function schedule(ScheduleArticleRequest $request, string $id): JsonResponse
    {
        $article = $this->articleService->schedule(Article::findOrFail($id), Carbon::parse($request->input('publishAt')));

        return response()->json(['data' => $this->presentAdmin($article)]);
    }

    /** `isHyperlocalSpotlight` is resolved fresh on every call — cheap (a single-row lookup) and
     *  correct even right after a write that just moved it. */
    private function presentAdmin(Article $article): array
    {
        return ArticlePresenter::admin($article, $article->id === $this->spotlightService->getPickArticleId());
    }

    /** Renders the same public shape a reader would see, regardless of the article's current
     *  status — lets staff preview a draft before it's published. */
    public function preview(string $id): JsonResponse
    {
        return response()->json(['data' => ArticlePresenter::preview(Article::findOrFail($id))]);
    }

    // --- Public ---

    public function publicIndex(PublicArticleIndexRequest $request): JsonResponse
    {
        $articles = $this->articleService->listPublic($request->validatedFilter());

        return response()->json(['data' => $articles->map(fn (Article $a) => ArticlePresenter::public($a))]);
    }

    public function publicShow(string $slug): JsonResponse
    {
        $article = Article::with(['categories', 'featuredMedia', 'anakUsaha', 'author'])
            ->publiclyVisible()
            ->where('slug', $slug)
            ->firstOrFail();

        return response()->json(['data' => ArticlePresenter::public($article)]);
    }
}
