<?php

declare(strict_types=1);

namespace App\Http\Requests\Contact;

use Illuminate\Foundation\Http\FormRequest;

/** Anonymous submission — strict field set, no session-derived fields possible. */
class SubmitContactMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'organisation' => ['nullable', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:320'],
            'subject' => ['nullable', 'string', 'max:512'],
            'message' => ['required', 'string', 'max:5000'],
        ];
    }
}
