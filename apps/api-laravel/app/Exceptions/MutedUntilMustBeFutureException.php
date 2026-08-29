<?php

declare(strict_types=1);

namespace App\Exceptions;

class MutedUntilMustBeFutureException extends DomainException
{
    public function __construct()
    {
        parent::__construct('mutedUntil must be in the future.', 400, 'muted_until_must_be_future');
    }
}
