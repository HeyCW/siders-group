<?php

declare(strict_types=1);

namespace App\Http\Requests\Staff;

use Illuminate\Foundation\Http\FormRequest;

class StoreStaffRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email', 'max:320'],
            'name' => ['required', 'string', 'max:255'],
            'roleId' => ['required', 'string', 'exists:roles,id'],
        ];
    }
}
