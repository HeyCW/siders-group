<?php

declare(strict_types=1);

namespace App\Exceptions;

class ProfileConflictException extends DomainException
{
    public function __construct()
    {
        parent::__construct('This anak usaha already has a profile.', 409, 'profile_conflict');
    }
}
