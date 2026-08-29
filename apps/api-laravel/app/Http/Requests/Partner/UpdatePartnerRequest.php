<?php

declare(strict_types=1);

namespace App\Http\Requests\Partner;

use App\Rules\HttpUrl;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePartnerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'logoMediaId' => ['sometimes', 'string', 'exists:media,id'],
            'websiteUrl' => ['sometimes', 'nullable', 'string', new HttpUrl()],
            'isActive' => ['sometimes', 'boolean'],
        ];
    }
}
