<?php

declare(strict_types=1);

namespace App\Exceptions;

class AccountDisabledException extends DomainException
{
    public function __construct()
    {
        parent::__construct('This account has been disabled.', 403, 'account_disabled');
    }
}
