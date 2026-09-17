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
            'excerpt' => ['sometimes', 'nullable', 'string'],
            'featuredMediaId' => ['sometimes', 'nullable', 'string', 'exists:media,id'],
            'anakUsahaId' => ['sometimes', 'nullable', 'string', 'exists:anak_usaha,id'],
            'seoTitle' => ['sometimes', 'nullable', 'string'],
            'seoDescription' => ['sometimes', 'nullable', 'string'],
            'categoryIds' => ['sometimes', 'array'],
            'categoryIds.*' => ['string', 'exists:categories,id'],
        ];
    }
}
