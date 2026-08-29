<?php

declare(strict_types=1);

namespace App\Http\Requests\Media;

use App\Rules\MaxBytesForDetectedKind;
use Illuminate\Foundation\Http\FormRequest;

class StoreMediaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'file' => [
                'required',
                'file',
                'mimetypes:image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4',
                new MaxBytesForDetectedKind(),
            ],
            'alt' => ['nullable', 'string'],
            'caption' => ['nullable', 'string'],
        ];
    }
}
