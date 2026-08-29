<?php

declare(strict_types=1);

namespace App\Http\Requests\GuidePick;

use App\Rules\MatchesMediaKind;
use Illuminate\Foundation\Http\FormRequest;

class UpdateGuidePickRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'city' => ['sometimes', 'string', 'max:255'],
            'place' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'string'],
            'photoMediaId' => ['sometimes', 'string', 'exists:media,id', new MatchesMediaKind('image')],
            'videoMediaId' => ['sometimes', 'string', 'exists:media,id', new MatchesMediaKind('video')],
            'isActive' => ['sometimes', 'boolean'],
        ];
    }
}
