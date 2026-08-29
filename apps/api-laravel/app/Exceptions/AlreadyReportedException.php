<?php

declare(strict_types=1);

namespace App\Exceptions;

class AlreadyReportedException extends DomainException
{
    public function __construct()
    {
        parent::__construct('You have already reported this comment.', 409, 'already_reported');
    }
}
