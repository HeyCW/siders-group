<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Laravel's DatabaseSessionHandler only ever populates `framework_sessions.user_id` from the
 * *default* guard (`Guard::class` resolves the app's default guard, 'staff' — see
 * DatabaseSessionHandler::userId()), which would silently leave reader sessions unattributed.
 * So this binds/revokes user_id explicitly, guard-agnostic, instead of relying on that.
 */
class SessionRevocationService
{
    public function bindCurrentSession(Request $request, string $userId): void
    {
        DB::table('framework_sessions')
            ->where('id', $request->session()->getId())
            ->update(['user_id' => $userId]);
    }

    public function revokeAllForUser(string $userId): void
    {
        DB::table('framework_sessions')->where('user_id', $userId)->delete();
    }

    public function revokeAllForUserExcept(string $userId, string $exceptSessionId): void
    {
        DB::table('framework_sessions')
            ->where('user_id', $userId)
            ->where('id', '!=', $exceptSessionId)
            ->delete();
    }
}
