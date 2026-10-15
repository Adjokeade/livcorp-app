<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Http\Requests\Client\EstimateOrderRequest;
use App\Http\Requests\Client\StoreOrderRequest;
use App\Models\Deliverer;
use App\Models\Dispute;
use App\Models\Order;
use App\Services\AuditLogService;
use App\Services\GeolocationService;
use App\Services\KkiapayService;
use App\Services\OnlinePaymentService;
use App\Notifications\DeliveryConfirmed;
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

    public function __construct(
        private readonly GeolocationService $geo,
        private readonly ParcelPhotoService $photos,
        private readonly OnlinePaymentService $payments,
        private readonly OrderDispatchService $dispatch,
        private readonly KkiapayService $kkiapay,
        private readonly OrderStatusService $statusService,
        private readonly AuditLogService $auditLog,
    ) {}

    private const PAYMENT_UNAVAILABLE = 'Le paiement en ligne est momentanément indisponible : la livraison ne peut pas être publiée pour le moment. Réessayez dans quelques instants.';

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

    /**
     * Création d'une livraison : elle est payée tout de suite (en ligne), l'argent reste bloqué chez LIV corp jusqu'à la
     * confirmation de réception. Tant qu'elle n'est pas payée elle reste invisible des livreurs. La réponse contient donc
     * le paiement à ouvrir dans le widget KKiaPay.
     */
    public function store(StoreOrderRequest $request)
    {
        $validated = $request->validated();
        $cash = ($validated['payment_method'] ?? 'en_ligne') === 'especes';

        // Pas de livraison « fantôme » impossible à payer : on refuse avant de créer quoi que ce soit.
        if (! $cash && ! $this->kkiapay->isConfigured()) {
            return response()->json(['message' => self::PAYMENT_UNAVAILABLE], 502);
        }

        // La distance est toujours recalculée ici, jamais reprise du client.
        $route = $this->routeFor($validated);
        $order = $this->createOrder($request->user(), $validated, $route, $request->file('photo'));

        // En espèces : rien à payer maintenant, la livraison est publiée tout de suite (le livreur encaissera au retrait).
        if ($cash) {
            rescue(fn () => $this->dispatch->publish($order));

            return response()->json(['order' => $order->fresh()], 201);
        }

        $transaction = $this->payments->start(collect([$order]));

        return response()->json([
            'order' => $order->fresh(),
            'payment' => $this->payments->widgetPayload($transaction, $request->user()),
        ], 201);
    }

    /**
     * Envoi en lot (entreprises) : plusieurs destinataires depuis un même point de départ. Chaque
     * livraison suit les mêmes règles qu'une commande unique (photo, prix, adresses localisées) et le
     * lot est tout ou rien : une seule ligne invalide, et rien n'est créé.
     */
    public function storeBatch(Request $request)
    {
        abort_unless($request->user()->account_type === 'entreprise', 403, 'L\'envoi en lot est réservé aux comptes entreprise.');

        $cash = $request->input('payment_method') === 'especes';
        if (! $cash && ! $this->kkiapay->isConfigured()) {
            return response()->json(['message' => self::PAYMENT_UNAVAILABLE], 502);
        }

        $shared = ['pickup_address', 'pickup_lat', 'pickup_lng', 'pickup_details', 'favorites_first', 'payment_method'];
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

        if ($cash) {
            $created->each(fn (Order $o) => rescue(fn () => $this->dispatch->publish($o)));

            return response()->json(['orders' => $created->map->fresh()->values()], 201);
        }

        // Un seul paiement couvre tout l'envoi : le total s'ouvre dans un seul widget.
        $transaction = $this->payments->start($created);

        return response()->json([
            'orders' => $created->map->fresh()->values(),
            'payment' => $this->payments->widgetPayload($transaction, $request->user()),
        ], 201);
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
            ->whereIn('status', [Order::STATUS_CREEE, Order::STATUS_ACCEPTEE, Order::STATUS_COLIS_RECUPERE, Order::STATUS_EN_COURS_LIVRAISON, Order::STATUS_REMISE, Order::STATUS_LITIGE])
            ->count();
        $toReview = $request->user()->visibleOrders()
            ->where('status', Order::STATUS_LIVREE)->whereDoesntHave('review')->count();

        return response()->json([
            'in_progress' => $open,
            'to_review' => $toReview,
            // Colis remis dont l'expéditeur doit confirmer la réception (l'argent du livreur en dépend).
            'to_confirm' => $request->user()->visibleOrders()->where('status', Order::STATUS_REMISE)->count(),
            'to_pay' => $request->user()->visibleOrders()->where('status', Order::STATUS_CREEE)->where('payment_status', '!=', 'paye')
                ->where(fn ($q) => $q->whereNull('payment_method')->orWhere('payment_method', '!=', 'especes'))->count(),
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

        // La livraison est créée NON payée (donc invisible des livreurs) : le paiement qui suit la publie (OnlinePaymentService).
        // Plus de code de remise : le livreur envoie une photo de réception, que l'expéditeur confirme.
        $order = Order::create([
            ...collect($validated)->except('photo', 'favorites_first', 'payment_method')->all(),
            'payment_method' => ($validated['payment_method'] ?? 'en_ligne') === 'especes' ? 'especes' : null,
            'priority_until' => $favoritesFirst ? now()->addMinutes(OrderDispatchService::PRIORITY_MINUTES) : null,
            'priority_owner_id' => $favoritesFirst ? $priorityOwner : null,
            'reference' => 'LIV-'.now()->format('Y').'-'.strtoupper(Str::random(6)),
            'client_id' => $user->id,
            'photo_path' => $photoPath,
            'distance_km' => $route['distance_km'],
            'duration_min' => $route['duration_min'],
            'price_suggested' => $suggested,
            'price' => $price,
            'initial_price' => $price,
            'status' => Order::STATUS_CREEE,
            'payment_status' => 'en_attente',
        ]);

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

            // Le livreur a déjà encaissé les espèces : annuler obligerait à les rendre à la main, on passe par l'équipe.
            if ($locked->isCash() && $locked->isPaid()) {
                return ['error' => 'Le livreur a déjà encaissé vos espèces : la commande ne peut plus être annulée ici. Contactez-nous.'];
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

        // L'argent bloqué chez LIV corp est rendu au client ; une livraison jamais payée ferme simplement sa tentative de paiement.
        $this->payments->cancelUnpaid($outcome['order']);
        $refund = $this->payments->refundOrder($outcome['order'], 'Annulée par le client');

        return response()->json(['order' => $outcome['order']->fresh([...Order::DELIVERER_PUBLIC, 'statusHistory'])->maskContacts(), 'refund' => $refund]);
    }

    /**
     * Confirmation de réception par l'EXPÉDITEUR (le destinataire n'a pas forcément l'application) : il a vu la photo de
     * réception envoyée par le livreur. L'argent bloqué devient alors un solde pour le livreur.
     */
    public function confirmDelivery(Request $request, Order $order)
    {
        $this->authorize('view', $order);

        $outcome = DB::transaction(function () use ($order) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== Order::STATUS_REMISE) {
                return ['error' => $locked->status === Order::STATUS_LIVREE
                    ? 'Cette livraison est déjà confirmée.'
                    : 'Il n\'y a rien à confirmer : le livreur n\'a pas encore remis le colis.'];
            }

            $this->statusService->transitionTo($locked, Order::STATUS_LIVREE, 'Réception confirmée par l\'expéditeur');

            return ['order' => $locked->fresh()];
        });

        if (isset($outcome['error'])) {
            return response()->json(['message' => $outcome['error']], 422);
        }

        $this->auditLog->log('order.delivery_confirmed', $outcome['order'], ['by' => 'client']);
        rescue(fn () => $outcome['order']->deliverer?->user?->notify(new DeliveryConfirmed($outcome['order'])));

        return response()->json(['order' => $outcome['order']->fresh([...Order::DELIVERER_PUBLIC, 'statusHistory'])->maskContacts()]);
    }

    /**
     * Problème signalé à la réception (colis absent, abîmé, photo douteuse…) : la livraison passe en litige, l'argent reste
     * bloqué chez LIV corp et l'administration tranche (remboursement du client ou paiement du livreur).
     */
    public function reportProblem(Request $request, Order $order)
    {
        $this->authorize('view', $order);

        $validated = $request->validate([
            'reason' => 'required|in:colis_endommage,colis_non_livre,autre',
            'description' => 'required|string|min:5|max:1000',
        ], ['description.required' => 'Décrivez le problème en quelques mots.', 'description.min' => 'Décrivez le problème en quelques mots.']);

        $outcome = DB::transaction(function () use ($order, $validated, $request) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== Order::STATUS_REMISE) {
                return ['error' => 'Un problème ne se signale qu\'une fois le colis remis, avant de confirmer la réception.'];
            }

            Dispute::create([
                'order_id' => $locked->id,
                'raised_by' => $request->user()->id,
                'reason' => $validated['reason'],
                'description' => $validated['description'],
                'status' => 'ouvert',
            ]);
            $this->statusService->transitionTo($locked, Order::STATUS_LITIGE, 'Problème signalé à la réception');

            return ['order' => $locked->fresh()];
        });

        if (isset($outcome['error'])) {
            return response()->json(['message' => $outcome['error']], 422);
        }

        $this->auditLog->log('order.problem_reported', $outcome['order'], ['reason' => $validated['reason']]);

        return response()->json(['order' => $outcome['order']->fresh([...Order::DELIVERER_PUBLIC, 'statusHistory'])->maskContacts()]);
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
