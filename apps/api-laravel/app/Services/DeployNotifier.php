<?php

declare(strict_types=1);

namespace App\Services;

use App\Services\Contracts\DeployNotifierInterface;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class DeployNotifier implements DeployNotifierInterface
{
    public function triggerRebuild(): void
    {
        $url = config('services.deploy_trigger.url');

        if (! $url) {
            return; // unset in dev/test — a silent no-op, matching the Node app's behavior
        }

        try {
            $token = config('services.deploy_trigger.token');

            Http::when($token, fn ($request) => $request->withToken($token))
                ->post($url, ['event_type' => 'content-published'])
                ->throw();
        } catch (\Throwable $e) {
            Log::warning('Deploy trigger webhook failed', ['exception' => $e->getMessage()]);
        }
    }
}
