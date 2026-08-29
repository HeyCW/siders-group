<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call(PermissionCatalogSeeder::class);

        // Local-dev convenience only — never seed a fixed-password account outside local dev.
        if (app()->environment('local')) {
            $this->call(DevOwnerSeeder::class);
        }
    }
}
