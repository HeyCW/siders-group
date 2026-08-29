<?php

declare(strict_types=1);

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * http(s)-only scheme allowlist for URLs that end up in a public `href` (partner links, anak-usaha
 * profile links) — rejects `javascript:`/`data:` schemes, an XSS guard against a stored payload
 * that would execute when a visitor clicks it.
 */
class HttpUrl implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! preg_match('#^https?://#i', $value)) {
            $fail('The :attribute must be a valid http or https URL.');
        }
    }
}
