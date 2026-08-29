<?php

declare(strict_types=1);

namespace App\Http\Requests\Partner;

use App\Rules\HttpUrl;
use Illuminate\Foundation\Http\FormRequest;

class StorePartnerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'logoMediaId' => ['required', 'string', 'exists:media,id'],
            'websiteUrl' => ['nullable', 'string', new HttpUrl()],
            'isActive' => ['sometimes', 'boolean'],
        ];
    }
}
