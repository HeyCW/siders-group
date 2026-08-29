<?php

declare(strict_types=1);

namespace App\Exceptions;

class ReaderMutedException extends DomainException
{
    public function __construct()
    {
        parent::__construct('Your account is temporarily muted.', 403, 'reader_muted');
    }
}
