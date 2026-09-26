<?php

namespace App\Http\Requests\Client;

use Illuminate\Foundation\Http\FormRequest;

class EstimateOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isClient() ?? false;
    }

    public function rules(): array
    {
        return [
            // Les deux points doivent être au Bénin (rectangle englobant du pays).
            'pickup_lat' => 'required|numeric|between:6.2,12.45',
            'pickup_lng' => 'required|numeric|between:0.7,3.9',
            'dropoff_lat' => 'required|numeric|between:6.2,12.45',
            'dropoff_lng' => 'required|numeric|between:0.7,3.9',
            'urgency' => 'nullable|in:standard,express',
        ];
    }

    public function messages(): array
    {
        $outside = 'Cette adresse doit se trouver au Bénin.';

        return [
            'pickup_lat.between' => $outside,
            'pickup_lng.between' => $outside,
            'dropoff_lat.between' => $outside,
            'dropoff_lng.between' => $outside,
        ];
    }
}
