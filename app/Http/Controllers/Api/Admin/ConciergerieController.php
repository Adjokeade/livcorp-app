<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Notifications\ConciergerieDecision;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

/** Comptes conciergerie : validation ou refus par l'administration. */
class ConciergerieController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLog) {}

    public function index(Request $request)
    {
        $filters = $request->validate(['q' => 'nullable|string|max:100', 'status' => 'nullable|in:pending,approved,rejected']);

        return User::query()
            ->where('role', 'client')->where('account_type', 'conciergerie')
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('conciergerie_status', $status))
            ->when($filters['q'] ?? null, function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($w) => $w->where('company_name', 'like', $like)->orWhere('first_name', 'like', $like)->orWhere('last_name', 'like', $like)
                    ->orWhere('email', 'like', $like)->orWhere('phone', 'like', $like));
            })
            ->latest('id')
            ->paginate(20)
            ->through(fn (User $u) => $u->only(['id', 'company_name', 'first_name', 'last_name', 'email', 'phone', 'address', 'is_active', 'conciergerie_status', 'conciergerie_rejection_reason', 'created_at']));
    }

    public function approve(User $user)
    {
        $this->ensureConciergerie($user);
        $user->update(['conciergerie_status' => 'approved', 'conciergerie_rejection_reason' => null]);

        $this->auditLog->log('conciergerie.approved', $user);
        rescue(fn () => $user->notify(new ConciergerieDecision($user)));

        return $user->only(['id', 'conciergerie_status', 'conciergerie_rejection_reason']);
    }

    public function reject(Request $request, User $user)
    {
        $this->ensureConciergerie($user);
        $validated = $request->validate(['reason' => 'required|string|max:500']);
        $user->update(['conciergerie_status' => 'rejected', 'conciergerie_rejection_reason' => $validated['reason']]);

        $this->auditLog->log('conciergerie.rejected', $user, ['reason' => $validated['reason']]);
        rescue(fn () => $user->notify(new ConciergerieDecision($user)));

        return $user->only(['id', 'conciergerie_status', 'conciergerie_rejection_reason']);
    }

    private function ensureConciergerie(User $user): void
    {
        abort_unless($user->isConciergerie(), 404);
    }
}
