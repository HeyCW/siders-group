<?php

declare(strict_types=1);

namespace App\Exceptions;

class SystemRoleProtectedException extends DomainException
{
    public function __construct(string $message = 'The system role cannot be modified in this way.')
    {
        parent::__construct($message, 403, 'system_role_protected');
    }
}
