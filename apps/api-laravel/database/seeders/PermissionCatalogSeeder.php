<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PermissionCatalogSeeder extends Seeder
{
    /**
     * The fixed 10-key permission catalog, the seeded Owner role (granted every permission,
     * recognized only by `is_system = true`, never by name/slug), and the 4 anak_usaha entries —
     * mirrors db/migrations/0001_seed_permission_catalog.sql from the previous Node app.
     */
    public function run(): void
    {
        $permissions = [
            'news.manage' => 'Create, edit, publish, and delete articles.',
            'category.manage' => 'Create, edit, and delete categories.',
            'anak-usaha.manage' => 'Manage anak usaha entries and their public profiles.',
            'media.manage' => 'Upload, edit, and delete media.',
            'user.manage' => 'Create, disable, and reset staff accounts.',
            'role.manage' => 'Create, edit, and delete roles and their permissions.',
            'dashboard.view' => 'View the admin analytics dashboard.',
            'settings.manage' => 'Manage site-wide settings such as partners and sessions.',
            'moderation.manage' => 'Moderate comments and reader accounts.',
            'contact.manage' => 'View and manage contact messages.',
        ];

        $permissionIds = [];
        foreach ($permissions as $key => $description) {
            $id = DB::table('permissions')->where('key', $key)->value('id')
                ?? (string) Str::uuid();

            DB::table('permissions')->updateOrInsert(
                ['key' => $key],
                ['id' => $id, 'description' => $description],
            );

            $permissionIds[] = $id;
        }

        $ownerRoleId = DB::table('roles')->where('slug', 'owner')->value('id')
            ?? (string) Str::uuid();

        DB::table('roles')->updateOrInsert(
            ['slug' => 'owner'],
            [
                'id' => $ownerRoleId,
                'name' => 'Owner',
                'is_system' => true,
                'updated_at' => now(),
            ],
        );

        foreach ($permissionIds as $permissionId) {
            DB::table('role_permissions')->updateOrInsert([
                'role_id' => $ownerRoleId,
                'permission_id' => $permissionId,
            ]);
        }

        // The live brands, and the only ones an editor can file an article under. Slugs are the
        // `Str::slug(name)` form AnakUsahaSeeder derives, so the two seeders can't fork a brand
        // into two rows; 2026_08_31_100001_canonicalize_anak_usaha_catalog repairs databases
        // seeded before that ("SidersVox"/`sidersvox`, plus the dropped "Siders Culture").
        $anakUsaha = [
            ['name' => 'Jakarta Siders', 'slug' => 'jakarta-siders'],
            ['name' => 'Surabaya Siders', 'slug' => 'surabaya-siders'],
            ['name' => 'Siders Vox', 'slug' => 'siders-vox'],
        ];

        foreach ($anakUsaha as $entry) {
            DB::table('anak_usaha')->updateOrInsert(
                ['slug' => $entry['slug']],
                ['id' => (string) Str::uuid(), 'name' => $entry['name']],
            );
        }

        foreach (['partners', 'guide_picks', 'home_curation'] as $lockName) {
            DB::table('reorder_locks')->updateOrInsert(['name' => $lockName]);
        }
    }
}
