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
            'pickup_lat' => 'required|numeric|between:6.2,12.45',
            'pickup_lng' => 'required|numeric|between:0.7,3.9',
            'pickup_details' => 'nullable|string|max:255',
            'dropoff_address' => 'required|string|max:500',
            'dropoff_lat' => 'required|numeric|between:6.2,12.45',
            'dropoff_lng' => 'required|numeric|between:0.7,3.9',
            'dropoff_details' => 'nullable|string|max:255',
            'recipient_name' => 'required|string|max:150',
            'recipient_phone' => 'required|string|max:20',
            'package_type' => 'nullable|string|max:100',
            'instructions' => 'nullable|string|max:500',
            'urgency' => 'nullable|in:standard,express',
            // Proposer la livraison d'abord aux livreurs favoris (réservée à eux pendant quelques minutes).
            'favorites_first' => 'nullable|boolean',
            // Pas de prix ici : il est imposé par LIV corp selon la distance (cf. GeolocationService::priceFor).
            // Un colis se montre : la photo est obligatoire. Pour une course (achats à faire), elle est facultative.
            'photo' => 'required_if:type,colis|nullable|image|mimes:jpg,jpeg,png,webp|max:8192',
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
            'photo.required_if' => 'Ajoutez une photo du colis : le livreur doit voir ce qu\'il transporte.',
            'photo.max' => 'Cette photo est trop lourde (8 Mo maximum).',
        ];
    }
}
