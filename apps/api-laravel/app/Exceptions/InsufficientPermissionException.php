<?php

declare(strict_types=1);

namespace App\Exceptions;

class InsufficientPermissionException extends DomainException
{
    public function __construct()
    {
        parent::__construct('You do not have permission to perform this action.', 403, 'insufficient_permission');
    }
}
