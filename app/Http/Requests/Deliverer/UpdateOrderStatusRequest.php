<?php

namespace App\Http\Requests\Deliverer;

use Illuminate\Foundation\Http\FormRequest;

class UpdateOrderStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isLivreur() ?? false;
    }

    public function rules(): array
    {
        return [
            'status' => 'required|in:colis_recupere,en_cours_livraison,livree',
            'note' => 'nullable|string|max:500',
        ];
    }
}
