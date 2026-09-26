<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'role', 'account_type', 'first_name', 'last_name', 'company_name', 'sex', 'address',
        'email', 'phone', 'password', 'avatar_path', 'is_active',
    ];

    protected $hidden = [
        'password', 'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'is_active' => 'boolean',
            'password' => 'hashed',
        ];
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
