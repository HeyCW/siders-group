<?php

declare(strict_types=1);

namespace App\Exceptions;

class AnakUsahaConflictException extends DomainException
{
    public function __construct()
    {
        parent::__construct('An anak usaha entry with this name or slug already exists.', 409, 'anak_usaha_conflict');
    }
}
