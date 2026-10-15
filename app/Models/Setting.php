<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Réglages de la plateforme : une clé, une valeur JSON, la dernière personne qui l'a modifiée. */
class Setting extends Model
{
    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'value', 'updated_by'];

    protected function casts(): array
    {
        return ['value' => 'array'];
    }

    public static function read(string $key, array $default = []): array
    {
        return array_replace($default, static::find($key)?->value ?? []);
    }

    public static function write(string $key, array $value, ?int $userId = null): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value, 'updated_by' => $userId]);
    }
}
