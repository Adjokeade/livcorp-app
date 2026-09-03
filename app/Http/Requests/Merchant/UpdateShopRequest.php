<?php

namespace App\Http\Requests\Merchant;

use Illuminate\Foundation\Http\FormRequest;

class UpdateShopRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isCommercant() ?? false;
    }

    public function rules(): array
    {
        return [
            'shop_name' => 'required|string|max:150',
            'shop_address' => 'required|string|max:500',
            'shop_lat' => 'nullable|numeric|between:-90,90',
            'shop_lng' => 'nullable|numeric|between:-180,180',
            'shop_phone' => 'nullable|string|max:20',
            'opening_hours' => 'nullable|array',
        ];
    }
}
