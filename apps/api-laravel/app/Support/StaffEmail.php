<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Shared by login, staff creation, and any future rate-limit key — everything that identifies a
 * staff account by email must agree on the same normalization, or "the same email" could look
 * like two different identities depending on which code path touched it.
 */
class StaffEmail
{
    public static function normalize(string $email): string
    {
        return mb_strtolower(trim($email));
    }
}
