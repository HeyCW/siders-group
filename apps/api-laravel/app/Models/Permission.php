<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Fixed permission catalog (see database/seeders/PermissionCatalogSeeder.php) — seeded-only,
 * no create/update/delete endpoint exists for this table.
 */
class Permission extends Model
{
    use HasUuidPrimaryKey;

    public $timestamps = false;

    protected $fillable = ['key', 'description'];

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_permissions');
    }
}
