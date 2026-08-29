<?php

declare(strict_types=1);

namespace App\Exceptions;

class CategoryConflictException extends DomainException
{
    public function __construct()
    {
        parent::__construct('A category with this name or slug already exists.', 409, 'category_conflict');
    }
}
