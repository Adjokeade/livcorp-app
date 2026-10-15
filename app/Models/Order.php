<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\URL;

class Order extends Model
{
    use HasFactory;

    // Cycle de vie officiel d'une commande (machine à états)
    public const STATUS_CREEE = 'creee';
    public const STATUS_ACCEPTEE = 'acceptee';
    public const STATUS_COLIS_RECUPERE = 'colis_recupere';
    public const STATUS_EN_COURS_LIVRAISON = 'en_cours_livraison';
    // Colis remis et photo de réception envoyée : l'argent reste bloqué jusqu'à la confirmation de l'expéditeur.
    public const STATUS_REMISE = 'remise';
    public const STATUS_LIVREE = 'livree';
    public const STATUS_ANNULEE = 'annulee';
    public const STATUS_LITIGE = 'litige';

    // Transitions autorisées : clé = statut actuel, valeur = statuts suivants possibles
    public const ALLOWED_TRANSITIONS = [
        self::STATUS_CREEE => [self::STATUS_ACCEPTEE, self::STATUS_ANNULEE],
        // ACCEPTEE -> CREEE : désistement du livreur avant le retrait, la course repart en circulation.
        self::STATUS_ACCEPTEE => [self::STATUS_COLIS_RECUPERE, self::STATUS_ANNULEE, self::STATUS_CREEE],
        self::STATUS_COLIS_RECUPERE => [self::STATUS_EN_COURS_LIVRAISON, self::STATUS_LITIGE],
        self::STATUS_EN_COURS_LIVRAISON => [self::STATUS_REMISE, self::STATUS_LITIGE],
        // REMISE -> LIVREE : confirmation de l'expéditeur (ou automatique après le délai). REMISE -> LITIGE : problème signalé.
        self::STATUS_REMISE => [self::STATUS_LIVREE, self::STATUS_LITIGE],
        self::STATUS_LIVREE => [self::STATUS_LITIGE],
        self::STATUS_ANNULEE => [],
        // LITIGE -> EN_COURS_LIVRAISON : nouvelle tentative de remise demandée par le client.
        self::STATUS_LITIGE => [self::STATUS_LIVREE, self::STATUS_ANNULEE, self::STATUS_EN_COURS_LIVRAISON],
    ];

    protected $fillable = [
        'reference', 'type', 'client_id', 'merchant_id', 'deliverer_id',
        'pickup_address', 'pickup_lat', 'pickup_lng', 'pickup_details',
        'dropoff_address', 'dropoff_lat', 'dropoff_lng', 'dropoff_details',
        'recipient_name', 'recipient_phone',
        'package_type', 'instructions', 'photo_path', 'urgency', 'distance_km', 'duration_min',
        'price', 'initial_price', 'price_suggested', 'commission_amount', 'deliverer_payout',
        'status', 'payment_status', 'payment_method', 'paid_at', 'handed_over_at', 'transaction_id',
        'pickup_arrived_at', 'dropoff_arrived_at', 'delivery_code', 'delivery_code_attempts', 'delivery_code_locked_until',
        'delivery_photo_path', 'failed_delivery_at', 'priority_until', 'priority_owner_id', 'client_hidden_at',
        'accepted_at', 'picked_up_at', 'delivered_at', 'cancelled_at',
    ];

    // Le chemin du fichier reste interne : les clients reçoivent une URL signée temporaire.
    /**
     * Ce que le client a le droit de savoir du livreur : de quoi le reconnaître (prénom, note, véhicule, plaque),
     * jamais sa messagerie, son solde ni son numéro Mobile Money (que le modèle complet exposerait).
     */
    public const DELIVERER_PUBLIC = [
        'deliverer:id,user_id,average_rating,total_deliveries,vehicle_type,vehicle_plate',
        'deliverer.user:id,first_name,phone,avatar_path',
    ];

    // Le code de remise n'est montré qu'au client propriétaire (makeVisible) : jamais au livreur qui doit le recevoir
    // de la bouche du destinataire. Le chemin de la photo de remise reste interne comme celui de la photo du colis.
    protected $hidden = ['photo_path', 'delivery_code', 'delivery_code_attempts', 'delivery_code_locked_until', 'delivery_photo_path', 'priority_owner_id'];

    protected $appends = ['photo_url', 'delivery_photo_url', 'auto_confirm_at', 'awaiting_payment'];

    /**
     * URL signée de la photo du colis, valable quelques heures. L'expiration est calée sur
     * l'heure pleine pour que l'URL reste identique d'une requête à l'autre (sinon le
     * navigateur rechargerait l'image à chaque relecture de la commande).
     */
    public function getPhotoUrlAttribute(): ?string
    {
        if (! $this->photo_path) {
            return null;
        }

        return URL::temporarySignedRoute('orders.photo', now()->startOfHour()->addHours(6), ['order' => $this->id]);
    }

    protected function casts(): array
    {
        return [
            'pickup_lat' => 'decimal:7', 'pickup_lng' => 'decimal:7',
            'dropoff_lat' => 'decimal:7', 'dropoff_lng' => 'decimal:7',
            'distance_km' => 'decimal:2',
            'delivery_code' => 'encrypted',
            'pickup_arrived_at' => 'datetime', 'dropoff_arrived_at' => 'datetime',
            'delivery_code_locked_until' => 'datetime', 'failed_delivery_at' => 'datetime',
            'price' => 'decimal:2', 'initial_price' => 'decimal:2', 'price_suggested' => 'decimal:2', 'commission_amount' => 'decimal:2', 'deliverer_payout' => 'decimal:2',
            'priority_until' => 'datetime', 'client_hidden_at' => 'datetime', 'handed_over_at' => 'datetime',
            'accepted_at' => 'datetime', 'picked_up_at' => 'datetime',
            'delivered_at' => 'datetime', 'cancelled_at' => 'datetime', 'paid_at' => 'datetime',
        ];
    }

    /**
     * Courses visibles par ce livreur : celles proposées d'abord aux livreurs favoris du client ne le sont
     * que pour ces favoris, jusqu'à la fin de la période de priorité.
     */
    public function scopeOpenTo($query, Deliverer $deliverer)
    {
        return $query->where(fn ($q) => $q
            ->whereNull('priority_until')
            ->orWhere('priority_until', '<=', now())
            ->orWhereExists(fn ($f) => $f->selectRaw('1')->from('favorite_deliverers')
                ->whereColumn('favorite_deliverers.user_id', 'orders.priority_owner_id')
                ->where('favorite_deliverers.deliverer_id', $deliverer->id)));
    }

    /**
     * Livraisons publiées : pas encore prises, et soit payées en ligne (argent bloqué chez LIV corp jusqu'à la confirmation
     * de réception), soit à payer en espèces au livreur. Une livraison en attente de paiement en ligne n'est jamais montrée.
     */
    public function scopePublished($query)
    {
        return $query->where('status', self::STATUS_CREEE)->whereNull('deliverer_id')
            ->where(fn ($q) => $q->where('payment_status', 'paye')->orWhere('payment_method', 'especes'));
    }

    /** Livraison à payer en espèces : pas de paiement en ligne, le livreur encaisse au retrait du colis. */
    public function isCash(): bool
    {
        return $this->payment_method === 'especes';
    }

    /** Créée mais en attente d'un paiement EN LIGNE : invisible des livreurs tant qu'il n'est pas fait. */
    public function getAwaitingPaymentAttribute(): bool
    {
        return $this->status === self::STATUS_CREEE && $this->payment_status !== 'paye' && ! $this->isCash();
    }

    public function isOpenTo(Deliverer $deliverer): bool
    {
        return static::whereKey($this->id)->openTo($deliverer)->exists();
    }

    /**
     * Zone publique d'une adresse : quartier, arrondissement et commune, sans la rue ni le numéro.
     * "Marché Dantokpa, Boulevard Saint-Michel, Dantokpa, Cotonou, Littoral" -> "Dantokpa, Cotonou".
     * La page Marché est ouverte à tous : l'adresse exacte n'est donnée qu'au livreur retenu.
     */
    public static function areaOf(?string $address): string
    {
        $parts = array_values(array_filter(array_map('trim', explode(',', (string) $address))));

        $departments = ['littoral', 'atlantique', 'ouémé', 'oueme', 'borgou', 'alibori', 'atacora', 'donga', 'collines', 'zou', 'plateau', 'mono', 'couffo'];
        if (count($parts) > 2 && in_array(mb_strtolower(end($parts)), $departments, true)) {
            array_pop($parts);
        }

        $parts = array_slice($parts, -3);
        // Une rue ou un numéro de maison identifie un lieu précis : on ne les garde pas.
        $parts = array_values(array_filter($parts, fn (string $p) => ! preg_match('/^(\d+[a-z]?|rue|avenue|av\.|boulevard|bd|route|chemin|impasse|carrefour)\b/iu', $p)));

        return implode(', ', $parts) ?: 'Bénin';
    }

    /** URL signée de la preuve photo de remise (mêmes règles que la photo du colis). */
    public function getDeliveryPhotoUrlAttribute(): ?string
    {
        if (! $this->delivery_photo_path) {
            return null;
        }

        return URL::temporarySignedRoute('orders.delivery-photo', now()->startOfHour()->addHours(6), ['order' => $this->id]);
    }

    /** Moment où la réception sera confirmée d'office si l'expéditeur ne répond pas (colis remis, en attente de confirmation). */
    public function getAutoConfirmAtAttribute(): ?string
    {
        if ($this->status !== self::STATUS_REMISE || ! $this->handed_over_at) {
            return null;
        }

        return $this->handed_over_at->copy()->addHours((int) config('services.orders.auto_confirm_hours'))->toIso8601String();
    }

    /** Course en cours : le livreur est engagé, contacts et conversation sont ouverts. */
    public function isActive(): bool
    {
        return in_array($this->status, [self::STATUS_ACCEPTEE, self::STATUS_COLIS_RECUPERE, self::STATUS_EN_COURS_LIVRAISON, self::STATUS_REMISE, self::STATUS_LITIGE], true);
    }

    /**
     * Retire les coordonnées de contact quand elles n'ont plus lieu d'être : le téléphone du livreur (côté client)
     * et celui du destinataire (côté livreur) ne servent que pendant la course.
     */
    public function maskContacts(): static
    {
        if (! $this->isActive()) {
            $this->deliverer?->user?->makeHidden('phone');
            $this->makeHidden('recipient_phone');
            if ($this->relationLoaded('client')) {
                $this->client?->makeHidden('phone');
            }
        }

        return $this;
    }

    public function isPaid(): bool
    {
        return $this->payment_status === 'paye';
    }

    public function canTransitionTo(string $newStatus): bool
    {
        return in_array($newStatus, self::ALLOWED_TRANSITIONS[$this->status] ?? [], true);
    }

    // --- Relations ---
    public function client(): BelongsTo { return $this->belongsTo(User::class, 'client_id'); }
    public function merchant(): BelongsTo { return $this->belongsTo(Merchant::class); }
    public function deliverer(): BelongsTo { return $this->belongsTo(Deliverer::class); }
    public function statusHistory(): HasMany { return $this->hasMany(OrderStatusHistory::class); }
    public function trackingPoints(): HasMany { return $this->hasMany(TrackingPoint::class); }
    public function transaction(): HasOne { return $this->hasOne(Transaction::class)->latestOfMany(); }
    public function transactions(): HasMany { return $this->hasMany(Transaction::class); }
    /** Paiement qui couvre cette livraison (peut en couvrir plusieurs : envoi en lot). */
    public function payment(): BelongsTo { return $this->belongsTo(Transaction::class, 'transaction_id'); }
    public function review(): HasOne { return $this->hasOne(Review::class); }
    public function disputes(): HasMany { return $this->hasMany(Dispute::class); }
    public function commissions(): HasMany { return $this->hasMany(Commission::class); }
    public function messages(): HasMany { return $this->hasMany(OrderMessage::class); }
    public function releases(): HasMany { return $this->hasMany(OrderRelease::class); }
}
