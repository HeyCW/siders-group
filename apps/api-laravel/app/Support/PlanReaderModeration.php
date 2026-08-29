<?php

declare(strict_types=1);

namespace App\Support;

use App\Exceptions\MutedUntilMustBeFutureException;
use App\Models\Reader;
use Illuminate\Support\Carbon;

/**
 * Pure planning function: given the reader's current state and which of `status`/`mutedUntil`
 * the request actually touched, returns only the transitions that change something. Re-sending
 * the current state is a deliberate no-op with no audit-log entry — ported from the Node app's
 * `planReaderModeration`.
 */
class PlanReaderModeration
{
    /**
     * @return array<int, array{field: 'status'|'mutedUntil', value: mixed, action: string}>
     */
    public static function plan(
        Reader $reader,
        bool $touchesStatus,
        ?string $status,
        bool $touchesMutedUntil,
        ?string $mutedUntil,
    ): array {
        $actions = [];

        if ($touchesStatus && $status !== $reader->status) {
            $actions[] = [
                'field' => 'status',
                'value' => $status,
                'action' => $status === 'banned' ? 'reader_banned' : 'reader_unbanned',
            ];
        }

        if ($touchesMutedUntil) {
            $newMutedUntil = $mutedUntil !== null ? Carbon::parse($mutedUntil) : null;

            if ($newMutedUntil !== null && $newMutedUntil->isPast()) {
                throw new MutedUntilMustBeFutureException();
            }

            $currentIso = $reader->muted_until?->toIso8601String();
            $newIso = $newMutedUntil?->toIso8601String();

            if ($currentIso !== $newIso) {
                $actions[] = [
                    'field' => 'mutedUntil',
                    'value' => $newMutedUntil,
                    'action' => $newMutedUntil !== null ? 'reader_muted' : 'reader_unmuted',
                ];
            }
        }

        return $actions;
    }
}
