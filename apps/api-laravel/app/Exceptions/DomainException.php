<?php

declare(strict_types=1);

namespace App\Exceptions;

abstract class DomainException extends \RuntimeException
{
    public function __construct(
        string $message,
        private readonly int $status,
        // Not named $code: \Exception already declares a non-readonly $code (int), and PHP
        // forbids redeclaring it as readonly.
        private readonly string $errorCode,
    ) {
        parent::__construct($message);
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    public function getErrorCode(): string
    {
        return $this->errorCode;
    }
}
