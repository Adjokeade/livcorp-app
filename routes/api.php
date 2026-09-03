<?php

use App\Http\Controllers\Api\Admin\AdminTaskController;
use App\Http\Controllers\Api\Admin\DashboardController;
use App\Http\Controllers\Api\Admin\DelivererValidationController;
use App\Http\Controllers\Api\Admin\DisputeController;
use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\Client\OrderController as ClientOrderController;
use App\Http\Controllers\Api\Deliverer\OrderController as DelivererOrderController;
use App\Http\Controllers\Api\Merchant\OrderController as MerchantOrderController;
use App\Http\Controllers\Api\Merchant\ShopController;
use App\Http\Controllers\Api\Webhook\FedaPayWebhookController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API LIV corp — v1
|--------------------------------------------------------------------------
| Toutes les routes sont préfixées /api/v1 (cf. RouteServiceProvider / bootstrap/app.php)
*/

Route::prefix('v1')->group(function () {

    // --- Authentification (publique, avec rate limiting) ---
    Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

    // --- Webhook FedaPay (public, sécurisé par signature — voir controller) ---
    Route::post('/webhooks/fedapay', [FedaPayWebhookController::class, 'handle']);

    // --- Routes authentifiées (Sanctum) ---
    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);

        // ===== CLIENT =====
        Route::middleware(['role:client', 'verified.email'])->prefix('client')->group(function () {
            Route::get('/orders', [ClientOrderController::class, 'index']);
            Route::post('/orders/estimate', [ClientOrderController::class, 'estimate']);
            Route::post('/orders', [ClientOrderController::class, 'store']);
            Route::get('/orders/{order}', [ClientOrderController::class, 'show']);
            Route::get('/orders/{order}/track', [ClientOrderController::class, 'track']);
        });

        // ===== LIVREUR =====
        // 'deliverer.verified' bloque tout accès tant que l'admin n'a pas validé le compte
        Route::middleware(['role:livreur', 'verified.email', 'deliverer.verified'])->prefix('deliverer')->group(function () {
            Route::get('/orders/available', [DelivererOrderController::class, 'available']);
            Route::get('/orders/mine', [DelivererOrderController::class, 'myOrders']);
            Route::post('/orders/{order}/accept', [DelivererOrderController::class, 'accept']);
            Route::patch('/orders/{order}/status', [DelivererOrderController::class, 'updateStatus']);
            Route::post('/orders/{order}/location', [DelivererOrderController::class, 'pushLocation']);
        });

        // ===== COMMERÇANT =====
        Route::middleware(['role:commercant', 'verified.email'])->prefix('merchant')->group(function () {
            Route::get('/shop', [ShopController::class, 'show']);
            Route::put('/shop', [ShopController::class, 'update']);
            Route::get('/orders', [MerchantOrderController::class, 'index']);
            Route::get('/orders/stats', [MerchantOrderController::class, 'stats']);
        });

        // ===== ADMINISTRATEUR =====
        Route::middleware(['role:admin'])->prefix('admin')->group(function () {
            Route::get('/dashboard/stats', [DashboardController::class, 'stats']);

            Route::get('/deliverers/pending', [DelivererValidationController::class, 'pending']);
            Route::post('/deliverers/{deliverer}/approve', [DelivererValidationController::class, 'approve']);
            Route::post('/deliverers/{deliverer}/reject', [DelivererValidationController::class, 'reject']);

            Route::get('/disputes', [DisputeController::class, 'index']);
            Route::post('/disputes/{dispute}/assign', [DisputeController::class, 'assign']);
            Route::post('/disputes/{dispute}/resolve', [DisputeController::class, 'resolve']);

            // Gestion des tâches internes (compte admin "gestionnaire de tâches")
            Route::get('/tasks', [AdminTaskController::class, 'index']);
            Route::post('/tasks', [AdminTaskController::class, 'store']);
            Route::patch('/tasks/{adminTask}/assign', [AdminTaskController::class, 'assign']);
            Route::patch('/tasks/{adminTask}/status', [AdminTaskController::class, 'updateStatus']);
        });
    });
});
