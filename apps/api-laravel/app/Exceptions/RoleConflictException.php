<?php

declare(strict_types=1);

namespace App\Exceptions;

class RoleConflictException extends DomainException
{
    public function __construct()
    {
        parent::__construct('A role with this name or slug already exists.', 409, 'role_conflict');
    }
}
