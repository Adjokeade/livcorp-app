<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Http\Requests\Client\EstimateOrderRequest;
use App\Http\Requests\Client\StoreOrderRequest;
use App\Models\Order;
use App\Services\GeolocationService;
use App\Notifications\OrderCancelledByClient;
use App\Services\OrderDispatchService;
use App\Services\OrderStatusService;
use App\Services\ParcelPhotoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Gestion des commandes côté client (envoi de colis / demande de courses).
 * Routes protégées par : auth:sanctum, role:client, verified.email (cf. routes/api.php)
 * Autorisation fine par ressource déléguée à OrderPolicy (défense en profondeur).
 */
class OrderController extends Controller
{
    public function __construct(
        private readonly GeolocationService $geo,
        private readonly ParcelPhotoService $photos,
        private readonly OrderDispatchService $dispatch,
        private readonly OrderStatusService $statusService,
    ) {}

    public function index(Request $request)
    {
        return $request->user()
            ->ordersAsClient()
            ->with([...Order::DELIVERER_PUBLIC, 'merchant', 'transaction', 'review:id,order_id,rating'])
            ->withCount([
                'offers as pending_offers_count' => fn ($q) => $q->where('status', 'pending'),
                'messages as unread_messages_count' => fn ($q) => $q->where('sender_id', '!=', $request->user()->id)->whereNull('read_at')->whereColumn('order_messages.deliverer_id', 'orders.deliverer_id'),
            ])
            ->latest()
            ->paginate(15)
            ->through(fn (Order $order) => $order->maskContacts());
    }

    /**
     * Distance routière, durée, tracé et prix conseillés pour un trajet. Le prix conseillé n'est
     * qu'un repère : c'est le client qui fixe le sien (cf. store).
     */
    public function estimate(EstimateOrderRequest $request)
    {
        $validated = $request->validated();
        $route = $this->routeFor($validated);

        return response()->json([
            'distance_km' => $route['distance_km'],
            'duration_min' => $route['duration_min'],
            'distance_source' => $route['source'], // 'route' (réelle) ou 'approx' (service d'itinéraires indisponible)
            'route' => $route['geometry'],
            'suggested_prices' => [
                'standard' => $this->geo->estimatePrice($route['distance_km'], 'standard'),
                'express' => $this->geo->estimatePrice($route['distance_km'], 'express'),
            ],
            'estimated_price' => $this->geo->estimatePrice($route['distance_km'], $validated['urgency'] ?? 'standard'),
            'min_price' => (int) config('services.orders.min_price'),
        ]);
    }

    public function store(StoreOrderRequest $request)
    {
        $validated = $request->validated();

        // La distance est toujours recalculée ici, jamais reprise du client.
        $route = $this->routeFor($validated);
        $suggested = $this->geo->estimatePrice($route['distance_km'], $validated['urgency'] ?? 'standard');

        $photoPath = $request->hasFile('photo') ? $this->photos->store($request->file('photo')) : null;

        // Aucun paiement à la commande : le client règle à la réception du colis, devant le
        // livreur (cf. PaymentController). Le prix est celui que le client a fixé ; le livreur
        // peut proposer un autre montant, que le client accepte ou non (cf. OfferController).
        $order = Order::create([
            ...collect($validated)->except('photo')->all(),
            'reference' => 'LIV-'.now()->format('Y').'-'.strtoupper(Str::random(6)),
            'client_id' => $request->user()->id,
            'photo_path' => $photoPath,
            'distance_km' => $route['distance_km'],
            'duration_min' => $route['duration_min'],
            'price_suggested' => $suggested,
            'initial_price' => $validated['price'],
            // Code de remise : le destinataire le donne au livreur à la réception, c'est ce qui prouve la livraison.
            'delivery_code' => (string) random_int(1000, 9999),
            'status' => Order::STATUS_CREEE,
            'payment_status' => 'en_attente',
        ]);

        // Les livreurs disponibles à proximité sont prévenus tout de suite (notification push).
        $this->dispatch->notifyNearbyDeliverers($order);

        return response()->json(['order' => $order], 201);
    }

    public function show(Request $request, Order $order)
    {
        $this->authorize('view', $order);

        $order->load([
            ...Order::DELIVERER_PUBLIC,
            'merchant',
            'statusHistory',
            'transaction',
            'review',
            // Offres en attente : on n'expose du livreur que ce qui aide à choisir (prénom, note, expérience).
            'offers' => fn ($q) => $q->where('status', 'pending')
                ->with(['deliverer:id,user_id,average_rating,total_deliveries', 'deliverer.user:id,first_name'])
                ->latest(),
        ])->loadCount(['messages as unread_messages_count' => fn ($q) => $q->where('sender_id', '!=', $order->client_id)->whereNull('read_at')->whereColumn('order_messages.deliverer_id', 'orders.deliverer_id')]);

        // Le code de remise n'est utile qu'au client, tant que la livraison n'est pas terminée.
        if (! in_array($order->status, [Order::STATUS_LIVREE, Order::STATUS_ANNULEE], true)) {
            $order->makeVisible('delivery_code');
        }

        return $order->maskContacts();
    }

    /**
     * Annulation par le client, possible tant que le livreur n'a pas récupéré le colis (commande libre ou
     * déjà acceptée). Ensuite le colis est entre les mains du livreur : ce n'est plus une annulation mais un
     * litige, à traiter avec l'équipe.
     */
    public function cancel(Request $request, Order $order)
    {
        $this->authorize('view', $order);

        $validated = $request->validate(['reason' => 'nullable|string|max:300']);
        $reason = trim((string) ($validated['reason'] ?? ''));

        $outcome = DB::transaction(function () use ($order, $reason) {
            // Verrou : si le livreur valide "colis récupéré" au même instant, un seul des deux l'emporte.
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($locked->status === Order::STATUS_ANNULEE) {
                return ['error' => 'Cette commande est déjà annulée.'];
            }
            if (! in_array($locked->status, [Order::STATUS_CREEE, Order::STATUS_ACCEPTEE], true)) {
                return ['error' => 'Le livreur a déjà récupéré le colis : la commande ne peut plus être annulée. En cas de problème, contactez-nous.'];
            }

            $assigned = $locked->deliverer?->user;
            $bidders = $locked->offers()->where('status', 'pending')->with('deliverer.user')->get()
                ->map(fn ($offer) => $offer->deliverer->user)
                ->reject(fn ($user) => $assigned && $user->id === $assigned->id);
            $locked->offers()->where('status', 'pending')->update(['status' => 'declined']);

            $this->statusService->transitionTo(
                $locked,
                Order::STATUS_ANNULEE,
                $reason !== '' ? "Annulée par le client : {$reason}" : 'Annulée par le client',
            );

            return ['order' => $locked->fresh([...Order::DELIVERER_PUBLIC, 'statusHistory'])->maskContacts(), 'assigned' => $assigned, 'bidders' => $bidders];
        });

        if (isset($outcome['error'])) {
            return response()->json(['message' => $outcome['error']], 422);
        }

        // Après validation de l'annulation : le livreur (ou ceux qui avaient fait une proposition) est prévenu.
        if ($outcome['assigned']) {
            rescue(fn () => $outcome['assigned']->notify(new OrderCancelledByClient($outcome['order'], wasAssigned: true)));
        }
        foreach ($outcome['bidders'] as $bidder) {
            rescue(fn () => $bidder->notify(new OrderCancelledByClient($outcome['order'], wasAssigned: false)));
        }

        return response()->json(['order' => $outcome['order']]);
    }

    /**
     * Suivi du colis : dernière position du livreur, sa trace récente, où il va (départ ou destination),
     * et le temps restant. Toujours 200 : "pas encore de position" est un état normal (le livreur n'a pas
     * encore partagé la sienne), pas une erreur.
     */
    public function track(Request $request, Order $order)
    {
        $this->authorize('track', $order);

        $points = $order->trackingPoints()->latest('recorded_at')->limit(60)->get()->reverse()->values();
        $last = $points->last();

        // Où va le livreur : vers le point de collecte tant qu'il n'a pas le colis, puis vers la destination.
        $target = match ($order->status) {
            Order::STATUS_ACCEPTEE => 'pickup',
            Order::STATUS_COLIS_RECUPERE, Order::STATUS_EN_COURS_LIVRAISON => 'dropoff',
            default => null,
        };

        $eta = null;
        if ($last && $target) {
            $straight = $this->geo->distanceInKm(
                (float) $last->lat, (float) $last->lng,
                (float) $order->{$target.'_lat'}, (float) $order->{$target.'_lng'},
            );

            if ($straight < 0.1) {
                // À moins de 100 m à vol d'oiseau : arrivé. L'itinéraire routier ferait parfois un détour de
                // 100 à 200 m (sens unique) et annoncerait encore "1 min" à un client qui voit son livreur devant chez lui.
                $eta = ['distance_km' => round($straight, 2), 'duration_min' => 0, 'source' => 'route'];
            } else {
                // Un appel d'itinéraire par relecture (toutes les 5 s) surchargerait le service : on garde 20 s.
                $eta = Cache::remember("eta:{$order->id}:{$order->status}", 20, fn () => $this->geo->route(
                    (float) $last->lat, (float) $last->lng,
                    (float) $order->{$target.'_lat'}, (float) $order->{$target.'_lng'},
                ));
            }
        }

        $age = $last ? max(0, now()->timestamp - $last->recorded_at->timestamp) : null;

        return response()->json([
            'position' => $last ? ['lat' => (float) $last->lat, 'lng' => (float) $last->lng, 'recorded_at' => $last->recorded_at, 'age_seconds' => $age] : null,
            'trail' => $points->map(fn ($p) => [(float) $p->lat, (float) $p->lng])->all(),
            'target' => $target,
            'distance_km' => $eta['distance_km'] ?? null,
            'eta_min' => $eta['duration_min'] ?? null,
            'distance_source' => $eta['source'] ?? null,
            // La position est "fraîche" tant qu'elle a moins de 90 s : au-delà, le livreur a sans doute perdu le réseau
            // ou fermé l'application, et l'afficher comme actuelle tromperait le client.
            'sharing' => $age !== null && $age < 90,
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{distance_km: float, duration_min: int, geometry: array, source: string}
     */
    private function routeFor(array $data): array
    {
        $route = $this->geo->route(
            (float) $data['pickup_lat'], (float) $data['pickup_lng'],
            (float) $data['dropoff_lat'], (float) $data['dropoff_lng'],
        );

        if ($route['distance_km'] < config('services.orders.min_distance_km')) {
            throw ValidationException::withMessages([
                'dropoff_lat' => 'Le point de départ et la destination sont identiques. Vérifiez vos adresses.',
            ]);
        }

        if ($route['distance_km'] > config('services.orders.max_distance_km')) {
            throw ValidationException::withMessages([
                'dropoff_lat' => 'Ce trajet dépasse '.config('services.orders.max_distance_km').' km : vérifiez vos adresses.',
            ]);
        }

        return $route;
    }
}
