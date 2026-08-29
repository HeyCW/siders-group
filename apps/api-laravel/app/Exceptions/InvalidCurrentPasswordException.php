<?php

declare(strict_types=1);

namespace App\Exceptions;

class InvalidCurrentPasswordException extends DomainException
{
    public function __construct()
    {
        parent::__construct('The current password is incorrect.', 401, 'invalid_current_password');
    }
}
