<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * Anti-privilege-escalation guard: granting/removing the Owner role, or mutating an Owner
 * account (disable/reset/etc.), requires the acting staff member already be Owner — regardless
 * of whether they otherwise hold `user.manage`/`role.manage`.
 */
class OwnerActionRequiresOwnerException extends DomainException
{
    public function __construct()
    {
        parent::__construct('Only an Owner can perform this action.', 403, 'owner_required');
    }
}
