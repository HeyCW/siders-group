<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\Access\Authorizable;
use Illuminate\Auth\Authenticatable;

/**
 * A public reader account, created only via Google OAuth (no local password login), authenticated
 * on the `reader` guard. See config/auth.php for the staff/reader dual-guard split.
 */
class Reader extends Model implements AuthenticatableContract
{
    use Authenticatable;
    use Authorizable;
    use HasMillisecondTimestamps;
    use HasUuidPrimaryKey;

    protected $fillable = [
        'google_sub',
        'email',
        'email_verified',
        'name',
        'avatar_url',
        'status',
        'muted_until',
        'last_login_at',
    ];

    protected function casts(): array
    {
        return [
            'email_verified' => 'boolean',
            'muted_until' => 'datetime',
            'last_login_at' => 'datetime',
        ];
    }

    public function isBanned(): bool
    {
        return $this->status === 'banned';
    }

    public function isMuted(): bool
    {
        return $this->muted_until !== null && $this->muted_until->isFuture();
    }

    /**
     * Whether this reader may currently author content (comments, reports). Read/like access is
     * granted even to a banned/muted reader — only content-creating actions are gated.
     */
    public function canAuthorContent(): bool
    {
        return ! $this->isBanned() && ! $this->isMuted();
    }
}
