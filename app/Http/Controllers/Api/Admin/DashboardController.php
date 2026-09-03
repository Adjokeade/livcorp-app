<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Order;
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
            'revenue_period' => Transaction::where('status', 'approved')
                ->where('paid_at', '>=', $since)
                ->sum('amount'),
        ]);
    }
}
