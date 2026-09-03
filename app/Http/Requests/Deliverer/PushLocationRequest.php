<?php

namespace App\Http\Requests\Deliverer;

use Illuminate\Foundation\Http\FormRequest;

class PushLocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isLivreur() ?? false;
    }

    public function rules(): array
    {
        return [
            'lat' => 'required|numeric|between:-90,90',
            'lng' => 'required|numeric|between:-180,180',
        ];
    }
}
