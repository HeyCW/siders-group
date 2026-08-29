<?php

declare(strict_types=1);

namespace App\Exceptions;

class SlugConflictException extends DomainException
{
    public function __construct()
    {
        parent::__construct('An article with this slug already exists.', 409, 'slug_conflict');
    }
}
