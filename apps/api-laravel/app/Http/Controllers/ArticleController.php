<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Article\AutosaveArticleRequest;
use App\Http\Requests\Article\ScheduleArticleRequest;
use App\Http\Requests\Article\StoreArticleRequest;
use App\Http\Requests\Article\UpdateArticleRequest;
use App\Models\Article;
use App\Services\ArticleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ArticleController extends Controller
{
    public function __construct(private readonly ArticleService $articleService) {}

    // --- Admin ---

    public function adminIndex(Request $request): JsonResponse
    {
        $articles = Article::with(['author', 'categories'])
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('created_at')
            ->paginate((int) $request->query('perPage', 20));

        return response()->json([
            'data' => collect($articles->items())->map(fn (Article $a) => $this->adminShape($a)),
            'meta' => ['total' => $articles->total(), 'page' => $articles->currentPage(), 'limit' => $articles->perPage()],
        ]);
    }

    public function adminShow(string $id): JsonResponse
    {
        return response()->json(['data' => $this->adminShape(Article::with(['categories'])->findOrFail($id))]);
    }

    public function store(StoreArticleRequest $request): JsonResponse
    {
        $article = $this->articleService->create($request->validated(), $request->user('staff')->id);

        return response()->json(['data' => $this->adminShape($article->fresh('categories'))], 201);
    }

    public function update(UpdateArticleRequest $request, string $id): JsonResponse
    {
        $article = $this->articleService->update(Article::findOrFail($id), $request->validated());

        return response()->json(['data' => $this->adminShape($article->fresh('categories'))]);
    }

    public function autosave(AutosaveArticleRequest $request, string $id): JsonResponse
    {
        $article = $this->articleService->autosave(Article::findOrFail($id), $request->validated());

        return response()->json(['data' => $this->adminShape($article)]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->articleService->delete(Article::findOrFail($id));

        return response()->json(['data' => null]);
    }

    public function publish(string $id): JsonResponse
    {
        return response()->json(['data' => $this->adminShape($this->articleService->publish(Article::findOrFail($id)))]);
    }

    public function unpublish(string $id): JsonResponse
    {
        return response()->json(['data' => $this->adminShape($this->articleService->unpublish(Article::findOrFail($id)))]);
    }

    public function schedule(ScheduleArticleRequest $request, string $id): JsonResponse
    {
        $article = $this->articleService->schedule(Article::findOrFail($id), Carbon::parse($request->input('publishAt')));

        return response()->json(['data' => $this->adminShape($article)]);
    }

    // --- Public ---

    public function publicIndex(Request $request): JsonResponse
    {
        $limit = min((int) $request->query('limit', 20), 50);

        $articles = Article::with(['categories', 'featuredMedia'])
            ->publiclyVisible()
            ->when($request->query('categorySlug'), fn ($q, $slug) => $q->whereHas('categories', fn ($c) => $c->where('slug', $slug)))
            ->when($request->query('anakUsahaSlug'), fn ($q, $slug) => $q->whereHas('anakUsaha', fn ($a) => $a->where('slug', $slug)))
            ->orderByDesc('published_at')
            ->limit($limit)
            ->get();

        return response()->json(['data' => $articles->map(fn (Article $a) => $this->publicShape($a))]);
    }

    public function publicShow(string $slug): JsonResponse
    {
        $article = Article::with(['categories', 'featuredMedia', 'author'])
            ->publiclyVisible()
            ->where('slug', $slug)
            ->firstOrFail();

        return response()->json(['data' => $this->publicShape($article)]);
    }

    private function adminShape(Article $article): array
    {
        return [
            'id' => $article->id,
            'title' => $article->title,
            'slug' => $article->slug,
            'bodyJson' => $article->body_json,
            'bodyHtml' => $article->body_html,
            'excerpt' => $article->excerpt,
            'status' => $article->status,
            'featuredMediaId' => $article->featured_media_id,
            'anakUsahaId' => $article->anak_usaha_id,
            'seoTitle' => $article->seo_title,
            'seoDescription' => $article->seo_description,
            'publishedAt' => $article->published_at?->toIso8601String(),
            'categoryIds' => $article->categories->pluck('id')->values(),
            'createdAt' => $article->created_at->toIso8601String(),
            'updatedAt' => $article->updated_at->toIso8601String(),
        ];
    }

    private function publicShape(Article $article): array
    {
        return [
            'id' => $article->id,
            'title' => $article->title,
            'slug' => $article->slug,
            'bodyHtml' => $article->body_html,
            'excerpt' => $article->excerpt,
            'seoTitle' => $article->seo_title,
            'seoDescription' => $article->seo_description,
            'publishedAt' => $article->published_at?->toIso8601String(),
            'categories' => $article->categories->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'slug' => $c->slug])->values(),
            'featuredMediaUrl' => $article->featuredMedia ? app(\App\Services\MediaService::class)->publicUrl($article->featuredMedia) : null,
        ];
    }
}
