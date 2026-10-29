<?php

use App\Http\Controllers\Api\Admin\AdminTaskController;
use App\Http\Controllers\Api\Admin\AuthController as AdminAuthController;
use App\Http\Controllers\Api\Admin\ContactMessageController as AdminContactMessageController;
use App\Http\Controllers\Api\Admin\DashboardController;
use App\Http\Controllers\Api\Admin\DelivererValidationController;
use App\Http\Controllers\Api\Admin\DisputeController;
use App\Http\Controllers\Api\Admin\DelivererController as AdminDelivererController;
use App\Http\Controllers\Api\Admin\FinanceController;
use App\Http\Controllers\Api\Admin\OrderController as AdminOrderController;
use App\Http\Controllers\Api\Admin\ServiceProviderController as AdminServiceProviderController;
use App\Http\Controllers\Api\Admin\TariffController;
use App\Http\Controllers\Api\Admin\UserController as AdminUserController;
use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\Auth\PasswordResetController;
use App\Http\Controllers\Api\Client\OrderController as ClientOrderController;
use App\Http\Controllers\Api\AvatarController;
use App\Http\Controllers\Api\Client\FavoriteDelivererController;
use App\Http\Controllers\Api\Client\RecipientController;
use App\Http\Controllers\Api\Client\ServiceRequestController;
use App\Http\Controllers\Api\Client\TeamController;
use App\Http\Controllers\Api\Provider\OfferController as ProviderOfferController;
use App\Http\Controllers\Api\Client\PaymentController;
use App\Http\Controllers\Api\Client\ReviewController as ClientReviewController;
use App\Http\Controllers\Api\ContactMessageController;
use App\Http\Controllers\Api\Deliverer\AvailabilityController;
use App\Http\Controllers\Api\Client\DeliveryController as ClientDeliveryController;
use App\Http\Controllers\Api\Deliverer\DeliveryController as DelivererDeliveryController;
use App\Http\Controllers\Api\Deliverer\DocumentController;
use App\Http\Controllers\Api\Deliverer\OrderController as DelivererOrderController;
use App\Http\Controllers\Api\Deliverer\RoutePlanController;
use App\Http\Controllers\Api\Deliverer\ReviewController as DelivererReviewController;
use App\Http\Controllers\Api\Deliverer\WalletController;
use App\Http\Controllers\Api\MarketplaceController;
use App\Http\Controllers\Api\OrderMessageController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ServiceProviderController;
use App\Http\Controllers\Api\SavedAddressController;
use App\Http\Controllers\Api\OrderPhotoController;
use App\Http\Controllers\Api\PushSubscriptionController;
use App\Http\Controllers\Api\Merchant\OrderController as MerchantOrderController;
use App\Http\Controllers\Api\Merchant\ShopController;
use App\Http\Controllers\Api\Webhook\KkiapayWebhookController;
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
    // Le verrouillage strict (5 essais par e-mail + IP) est dans AuthController::login ;
    // ce plafond par IP ne sert qu'à freiner un balayage massif, sans pénaliser
    // plusieurs utilisateurs derrière la même box ou le même réseau mobile.
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:30,1');
    Route::post('/auth/forgot-password', [PasswordResetController::class, 'forgot'])->middleware('throttle:5,1');
    Route::post('/auth/reset-password', [PasswordResetController::class, 'reset'])->middleware('throttle:10,1');

    // Connexion de l'espace administrateur : point d'entrée distinct de la connexion publique.
    Route::post('/admin/auth/login', [AdminAuthController::class, 'login'])->middleware('throttle:20,1');

    // Vérification d'e-mail : lien signé reçu par mail (public) + renvoi (authentifié)
    Route::get('/auth/email/verify/{id}/{hash}', [AuthController::class, 'verifyEmail'])
        ->middleware(['signed', 'throttle:6,1'])
        ->name('verification.verify');
    Route::post('/auth/email/verification-notification', [AuthController::class, 'sendVerificationEmail'])
        ->middleware(['auth:sanctum', 'throttle:6,1'])
        ->name('verification.send');

    // --- Webhook KKiaPay (public, protégé par le secret hash — voir controller) ---
    Route::post('/webhooks/kkiapay', [KkiapayWebhookController::class, 'handle'])->middleware('throttle:120,1');

    // --- Formulaire "Contactez-nous" (public) ---
    Route::post('/contact', [ContactMessageController::class, 'store'])->middleware('throttle:5,1');

    // --- Inscription des prestataires de services (plombiers, coiffeuses, informaticiens…) : public ---
    Route::get('/service-providers/professions', [ServiceProviderController::class, 'professions']);
    Route::post('/service-providers', [ServiceProviderController::class, 'store'])->middleware('throttle:5,1');

    // ===== MARCHÉ =====
    // Pouls de la plateforme, public (pas besoin d'un compte pour voir que ça
    // vit) : colis en attente et livreurs disponibles. Volontairement peu
    // détaillé (pas d'adresse exacte, pas de contact) — cf. MarketplaceController.
    Route::prefix('marketplace')->group(function () {
        Route::get('/orders', [MarketplaceController::class, 'orders']);
        Route::get('/deliverers', [MarketplaceController::class, 'deliverers']);
    })->middleware('throttle:60,1');

    // Photo de profil : URL signée temporaire remise par l'API (cf. User::avatar_url).
    Route::get('/avatars/{user}', [AvatarController::class, 'show'])
        ->middleware('signed')
        ->name('avatars.show');

    // Photo d'un colis : URL signée temporaire remise par l'API (cf. Order::photo_url).
    Route::get('/orders/{order}/photo', [OrderPhotoController::class, 'show'])
        ->middleware('signed')
        ->name('orders.photo');
    Route::get('/orders/{order}/delivery-photo', [OrderPhotoController::class, 'delivery'])
        ->middleware('signed')
        ->name('orders.delivery-photo');

    // Notifications push : la clé publique VAPID est publique par nature (le navigateur en a besoin pour s'abonner).
    Route::get('/push/config', [PushSubscriptionController::class, 'config'])->middleware('throttle:60,1');

    // --- Routes authentifiées (Sanctum) ---
    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/push/subscriptions', [PushSubscriptionController::class, 'store'])->middleware('throttle:20,1');
        Route::delete('/push/subscriptions', [PushSubscriptionController::class, 'destroy'])->middleware('throttle:20,1');
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        // Conversation client / livreur d'une commande (la politique "chat" limite aux deux intéressés).
        Route::middleware('role:client,livreur')->group(function () {
            Route::get('/orders/{order}/messages', [OrderMessageController::class, 'index']);
            Route::post('/orders/{order}/messages', [OrderMessageController::class, 'store'])->middleware('throttle:30,1');
        });
        Route::get('/auth/me', [AuthController::class, 'me']);

        // Profil et adresses enregistrées : communs à tous les rôles.
        Route::patch('/profile', [ProfileController::class, 'update']);
        Route::post('/profile/avatar', [AvatarController::class, 'store'])->middleware('throttle:20,1');
        Route::delete('/profile/avatar', [AvatarController::class, 'destroy']);
        Route::put('/profile/password', [ProfileController::class, 'updatePassword'])->middleware('throttle:10,1');
        Route::get('/addresses', [SavedAddressController::class, 'index']);
        Route::post('/addresses', [SavedAddressController::class, 'store'])->middleware('throttle:30,1');
        Route::delete('/addresses/{address}', [SavedAddressController::class, 'destroy']);

        // ===== CLIENT =====
        Route::middleware(['role:client', 'verified.email'])->prefix('client')->group(function () {
            Route::get('/orders', [ClientOrderController::class, 'index']);
            Route::post('/orders/estimate', [ClientOrderController::class, 'estimate']);
            Route::delete('/orders/{order}', [ClientOrderController::class, 'hide']);
            Route::post('/orders/{order}/cancel', [ClientOrderController::class, 'cancel'])->middleware('throttle:20,1');
            Route::post('/orders/{order}/retry-delivery', [ClientDeliveryController::class, 'retry'])->middleware('throttle:10,1');
            Route::post('/orders', [ClientOrderController::class, 'store']);
            Route::post('/orders/batch', [ClientOrderController::class, 'storeBatch'])->middleware('throttle:10,1');
            Route::get('/stats', [ClientOrderController::class, 'stats']);
            Route::get('/service-requests', [ServiceRequestController::class, 'index']);
            Route::post('/service-requests', [ServiceRequestController::class, 'store'])->middleware('throttle:20,1');
            Route::post('/service-requests/{serviceRequest}/cancel', [ServiceRequestController::class, 'cancel']);
            Route::get('/team', [TeamController::class, 'index']);
            Route::post('/team', [TeamController::class, 'store'])->middleware('throttle:20,1');
            Route::patch('/team/{member}', [TeamController::class, 'update']);
            Route::get('/favorites', [FavoriteDelivererController::class, 'index']);
            Route::post('/orders/{order}/favorite', [FavoriteDelivererController::class, 'store']);
            Route::delete('/favorites/{deliverer}', [FavoriteDelivererController::class, 'destroy']);
            Route::get('/recipients', [RecipientController::class, 'index']);
            Route::post('/recipients', [RecipientController::class, 'store'])->middleware('throttle:60,1');
            Route::delete('/recipients/{recipient}', [RecipientController::class, 'destroy']);
            Route::get('/orders/{order}', [ClientOrderController::class, 'show']);
            Route::get('/orders/{order}/track', [ClientOrderController::class, 'track']);
            Route::post('/orders/{order}/payment', [PaymentController::class, 'store'])->middleware('throttle:20,1');
            Route::post('/payments/confirm', [PaymentController::class, 'confirm'])->middleware('throttle:30,1');
            Route::post('/orders/{order}/confirm-delivery', [ClientOrderController::class, 'confirmDelivery'])->middleware('throttle:20,1');
            Route::post('/orders/{order}/report-problem', [ClientOrderController::class, 'reportProblem'])->middleware('throttle:10,1');
            Route::post('/orders/{order}/review', [ClientReviewController::class, 'store'])->middleware('throttle:20,1');
        });

        // ===== LIVREUR =====
        // Dépôt des pièces : accessible dès l'inscription, avant toute validation.
        Route::post('/deliverer/documents', [DocumentController::class, 'store'])
            ->middleware(['role:livreur', 'throttle:10,1']);

        // 'deliverer.verified' bloque tout accès tant que l'admin n'a pas validé le compte
        Route::middleware(['role:livreur', 'verified.email', 'deliverer.verified'])->prefix('deliverer')->group(function () {
            Route::get('/route-plan', [RoutePlanController::class, 'show'])->middleware('throttle:30,1');
            Route::patch('/availability', [AvailabilityController::class, 'update']);
            Route::get('/wallet', [WalletController::class, 'show']);
            Route::patch('/wallet/mobile-money', [WalletController::class, 'updateMobileMoney']);
            Route::get('/reviews', [DelivererReviewController::class, 'index']);
            Route::get('/orders/available', [DelivererOrderController::class, 'available']);
            Route::get('/orders/mine', [DelivererOrderController::class, 'myOrders']);
            Route::post('/orders/{order}/accept', [DelivererOrderController::class, 'accept']);
            Route::post('/orders/{order}/arrived', [DelivererDeliveryController::class, 'arrived'])->middleware('throttle:20,1');
            Route::post('/orders/{order}/cash-collected', [DelivererDeliveryController::class, 'cashCollected'])->middleware('throttle:20,1');
            Route::post('/orders/{order}/deliver', [DelivererDeliveryController::class, 'deliver'])->middleware('throttle:20,1');
            Route::post('/orders/{order}/release', [DelivererDeliveryController::class, 'release'])->middleware('throttle:10,1');
            Route::post('/orders/{order}/unreachable', [DelivererDeliveryController::class, 'unreachable'])->middleware('throttle:10,1');
            Route::patch('/orders/{order}/status', [DelivererOrderController::class, 'updateStatus']);
            Route::post('/orders/{order}/location', [DelivererOrderController::class, 'pushLocation']);
        });

        // ===== PRESTATAIRE =====
        // Les offres de prestation ne s'ouvrent qu'une fois le dossier validé par l'administration.
        Route::middleware(['role:prestataire', 'verified.email', 'provider.approved'])->prefix('provider')->group(function () {
            Route::get('/offers', [ProviderOfferController::class, 'index']);
            Route::get('/offers/mine', [ProviderOfferController::class, 'mine']);
            Route::post('/offers/{serviceRequest}/accept', [ProviderOfferController::class, 'accept'])->middleware('throttle:30,1');
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
            Route::get('/documents/{document}', [DelivererValidationController::class, 'document']);

            Route::get('/deliverers', [AdminDelivererController::class, 'index']);
            Route::get('/deliverers/{deliverer}', [AdminDelivererController::class, 'show'])->whereNumber('deliverer');
            Route::get('/users', [AdminUserController::class, 'index']);
            Route::patch('/users/{user}', [AdminUserController::class, 'update']);
            Route::put('/users/{user}/tariff', [AdminUserController::class, 'setTariff']);
            Route::delete('/users/{user}/tariff', [AdminUserController::class, 'clearTariff']);
            Route::get('/orders', [AdminOrderController::class, 'index']);
            Route::post('/orders/{order}/cancel', [AdminOrderController::class, 'cancel']);
            Route::get('/finance/summary', [FinanceController::class, 'summary']);
            Route::get('/finance/commissions', [FinanceController::class, 'commissions']);
            Route::get('/finance/payouts', [FinanceController::class, 'payouts']);
            Route::get('/finance/refunds', [FinanceController::class, 'refunds']);
            Route::post('/finance/refunds/{transaction}/done', [FinanceController::class, 'refundDone']);
            Route::post('/finance/payouts/{payout}/pay', [FinanceController::class, 'payPayout']);
            Route::post('/finance/payouts/{payout}/cancel', [FinanceController::class, 'cancelPayout']);
            Route::post('/finance/payouts/run', [FinanceController::class, 'runPayouts'])->middleware('throttle:5,1');
            Route::get('/finance/settings', [FinanceController::class, 'settings']);
            Route::put('/finance/settings', [FinanceController::class, 'updateSettings']);
            Route::get('/tariff', [TariffController::class, 'show']);
            Route::put('/tariff', [TariffController::class, 'update']);

            Route::get('/service-providers', [AdminServiceProviderController::class, 'index']);
            Route::post('/service-providers/{serviceProvider}/approve', [AdminServiceProviderController::class, 'approve']);
            Route::post('/service-providers/{serviceProvider}/reject', [AdminServiceProviderController::class, 'reject']);

            Route::get('/messages', [AdminContactMessageController::class, 'index']);
            Route::patch('/messages/{contactMessage}/status', [AdminContactMessageController::class, 'updateStatus']);

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
