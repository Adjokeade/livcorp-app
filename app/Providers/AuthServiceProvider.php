<?php

namespace App\Providers;

use App\Models\Dispute;
use App\Models\Order;
use App\Policies\DisputePolicy;
use App\Policies\OrderPolicy;
use Illuminate\Support\ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    protected $policies = [
        Order::class => OrderPolicy::class,
        Dispute::class => DisputePolicy::class,
    ];

    public function boot(): void
    {
        //
    }
}
