<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\AuditLogService;
use App\Services\GeolocationService;
use Illuminate\Http\Request;

/** Barème de prix de la plateforme : base + prix au km, avec majoration express. */
class TariffController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function show()
    {
        return $this->payload();
    }

    public function update(Request $request)
    {
        $validated = $request->validate([
            'base_fare' => 'required|integer|min:0|max:100000',
            'per_km' => 'required|integer|min:0|max:10000',
            'express_multiplier' => 'required|numeric|min:1|max:5',
        ]);

        Setting::write('tariff', $validated, $request->user()->id);
        $this->auditLog->log('admin.tariff.updated', null, $validated);

        return $this->payload();
    }

    private function payload(): array
    {
        $tariff = GeolocationService::tariff();
        $geo = app(GeolocationService::class);

        return [
            'tariff' => $tariff,
            'defaults' => GeolocationService::DEFAULT_TARIFF,
            // Aperçu : ce que le barème donne sur quelques distances.
            'examples' => collect([2, 5, 10, 20])->map(fn ($km) => [
                'km' => $km,
                'standard' => $geo->estimatePrice($km, 'standard'),
                'express' => $geo->estimatePrice($km, 'express'),
            ]),
        ];
    }
}
