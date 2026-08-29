<?php

declare(strict_types=1);

namespace App\Http\Requests\Role;

use Illuminate\Foundation\Http\FormRequest;

class UpdateRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:191'],
            'permissionKeys' => ['sometimes', 'array'],
            'permissionKeys.*' => ['string', 'exists:permissions,key'],
        ];
    }
}
