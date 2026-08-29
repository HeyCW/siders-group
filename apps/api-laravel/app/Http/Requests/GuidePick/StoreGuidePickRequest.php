<?php

declare(strict_types=1);

namespace App\Http\Requests\GuidePick;

use App\Rules\MatchesMediaKind;
use Illuminate\Foundation\Http\FormRequest;

class StoreGuidePickRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'city' => ['required', 'string', 'max:255'],
            'place' => ['required', 'string', 'max:255'],
            'description' => ['required', 'string'],
            'photoMediaId' => ['required', 'string', 'exists:media,id', new MatchesMediaKind('image')],
            'videoMediaId' => ['required', 'string', 'exists:media,id', new MatchesMediaKind('video')],
            'isActive' => ['sometimes', 'boolean'],
        ];
    }
}
