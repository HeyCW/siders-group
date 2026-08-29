<?php

declare(strict_types=1);

namespace App\Exceptions;

class ReservedRoleSlugException extends DomainException
{
    public function __construct()
    {
        parent::__construct("The slug 'owner' is reserved.", 400, 'reserved_role_slug');
    }
}
