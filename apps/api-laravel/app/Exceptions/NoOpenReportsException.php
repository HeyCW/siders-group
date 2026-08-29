<?php

declare(strict_types=1);

namespace App\Exceptions;

class NoOpenReportsException extends DomainException
{
    public function __construct()
    {
        parent::__construct('This comment has no open reports.', 404, 'no_open_reports');
    }
}
