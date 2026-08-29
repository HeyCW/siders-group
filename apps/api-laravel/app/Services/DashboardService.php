<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Article;
use App\Models\HomeCuration;
use App\Models\Reader;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardService
{
    private const CADENCE_WEEKS = 8;

    private const DUE_SOON_HOURS = 48;

    private const DUE_SOON_CAP = 20;

    private const OVERDUE_GRACE_MINUTES = 5;

    private const TOP_ARTICLES_CAP = 5;

    /** One shared `$now` across every section, so all 7 tiles agree on "the current moment". */
    public function build(): array
    {
        $now = now();

        return [
            'pipeline' => $this->pipeline(),
            'cadence' => $this->cadence($now),
            'contentDebt' => $this->contentDebt(),
            'curationIntegrity' => $this->curationIntegrity($now),
            'upNext' => $this->upNext($now),
            'readerActivity' => $this->readerActivity($now),
            'readership' => $this->readership($now),
        ];
    }

    private function pipeline(): array
    {
        $counts = Article::query()->selectRaw('status, count(*) as c')->groupBy('status')->pluck('c', 'status');

        return [
            'draft' => (int) ($counts['draft'] ?? 0),
            'scheduled' => (int) ($counts['scheduled'] ?? 0),
            'published' => (int) ($counts['published'] ?? 0),
        ];
    }

    /**
     * 8 trailing Jakarta-calendar weeks (Monday start). Asia/Jakarta is a fixed UTC+7 offset with
     * no DST since 1932, so the real IANA tz identifier is both simpler and more correct than a
     * hardcoded offset. Boundaries are explicitly converted to UTC before binding — Carbon's
     * formatted output reflects whatever timezone the instance itself is set to, and
     * `published_at` is stored/compared in UTC.
     */
    private function cadence(Carbon $now): array
    {
        $weeks = [];
        $jakartaNow = $now->clone()->timezone('Asia/Jakarta');

        for ($i = self::CADENCE_WEEKS - 1; $i >= 0; $i--) {
            $weekStart = $jakartaNow->clone()->startOfWeek(Carbon::MONDAY)->subWeeks($i);
            $weekEnd = $weekStart->clone()->addWeek();

            $count = Article::where('status', 'published')
                ->whereBetween('published_at', [$weekStart->clone()->utc(), $weekEnd->clone()->utc()->subSecond()])
                ->count();

            $weeks[] = ['weekStart' => $weekStart->toDateString(), 'count' => $count];
        }

        return $weeks;
    }

    /** Blank-or-null aware (an empty string excerpt still counts as missing), not a bare IS NULL. */
    private function contentDebt(): array
    {
        $published = Article::where('status', 'published');

        return [
            'missingSeoDescription' => (clone $published)->where(fn ($q) => $q->whereNull('seo_description')->orWhere('seo_description', ''))->count(),
            'missingExcerpt' => (clone $published)->where(fn ($q) => $q->whereNull('excerpt')->orWhere('excerpt', ''))->count(),
            'missingFeaturedMedia' => (clone $published)->whereNull('featured_media_id')->count(),
            'uncategorized' => (clone $published)->whereDoesntHave('categories')->count(),
        ];
    }

    private function curationIntegrity(Carbon $now): array
    {
        $entries = HomeCuration::with('article')->get();
        $visible = $entries->filter(fn (HomeCuration $c) => $c->article?->isCurrentlyVisible() ?? false)->count();

        return ['total' => $entries->count(), 'visible' => $visible];
    }

    /**
     * Due-soon list is capped for payload size but the total count is exact. Overdue-unpromoted
     * is a *health signal* for the scheduled-publish cron, not a correctness concern — a due
     * article is already publicly visible via the read-time scope regardless of this count.
     */
    private function upNext(Carbon $now): array
    {
        $dueSoonQuery = Article::where('status', 'scheduled')
            ->whereBetween('published_at', [$now, $now->clone()->addHours(self::DUE_SOON_HOURS)]);

        $dueSoon = (clone $dueSoonQuery)->orderBy('published_at')->limit(self::DUE_SOON_CAP)->get(['id', 'title', 'published_at']);

        $overdueUnpromoted = Article::where('status', 'scheduled')
            ->where('published_at', '<=', $now->clone()->subMinutes(self::OVERDUE_GRACE_MINUTES))
            ->count();

        return [
            'dueSoon' => $dueSoon->map(fn (Article $a) => ['id' => $a->id, 'title' => $a->title, 'publishedAt' => $a->published_at->toIso8601String()]),
            'dueSoonTotal' => (clone $dueSoonQuery)->count(),
            'overdueUnpromoted' => $overdueUnpromoted,
        ];
    }

    private function readerActivity(Carbon $now): array
    {
        return [
            'newReaders7d' => Reader::where('created_at', '>=', $now->clone()->subDays(7))->count(),
            'activeReaders30d' => Reader::where('last_login_at', '>=', $now->clone()->subDays(30))->count(),
        ];
    }

    private function readership(Carbon $now): array
    {
        $jakartaNow = $now->clone()->timezone('Asia/Jakarta');
        $sevenDaysAgo = $jakartaNow->clone()->subDays(7)->startOfDay()->utc()->toDateString();
        $thirtyDaysAgo = $jakartaNow->clone()->subDays(30)->startOfDay()->utc()->toDateString();

        $totals = DB::table('article_views_daily')
            ->where('date', '>=', $sevenDaysAgo)
            ->selectRaw('sum(views) as total_views, sum(unique_views) as total_unique_views')
            ->first();

        $topArticles = DB::table('article_views_daily')
            ->join('articles', 'articles.id', '=', 'article_views_daily.article_id')
            ->where('article_views_daily.date', '>=', $thirtyDaysAgo)
            ->groupBy('articles.id', 'articles.title')
            ->orderByDesc(DB::raw('sum(article_views_daily.views)'))
            ->limit(self::TOP_ARTICLES_CAP)
            ->get(['articles.id', 'articles.title', DB::raw('sum(article_views_daily.views) as views')]);

        return [
            'totalViews7d' => (int) ($totals->total_views ?? 0),
            'uniqueViews7d' => (int) ($totals->total_unique_views ?? 0),
            'topArticles30d' => $topArticles->map(fn ($row) => ['id' => $row->id, 'title' => $row->title, 'views' => (int) $row->views]),
        ];
    }
}
