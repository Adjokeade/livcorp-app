<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Http\Requests\Client\EstimateOrderRequest;
use App\Http\Requests\Client\StoreOrderRequest;
use App\Models\Order;
use App\Services\FedaPayService;
use App\Services\GeolocationService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Gestion des commandes côté client (envoi de colis / demande de courses).
 * Routes protégées par : auth:sanctum, role:client, verified.email (cf. routes/api.php)
 * Autorisation fine par ressource déléguée à OrderPolicy (défense en profondeur).
 */
class OrderController extends Controller
{
    public function __construct(
        private readonly GeolocationService $geo,
        private readonly FedaPayService $fedapay,
    ) {}

    public function index(Request $request)
    {
        return $request->user()
            ->ordersAsClient()
            ->with(['deliverer.user', 'merchant', 'transaction'])
            ->latest()
            ->paginate(15);
    }

    public function estimate(EstimateOrderRequest $request)
    {
        $validated = $request->validated();

        $distance = $this->geo->distanceInKm(
            $validated['pickup_lat'], $validated['pickup_lng'],
            $validated['dropoff_lat'], $validated['dropoff_lng'],
        );

        $price = $this->geo->estimatePrice($distance, $validated['urgency'] ?? 'standard');

        return response()->json(['distance_km' => $distance, 'estimated_price' => $price]);
    }

    public function store(StoreOrderRequest $request)
    {
        $validated = $request->validated();

        $distance = $this->geo->distanceInKm(
            $validated['pickup_lat'], $validated['pickup_lng'],
            $validated['dropoff_lat'], $validated['dropoff_lng'],
        );
        $price = $this->geo->estimatePrice($distance, $validated['urgency'] ?? 'standard');

        $order = Order::create([
            ...$validated,
            'reference' => 'LIV-'.now()->format('Y').'-'.strtoupper(Str::random(6)),
            'client_id' => $request->user()->id,
            'distance_km' => $distance,
            'price' => $price,
            'status' => Order::STATUS_CREEE,
            'payment_status' => 'en_attente',
        ]);

        // Création de la transaction FedaPay ; le frontend récupère l'URL de paiement dans la réponse
        $transaction = $this->fedapay->createTransactionForOrder($order);

        return response()->json([
            'order' => $order,
            'payment' => $transaction,
        ], 201);
    }

    public function show(Request $request, Order $order)
    {
        $this->authorize('view', $order);

        return $order->load(['deliverer.user', 'merchant', 'statusHistory', 'transaction', 'review']);
    }

    public function track(Request $request, Order $order)
    {
        $this->authorize('track', $order);

        return $order->trackingPoints()->latest('recorded_at')->first()
            ?? response()->json(['message' => 'Aucune position disponible pour le moment.'], 404);
    }
}
