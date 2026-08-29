<?php

declare(strict_types=1);

namespace App\Exceptions;

class DuplicateEmailException extends DomainException
{
    public function __construct()
    {
        parent::__construct('An account with this email already exists.', 409, 'duplicate_email');
    }
}
