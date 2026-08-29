<?php

declare(strict_types=1);

namespace App\Exceptions;

class PasswordChangeRequiredException extends DomainException
{
    public function __construct()
    {
        parent::__construct('A password change is required before continuing.', 403, 'password_change_required');
    }
}
