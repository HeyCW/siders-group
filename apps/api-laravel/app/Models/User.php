<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Foundation\Auth\User as Authenticatable;

/**
 * A staff (admin) account — RBAC-permissioned via `role_id`, authenticated on the `staff` guard.
 * Distinct from `Reader` (Google-OAuth-only public accounts), see config/auth.php.
 */
#[Hidden(['password_hash'])]
class User extends Authenticatable
{
    use HasMillisecondTimestamps;
    use HasUuidPrimaryKey;

    protected $fillable = [
        'email',
        'password_hash',
        'must_change_password',
        'name',
        'role_id',
        'status',
        'last_login_at',
    ];

    protected function casts(): array
    {
        return [
            'must_change_password' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    /**
     * Laravel's Authenticatable expects a `password` column by default — this account's hash
     * lives in `password_hash` instead (matches the pre-existing production column name).
     */
    public function getAuthPassword(): string
    {
        return $this->password_hash;
    }

    public function role(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
