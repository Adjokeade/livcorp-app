<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'role', 'account_type', 'company_id', 'team_role', 'first_name', 'last_name', 'company_name', 'sex', 'address',
        'email', 'phone', 'password', 'avatar_path', 'is_active',
    ];

    protected $hidden = [
        'password', 'remember_token', 'avatar_path', 'custom_tariff',
    ];

    protected $appends = ['avatar_url'];

    /**
     * URL signée temporaire de la photo de profil (même principe que les photos de colis). Elle n'est remise
     * qu'aux personnes concernées : le titulaire, un client dont c'est le livreur, l'administrateur.
     * Nulle si la photo n'a pas été chargée dans la requête (sélection partielle) ou n'existe pas.
     */
    public function getAvatarUrlAttribute(): ?string
    {
        $path = $this->attributes['avatar_path'] ?? null;

        if (! $path) {
            return null;
        }

        // Le jeton change quand la photo change : le navigateur ne garde pas l'ancienne en cache.
        return URL::temporarySignedRoute('avatars.show', now()->startOfHour()->addHours(6), ['user' => $this->id, 'v' => substr(md5($path), 0, 8)]);
    }

    public function hasAvatar(): bool
    {
        return filled($this->attributes['avatar_path'] ?? null);
    }

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'is_active' => 'boolean',
            'custom_tariff' => 'array',
            'password' => 'hashed',
        ];
    }

    /** Lien de réinitialisation vers l'interface (et non vers l'API), en français. */
    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new \App\Notifications\PasswordResetLink($token));
    }

    // --- Rôles ---
    public function isClient(): bool { return $this->role === 'client'; }
    public function isCommercant(): bool { return $this->role === 'commercant'; }
    public function isLivreur(): bool { return $this->role === 'livreur'; }
    public function isAdmin(): bool { return $this->role === 'admin'; }

    // --- Relations ---
    public function deliverer(): HasOne
    {
        return $this->hasOne(Deliverer::class);
    }

    public function merchant(): HasOne
    {
        return $this->hasOne(Merchant::class);
    }

    // --- Équipe d'entreprise ---

    /** Propriétaire du compte entreprise (lui-même s'il n'est rattaché à aucun autre). */
    public function companyOwnerId(): int
    {
        return $this->company_id ?? $this->id;
    }

    /** Peut voir toutes les livraisons de l'entreprise et gérer l'équipe. */
    public function isTeamManager(): bool
    {
        if ($this->role !== 'client' || $this->account_type !== 'entreprise') {
            return false;
        }

        return $this->company_id === null || $this->team_role === 'responsable';
    }

    /** Identifiants des comptes dont les livraisons lui sont visibles. */
    public function visibleClientIds(): array
    {
        if (! $this->isTeamManager()) {
            return [$this->id];
        }

        return static::where('id', $this->companyOwnerId())->orWhere('company_id', $this->companyOwnerId())->pluck('id')->all();
    }

    /** Le client $clientId est-il le sien, ou un collègue dont un responsable peut suivre les livraisons ? */
    public function canActForClient(int $clientId): bool
    {
        return $clientId === $this->id || in_array($clientId, $this->visibleClientIds(), true);
    }

    public function visibleOrders()
    {
        return Order::whereIn('client_id', $this->visibleClientIds());
    }

    /** Compte qui porte les favoris et le carnet partagés : le propriétaire de l'entreprise, sinon soi-même. */
    public function ownerAccount(): static
    {
        return $this->company_id ? static::findOrFail($this->company_id) : $this;
    }

    public function teamMembers()
    {
        return $this->hasMany(User::class, 'company_id');
    }

    public function favoriteDeliverers()
    {
        return $this->belongsToMany(Deliverer::class, 'favorite_deliverers', 'user_id', 'deliverer_id')->withTimestamps();
    }

    public function recipients()
    {
        return $this->hasMany(Recipient::class);
    }

    public function savedAddresses()
    {
        return $this->hasMany(SavedAddress::class);
    }

    public function documents()
    {
        return $this->hasMany(Document::class);
    }

    public function pushSubscriptions()
    {
        return $this->hasMany(PushSubscription::class);
    }

    public function ordersAsClient()
    {
        return $this->hasMany(Order::class, 'client_id');
    }

    public function disputesRaised()
    {
        return $this->hasMany(Dispute::class, 'raised_by');
    }

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }
}
