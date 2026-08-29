<?php

declare(strict_types=1);

namespace App\Exceptions;

abstract class DomainException extends \RuntimeException
{
    public function __construct(
        string $message,
        private readonly int $status,
        private readonly string $code,
    ) {
        parent::__construct($message);
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    public function getErrorCode(): string
    {
        return $this->code;
    }
}
