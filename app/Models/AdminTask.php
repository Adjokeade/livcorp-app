<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class AdminTask extends Model
{
    use HasFactory;

    protected $fillable = [
        'type', 'title', 'description', 'taskable_type', 'taskable_id',
        'status', 'priority', 'assigned_to', 'due_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return ['due_at' => 'datetime', 'completed_at' => 'datetime'];
    }

    public function taskable(): MorphTo { return $this->morphTo(); }
    public function assignedTo(): BelongsTo { return $this->belongsTo(User::class, 'assigned_to'); }
}
