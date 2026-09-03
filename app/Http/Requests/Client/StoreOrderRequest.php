<?php

namespace App\Http\Requests\Client;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isClient() ?? false;
    }

    public function rules(): array
    {
        return [
            'type' => 'required|in:colis,course',
            'merchant_id' => 'nullable|exists:merchants,id',
            'pickup_address' => 'required|string|max:500',
            'pickup_lat' => 'required|numeric|between:-90,90',
            'pickup_lng' => 'required|numeric|between:-180,180',
            'dropoff_address' => 'required|string|max:500',
            'dropoff_lat' => 'required|numeric|between:-90,90',
            'dropoff_lng' => 'required|numeric|between:-180,180',
            'package_type' => 'nullable|string|max:100',
            'instructions' => 'nullable|string|max:500',
            'urgency' => 'nullable|in:standard,express',
        ];
    }
}
