<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContactMessage;
use App\Models\Deliverer;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\ServiceProvider;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    public function stats(Request $request)
    {
        $period = $request->query('period', 'month'); // day | week | month
        $since = match ($period) {
            'day' => Carbon::today(),
            'week' => Carbon::now()->subWeek(),
            default => Carbon::now()->subMonth(),
        };

        return response()->json([
            'users_total' => User::count(),
            'users_new' => User::where('created_at', '>=', $since)->count(),
            'orders_total' => Order::count(),
            'orders_period' => Order::where('created_at', '>=', $since)->count(),
            'orders_in_progress' => Order::whereIn('status', [
                Order::STATUS_ACCEPTEE, Order::STATUS_COLIS_RECUPERE, Order::STATUS_EN_COURS_LIVRAISON,
            ])->count(),
            'orders_disputed' => Order::where('status', Order::STATUS_LITIGE)->count(),
            // Pastilles du menu : ce qui attend une action de l'administration.
            'pending_deliverers' => Deliverer::where('verification_status', 'pending')->count(),
            'pending_providers' => ServiceProvider::where('status', 'pending')->count(),
            'new_messages' => ContactMessage::where('status', 'nouveau')->count(),
            'open_disputes' => Dispute::whereIn('status', ['ouvert', 'en_cours'])->count(),
            'revenue_period' => Transaction::where('status', 'approved')
                ->where('paid_at', '>=', $since)
                ->sum('amount'),
        ]);
    }
}
