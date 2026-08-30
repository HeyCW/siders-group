<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * PermissionCatalogSeeder used to insert the brand catalog with a hand-typed slug for Siders Vox
 * ("SidersVox"/`sidersvox`), which is not what `Str::slug('Siders Vox')` produces — so once
 * AnakUsahaSeeder started creating the profile rows, the brand existed twice, with the profile on
 * one row and any articles potentially on the other. It also carried "Siders Culture", a brand
 * that was dropped.
 *
 * Data-only: renames the legacy row to the canonical slug (or folds it into the canonical row if
 * both exist, moving its articles over first) and removes the dropped brand. Skips the removal if
 * anything still points at it, so no editor's work disappears silently.
 */
return new class extends Migration
{
    private const LEGACY_SLUG = 'sidersvox';

    private const CANONICAL_SLUG = 'siders-vox';

    private const CANONICAL_NAME = 'Siders Vox';

    private const DROPPED_SLUG = 'siders-culture';

    public function up(): void
    {
        $this->foldLegacySidersVox();
        $this->dropSidersCulture();
    }

    /** Irreversible by design: the pre-merge split is a bug, not a state worth restoring. */
    public function down(): void {}

    private function foldLegacySidersVox(): void
    {
        $legacyId = DB::table('anak_usaha')->where('slug', self::LEGACY_SLUG)->value('id');

        if ($legacyId === null) {
            return;
        }

        $canonicalId = DB::table('anak_usaha')->where('slug', self::CANONICAL_SLUG)->value('id');

        if ($canonicalId === null) {
            DB::table('anak_usaha')->where('id', $legacyId)->update([
                'slug' => self::CANONICAL_SLUG,
                'name' => self::CANONICAL_NAME,
            ]);

            return;
        }

        DB::table('articles')->where('anak_usaha_id', $legacyId)->update(['anak_usaha_id' => $canonicalId]);
        DB::table('anak_usaha_profile')->where('anak_usaha_id', $legacyId)->delete();
        DB::table('anak_usaha')->where('id', $legacyId)->delete();
    }

    private function dropSidersCulture(): void
    {
        $id = DB::table('anak_usaha')->where('slug', self::DROPPED_SLUG)->value('id');

        if ($id === null) {
            return;
        }

        $isReferenced = DB::table('articles')->where('anak_usaha_id', $id)->exists()
            || DB::table('anak_usaha_profile')->where('anak_usaha_id', $id)->exists();

        if ($isReferenced) {
            return;
        }

        DB::table('anak_usaha')->where('id', $id)->delete();
    }
};
