<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Article;
use App\Services\Contracts\DeployNotifierInterface;
use Illuminate\Support\Facades\Log;

/**
 * Runs every minute (see routes/console.php). Correctness never depends on this job — a
 * due-but-unpromoted scheduled article is already treated as publicly visible by
 * Article::scopePubliclyVisible(). This only reduces the latency of the status flip + rebuild
 * trigger, and re-checks the due condition *inside* the UPDATE to avoid resurrecting an article
 * that was rescheduled/unpublished/deleted between the SELECT and now.
 */
class ScheduledPublishService
{
    public function __construct(private readonly DeployNotifierInterface $deployNotifier) {}

    public function run(): void
    {
        $dueIds = Article::where('status', 'scheduled')
            ->where('published_at', '<=', now())
            ->pluck('id');

        foreach ($dueIds as $id) {
            try {
                $promoted = Article::where('id', $id)
                    ->where('status', 'scheduled')
                    ->where('published_at', '<=', now())
                    ->update(['status' => 'published']);

                if ($promoted > 0) {
                    $this->deployNotifier->triggerRebuild();
                }
            } catch (\Throwable $e) {
                Log::error('Scheduled publish failed for one article', ['article_id' => $id, 'exception' => $e->getMessage()]);
            }
        }
    }
}
