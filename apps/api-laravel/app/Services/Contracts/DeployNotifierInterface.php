<?php

declare(strict_types=1);

namespace App\Services\Contracts;

interface DeployNotifierInterface
{
    /**
     * Triggers a full static-site rebuild (apps/web is a static export — there is no per-path
     * ISR to invalidate). Never throws: a failed trigger is only ever logged, never allowed to
     * fail the write that caused it.
     */
    public function triggerRebuild(): void;
}
