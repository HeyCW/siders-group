<?php

declare(strict_types=1);

namespace App\Exceptions;

class CannotActOnSelfException extends DomainException
{
    public function __construct(string $message = 'You cannot perform this action on your own account.')
    {
        parent::__construct($message, 400, 'cannot_act_on_self');
    }
}
