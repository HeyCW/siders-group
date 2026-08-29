<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Article\AutosaveArticleRequest;
use App\Http\Requests\Article\ScheduleArticleRequest;
use App\Http\Requests\Article\StoreArticleRequest;
use App\Http\Requests\Article\UpdateArticleRequest;
use App\Models\Article;
use App\Services\ArticleService;
use App\Support\ArticlePresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ArticleController extends Controller
{
    public function __construct(private readonly ArticleService $articleService) {}

    // --- Admin ---

    public function adminIndex(Request $request): JsonResponse
    {
        $articles = Article::with(['author', 'categories', 'anakUsaha', 'featuredMedia'])
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('created_at')
            ->paginate((int) $request->query('perPage', 20));

        return response()->json([
            'data' => collect($articles->items())->map(fn (Article $a) => ArticlePresenter::admin($a)),
            'meta' => ['total' => $articles->total(), 'page' => $articles->currentPage(), 'limit' => $articles->perPage()],
        ]);
    }

    public function adminShow(string $id): JsonResponse
    {
        return response()->json(['data' => ArticlePresenter::admin(Article::findOrFail($id))]);
    }

    public function store(StoreArticleRequest $request): JsonResponse
    {
        $article = $this->articleService->create($request->validated(), $request->user('staff')->id);

        return response()->json(['data' => ArticlePresenter::admin($article)], 201);
    }

    public function update(UpdateArticleRequest $request, string $id): JsonResponse
    {
        $article = $this->articleService->update(Article::findOrFail($id), $request->validated());

        return response()->json(['data' => ArticlePresenter::admin($article)]);
    }

    public function autosave(AutosaveArticleRequest $request, string $id): JsonResponse
    {
        $article = $this->articleService->autosave(Article::findOrFail($id), $request->validated());

        return response()->json(['data' => ArticlePresenter::admin($article)]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->articleService->delete(Article::findOrFail($id));

        return response()->json(['data' => null]);
    }

    public function publish(string $id): JsonResponse
    {
        return response()->json(['data' => ArticlePresenter::admin($this->articleService->publish(Article::findOrFail($id)))]);
    }

    public function unpublish(string $id): JsonResponse
    {
        return response()->json(['data' => ArticlePresenter::admin($this->articleService->unpublish(Article::findOrFail($id)))]);
    }

    public function schedule(ScheduleArticleRequest $request, string $id): JsonResponse
    {
        $article = $this->articleService->schedule(Article::findOrFail($id), Carbon::parse($request->input('publishAt')));

        return response()->json(['data' => ArticlePresenter::admin($article)]);
    }

    // --- Public ---

    public function publicIndex(Request $request): JsonResponse
    {
        $limit = min((int) $request->query('limit', 20), 50);

        $articles = Article::with(['categories', 'featuredMedia', 'anakUsaha', 'author'])
            ->publiclyVisible()
            ->when($request->query('categorySlug'), fn ($q, $slug) => $q->whereHas('categories', fn ($c) => $c->where('slug', $slug)))
            ->when($request->query('anakUsahaSlug'), fn ($q, $slug) => $q->whereHas('anakUsaha', fn ($a) => $a->where('slug', $slug)))
            ->orderByDesc('published_at')
            ->limit($limit)
            ->get();

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
