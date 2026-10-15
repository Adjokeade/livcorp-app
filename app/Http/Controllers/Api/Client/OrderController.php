<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Http\Requests\Client\EstimateOrderRequest;
use App\Http\Requests\Client\StoreOrderRequest;
use App\Jobs\OpenOrderToAllDeliverers;
use App\Models\Deliverer;
use App\Models\Order;
use App\Services\GeolocationService;
use App\Notifications\OrderCancelledByClient;
use App\Services\OrderDispatchService;
use App\Services\OrderStatusService;
use App\Services\ParcelPhotoService;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
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
    private const MAX_BATCH = 10;

    /** Durée pendant laquelle une course « d'abord aux favoris » leur est réservée. */
    private const PRIORITY_MINUTES = 10;

    public function __construct(
        private readonly GeolocationService $geo,
        private readonly ParcelPhotoService $photos,
        private readonly OrderDispatchService $dispatch,
        private readonly OrderStatusService $statusService,
    ) {}

    public function index(Request $request)
    {
        return $request->user()
            ->visibleOrders()
            ->whereNull('client_hidden_at')
            ->with([...Order::DELIVERER_PUBLIC, 'merchant', 'transaction', 'review:id,order_id,rating', 'client:id,first_name,last_name'])
            ->withCount([
                'messages as unread_messages_count' => fn ($q) => $q->whereIn('sender_id', Deliverer::select('user_id')->whereColumn('deliverers.id', 'orders.deliverer_id'))->whereNull('read_at')->whereColumn('order_messages.deliverer_id', 'orders.deliverer_id'),
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
            // Prix imposés par LIV corp selon la distance (tarif négocié de l'entreprise si elle en a un).
            'suggested_prices' => [
                'standard' => $this->geo->priceFor($request->user(), $route['distance_km'], 'standard'),
                'express' => $this->geo->priceFor($request->user(), $route['distance_km'], 'express'),
            ],
            'estimated_price' => $this->geo->priceFor($request->user(), $route['distance_km'], $validated['urgency'] ?? 'standard'),
            'negotiated_tariff' => GeolocationService::tariffFor($request->user()) !== GeolocationService::tariff(),
            'min_price' => (int) config('services.orders.min_price'),
        ]);
    }

    public function store(StoreOrderRequest $request)
    {
        $validated = $request->validated();

        // La distance est toujours recalculée ici, jamais reprise du client.
        $route = $this->routeFor($validated);
        $order = $this->createOrder($request->user(), $validated, $route, $request->file('photo'));

        return response()->json(['order' => $order], 201);
    }

    /**
     * Envoi en lot (entreprises) : plusieurs destinataires depuis un même point de départ. Chaque
     * livraison suit les mêmes règles qu'une commande unique (photo, prix, adresses localisées) et le
     * lot est tout ou rien : une seule ligne invalide, et rien n'est créé.
     */
    public function storeBatch(Request $request)
    {
        abort_unless($request->user()->account_type === 'entreprise', 403, 'L\'envoi en lot est réservé aux comptes entreprise.');

        $shared = ['pickup_address', 'pickup_lat', 'pickup_lng', 'pickup_details', 'favorites_first'];
        $rules = ['orders' => 'required|array|min:1|max:'.self::MAX_BATCH];
        foreach ((new StoreOrderRequest)->rules() as $field => $rule) {
            if ($field === 'merchant_id') {
                continue;
            }
            $key = in_array($field, $shared, true) ? $field : "orders.*.{$field}";
            $rules[$key] = is_string($rule) ? str_replace('required_if:type', 'required_if:orders.*.type', $rule) : $rule;
        }
        $validated = $request->validate($rules, [
            'orders.*.photo.required_if' => 'Ajoutez une photo du colis.',
            'orders.*.photo.max' => 'Cette photo est trop lourde (8 Mo maximum).',
        ]);

        // Itinéraires d'abord, création ensuite : on signale toutes les lignes en erreur d'un coup.
        $routes = [];
        $errors = [];
        foreach ($validated['orders'] as $i => $row) {
            try {
                $routes[$i] = $this->routeFor(Arr::only($validated, $shared) + $row);
            } catch (ValidationException $e) {
                foreach ($e->errors() as $field => $messages) {
                    $errors["orders.{$i}.{$field}"] = $messages;
                }
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        $created = DB::transaction(function () use ($request, $validated, $routes, $shared) {
            return collect($validated['orders'])->map(function ($row, $i) use ($request, $validated, $routes, $shared) {
                $data = Arr::only($validated, $shared) + Arr::except($row, 'photo');

                return $this->createOrder($request->user(), $data, $routes[$i], $request->file("orders.{$i}.photo"));
            });
        });

        return response()->json(['orders' => $created], 201);
    }

    /** Statistiques d'activité de l'expéditeur : mois en cours, mois précédent, six derniers mois. */
    public function stats(Request $request)
    {
        $start = now()->startOfMonth()->subMonths(5);
        $orders = $request->user()->visibleOrders()
            ->where('created_at', '>=', $start)
            ->get(['id', 'status', 'price', 'created_at']);

        $summary = function ($set) {
            $delivered = $set->where('status', Order::STATUS_LIVREE);
            $cancelled = $set->where('status', Order::STATUS_ANNULEE)->count();
            $closed = $delivered->count() + $cancelled;

            return [
                'total' => $set->count(),
                'delivered' => $delivered->count(),
                'cancelled' => $cancelled,
                'spent' => (int) $delivered->sum('price'),
                'success_rate' => $closed > 0 ? round($delivered->count() / $closed * 100) : null,
            ];
        };

        $thisMonth = now()->startOfMonth();
        $inMonth = fn ($month) => $orders->filter(fn ($o) => $o->created_at->isSameMonth($month));

        $history = collect(range(5, 0))->map(function ($ago) use ($thisMonth, $inMonth) {
            $month = $thisMonth->copy()->subMonths($ago);

            return ['month' => $month->format('Y-m'), 'total' => $inMonth($month)->count()];
        })->values();

        $open = $request->user()->visibleOrders()
            ->whereIn('status', [Order::STATUS_CREEE, Order::STATUS_ACCEPTEE, Order::STATUS_COLIS_RECUPERE, Order::STATUS_EN_COURS_LIVRAISON, Order::STATUS_LITIGE])
            ->count();
        $toReview = $request->user()->visibleOrders()
            ->where('status', Order::STATUS_LIVREE)->whereDoesntHave('review')->count();

        return response()->json([
            'in_progress' => $open,
            'to_review' => $toReview,
            'this_month' => $summary($inMonth($thisMonth)),
            'last_month' => $summary($inMonth($thisMonth->copy()->subMonth())),
            'history' => $history,
        ]);
    }

    /** @param array<string, mixed> $validated @param array<string, mixed> $route */
    private function createOrder($user, array $validated, array $route, ?UploadedFile $photo): Order
    {
        $urgency = $validated['urgency'] ?? 'standard';
        // Prix imposé : jamais celui reçu du client. `price_suggested` garde le barème standard pour mémoire
        // (l'écart avec `price` montre une remise négociée).
        $price = $this->geo->priceFor($user, $route['distance_km'], $urgency);
        $suggested = $this->geo->estimatePrice($route['distance_km'], $urgency);
        $photoPath = $photo ? $this->photos->store($photo) : null;

        // « D'abord à mes favoris » : sans effet si l'expéditeur n'a encore aucun livreur favori.
        $priorityOwner = $user->companyOwnerId();
        $favoritesFirst = ! empty($validated['favorites_first'])
            && DB::table('favorite_deliverers')->where('user_id', $priorityOwner)->exists();

        // Aucun paiement à la commande : le client règle à la réception du colis, devant le
        // livreur (cf. PaymentController), au prix imposé ci-dessus.
        $order = Order::create([
            ...collect($validated)->except('photo', 'favorites_first')->all(),
            'priority_until' => $favoritesFirst ? now()->addMinutes(self::PRIORITY_MINUTES) : null,
            'priority_owner_id' => $favoritesFirst ? $priorityOwner : null,
            'reference' => 'LIV-'.now()->format('Y').'-'.strtoupper(Str::random(6)),
            'client_id' => $user->id,
            'photo_path' => $photoPath,
            'distance_km' => $route['distance_km'],
            'duration_min' => $route['duration_min'],
            'price_suggested' => $suggested,
            'price' => $price,
            'initial_price' => $price,
            // Code de remise : le destinataire le donne au livreur à la réception, c'est ce qui prouve la livraison.
            'delivery_code' => (string) random_int(1000, 9999),
            'status' => Order::STATUS_CREEE,
            'payment_status' => 'en_attente',
        ]);

        // Les livreurs disponibles à proximité sont prévenus tout de suite (notification push).
        if ($favoritesFirst) {
            $this->dispatch->notifyNearbyDeliverers($order, 'favorites');
            OpenOrderToAllDeliverers::dispatch($order)->delay($order->priority_until);
        } else {
            $this->dispatch->notifyNearbyDeliverers($order);
        }

        return $order;
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
        ])->loadCount(['messages as unread_messages_count' => fn ($q) => $q->whereIn('sender_id', Deliverer::select('user_id')->whereColumn('deliverers.id', 'orders.deliverer_id'))->whereNull('read_at')->whereColumn('order_messages.deliverer_id', 'orders.deliverer_id')]);

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

            $this->statusService->transitionTo(
                $locked,
                Order::STATUS_ANNULEE,
                $reason !== '' ? "Annulée par le client : {$reason}" : 'Annulée par le client',
            );

            return ['order' => $locked->fresh([...Order::DELIVERER_PUBLIC, 'statusHistory'])->maskContacts(), 'assigned' => $assigned];
        });

        if (isset($outcome['error'])) {
            return response()->json(['message' => $outcome['error']], 422);
        }

        // Après validation de l'annulation : le livreur assigné, s'il y en avait un, est prévenu.
        if ($outcome['assigned']) {
            rescue(fn () => $outcome['assigned']->notify(new OrderCancelledByClient($outcome['order'], wasAssigned: true)));
        }

        return response()->json(['order' => $outcome['order']]);
    }

    /**
     * « Retirer » une demande annulée de sa liste. Une demande encore active doit d'abord être annulée :
     * on ne fait pas disparaître une livraison en cours de la vue de l'expéditeur.
     */
    public function hide(Request $request, Order $order)
    {
        $this->authorize('view', $order);

        abort_if($order->status !== Order::STATUS_ANNULEE, 422, 'Annulez d\'abord cette demande pour pouvoir la retirer de votre liste.');

        $order->forceFill(['client_hidden_at' => now()])->save();

        return response()->noContent();
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
