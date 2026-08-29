<?php

declare(strict_types=1);

namespace App\Exceptions;

class ReaderBannedException extends DomainException
{
    public function __construct()
    {
        parent::__construct('Your account has been banned.', 403, 'reader_banned');
    }
}
