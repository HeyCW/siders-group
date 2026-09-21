<?php

declare(strict_types=1);

namespace App\Http\Requests\Article;

use Illuminate\Foundation\Http\FormRequest;

class UpdateArticleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:500'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:255', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'bodyJson' => ['sometimes', 'array'],
            'excerpt' => ['sometimes', 'nullable', 'string'],
            'featuredMediaId' => ['sometimes', 'nullable', 'string', 'exists:media,id'],
            'anakUsahaId' => ['sometimes', 'nullable', 'string', 'exists:anak_usaha,id'],
            'seoTitle' => ['sometimes', 'nullable', 'string'],
            'seoDescription' => ['sometimes', 'nullable', 'string'],
            'keywords' => ['sometimes', 'nullable', 'string', 'max:500'],
            'categoryIds' => ['sometimes', 'array'],
            'categoryIds.*' => ['string', 'exists:categories,id'],
            // Absent from AutosaveArticleRequest entirely — autosave can never move the
            // spotlight even if a caller tries (specs/hyperlocal-spotlight/spec.md - "Autosave
            // never changes the spotlight").
            'isHyperlocalSpotlight' => ['sometimes', 'boolean'],
        ];
    }
}
