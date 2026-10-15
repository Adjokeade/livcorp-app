<?php

namespace App\Services;

use App\Models\Setting;

/**
 * Réglages financiers modifiables par l'administrateur. Tant qu'il n'a rien changé, les valeurs viennent
 * de la configuration (`COMMISSION_RATE_DEFAULT` dans .env).
 */
class FinanceSettings
{
    /** Taux de commission LIV corp en pourcentage, appliqué aux livraisons à venir (les anciennes gardent le leur). */
    public static function commissionRate(): float
    {
        $stored = Setting::read('finance')['commission_rate'] ?? null;

        return (float) ($stored ?? config('services.commission.rate_default', 15));
    }

    public static function setCommissionRate(float $rate, ?int $userId = null): void
    {
        Setting::write('finance', array_replace(Setting::read('finance'), ['commission_rate' => $rate]), $userId);
    }
}
