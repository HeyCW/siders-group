<?php

declare(strict_types=1);

namespace App\Models\Concerns;

trait HasMillisecondTimestamps
{
    public function initializeHasMillisecondTimestamps(): void
    {
        $this->dateFormat = 'Y-m-d H:i:s.v';
    }
}
