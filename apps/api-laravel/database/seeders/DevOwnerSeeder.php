<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Local-dev only (never run in production — see DatabaseSeeder). Mirrors db/seed.sql from the
 * previous Node app: seeds the very first Owner account so the first sign-in is an ordinary
 * sign-in followed by the same forced password change every account goes through, not a
 * special-case bootstrap path. No API path can create the first staff account — creating one
 * requires user.manage, and granting Owner requires already holding Owner.
 *
 * Local-dev convenience only: sign in with the fixed password below, then change it
 * (POST /staff/me/password) since must_change_password starts true.
 */
class DevOwnerSeeder extends Seeder
{
    private const EMAIL = 'owner@example.com';

    private const PASSWORD = 'local-dev-owner-password';

    public function run(): void
    {
        $ownerRoleId = Role::where('slug', 'owner')->value('id');

        if ($ownerRoleId === null) {
            return; // PermissionCatalogSeeder hasn't run yet — nothing to attach to.
        }

        User::updateOrCreate(
            ['email' => self::EMAIL],
            [
                'name' => 'Owner',
                'role_id' => $ownerRoleId,
                'password_hash' => Hash::make(self::PASSWORD),
                'must_change_password' => true,
                'status' => 'active',
            ],
        );
    }
}
