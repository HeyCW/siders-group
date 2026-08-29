<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\InvalidReferenceException;
use App\Exceptions\OrderSetMismatchException;
use Illuminate\Support\Facades\DB;

/**
 * Two whole-list-reorder shapes shared across curation/partners/guide-picks (replacing Node's
 * replaceOrdering.ts/tableWriteLock.ts):
 *
 * - reorderExisting(): the rows already exist (partners, guide_picks) — just update each one's
 *   `sort_order` to its position in the submitted list. The submitted id set must exactly match
 *   the existing set (no create/delete here, ordering only).
 * - replaceWhole(): the rows themselves ARE the ordering (home_curation) — delete all, validate
 *   every submitted foreign id actually exists in the referenced table, reinsert with
 *   position = array index.
 *
 * Both take a `lockForUpdate()` row lock on a seeded `reorder_locks` sentinel row first, so two
 * concurrent reorders of the *same* list serialize on ordinary InnoDB row locks (released
 * automatically at commit/rollback) instead of MySQL named advisory locks.
 */
class ReplaceOrderingService
{
    /** @param array<int, string> $orderedIds */
    public function reorderExisting(string $table, string $lockName, array $orderedIds): void
    {
        DB::transaction(function () use ($table, $lockName, $orderedIds) {
            $this->acquireLock($lockName);

            $existingIds = DB::table($table)->pluck('id')->all();
            $this->assertExactSet($existingIds, $orderedIds);

            foreach ($orderedIds as $index => $id) {
                DB::table($table)->where('id', $id)->update(['sort_order' => $index]);
            }
        });
    }

    /** @param array<int, string> $orderedForeignIds */
    public function replaceWhole(
        string $table,
        string $lockName,
        string $foreignKeyColumn,
        string $referencedTable,
        array $orderedForeignIds,
    ): void {
        DB::transaction(function () use ($table, $lockName, $foreignKeyColumn, $referencedTable, $orderedForeignIds) {
            $this->acquireLock($lockName);

            $uniqueIds = array_unique($orderedForeignIds);
            $validCount = DB::table($referencedTable)->whereIn('id', $uniqueIds)->count();

            if ($validCount !== count($uniqueIds)) {
                throw new InvalidReferenceException();
            }

            DB::table($table)->delete();

            foreach ($orderedForeignIds as $index => $id) {
                DB::table($table)->insert([
                    $foreignKeyColumn => $id,
                    'position' => $index,
                    'created_at' => now(),
                ]);
            }
        });
    }

    private function acquireLock(string $lockName): void
    {
        DB::table('reorder_locks')->where('name', $lockName)->lockForUpdate()->first();
    }

    /** @param array<int, string> $existingIds @param array<int, string> $submittedIds */
    private function assertExactSet(array $existingIds, array $submittedIds): void
    {
        if (count($existingIds) !== count($submittedIds)
            || array_diff($existingIds, $submittedIds) !== []
            || array_diff($submittedIds, $existingIds) !== []
        ) {
            throw new OrderSetMismatchException();
        }
    }
}
