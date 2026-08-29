<?php

declare(strict_types=1);

namespace App\Exceptions;

class RoleInUseException extends DomainException
{
    public function __construct()
    {
        parent::__construct('This role is still assigned to one or more staff accounts.', 409, 'role_in_use');
    }
}
