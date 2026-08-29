<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * A whole-list reorder submission's id set didn't exactly match the existing set (missing or
 * extra ids) — shared by anak-usaha profile ordering, curation, partners, and guide-picks.
 */
class OrderSetMismatchException extends DomainException
{
    public function __construct()
    {
        parent::__construct('The submitted id set must exactly match the existing set.', 400, 'order_set_mismatch');
    }
}
