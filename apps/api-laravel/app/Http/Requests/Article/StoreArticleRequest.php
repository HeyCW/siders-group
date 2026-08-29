<?php

declare(strict_types=1);

namespace App\Http\Requests\Article;

use Illuminate\Foundation\Http\FormRequest;

class StoreArticleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:500'],
            'slug' => ['nullable', 'string', 'max:255', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'bodyJson' => ['required', 'array'],
            'bodyHtml' => ['required', 'string'],
            'excerpt' => ['nullable', 'string'],
            'featuredMediaId' => ['nullable', 'string', 'exists:media,id'],
            'anakUsahaId' => ['nullable', 'string', 'exists:anak_usaha,id'],
            'seoTitle' => ['nullable', 'string'],
            'seoDescription' => ['nullable', 'string'],
            'categoryIds' => ['sometimes', 'array'],
            'categoryIds.*' => ['string', 'exists:categories,id'],
        ];
    }
}
