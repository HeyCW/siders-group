<?php

declare(strict_types=1);

namespace App\Exceptions;

class InvalidReferenceException extends DomainException
{
    public function __construct(string $message = 'One or more referenced ids do not exist.')
    {
        parent::__construct($message, 400, 'invalid_reference');
    }
}
