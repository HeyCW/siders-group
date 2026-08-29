<?php

declare(strict_types=1);

namespace App\Http\Requests\Article;

use Illuminate\Foundation\Http\FormRequest;

/** Structurally excludes slug/status — cannot touch either even if a caller tries. */
class AutosaveArticleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:500'],
            'bodyJson' => ['sometimes', 'array'],
            'bodyHtml' => ['sometimes', 'string'],
            'excerpt' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
