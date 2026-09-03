<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request as RequestFacade;

/**
 * Journalisation systématique des actions sensibles.
 * Cf. exigence sécurité §4.2 du cahier des charges : "Journalisation des actions sensibles
 * (connexions, paiements, changements de statut)".
 *
 * Usage : app(AuditLogService::class)->log('order.status_changed', $order, ['from' => ..., 'to' => ...]);
 */
class AuditLogService
{
    public function log(string $action, ?Model $subject = null, array $meta = []): AuditLog
    {
        return AuditLog::create([
            'user_id' => Auth::id(),
            'action' => $action,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'meta' => $meta,
            'ip_address' => RequestFacade::ip(),
            'user_agent' => RequestFacade::userAgent(),
            'created_at' => now(),
        ]);
    }
}
