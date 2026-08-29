<?php

declare(strict_types=1);

namespace App\Exceptions;

class InvalidArticleTransitionException extends DomainException
{
    public function __construct(string $message)
    {
        parent::__construct($message, 409, 'invalid_article_transition');
    }
}
