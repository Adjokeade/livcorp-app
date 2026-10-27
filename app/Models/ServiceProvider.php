<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Prestataire de services (plombier, coiffeuse, informaticien…) qui s'inscrit sur la plateforme.
 * Pas de compte de connexion : c'est une candidature que l'administration valide ou refuse.
 */
class ServiceProvider extends Model
{
    use HasFactory;

    public const PROFESSIONS = [
        'plombier' => 'Plombier',
        'electricien' => 'Électricien',
        'coiffeur' => 'Coiffeur / coiffeuse',
        'informaticien' => 'Informaticien',
        'menuisier' => 'Menuisier',
        'macon' => 'Maçon',
        'mecanicien' => 'Mécanicien',
        'couturier' => 'Couturier / couturière',
        'peintre' => 'Peintre',
        'climatisation' => 'Frigoriste / climatisation',
        'menage' => 'Ménage et entretien',
        'autre' => 'Autre métier',
    ];

    protected $fillable = [
        'first_name', 'last_name', 'sex', 'email', 'phone', 'profession', 'profession_other', 'city', 'address',
        'experience_years', 'description', 'status', 'rejection_reason', 'reviewed_at', 'reviewed_by',
    ];

    protected function casts(): array
    {
        return ['reviewed_at' => 'datetime', 'experience_years' => 'integer'];
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
