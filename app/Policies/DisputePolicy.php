<?php

namespace App\Policies;

use App\Models\Dispute;
use App\Models\User;

class DisputePolicy
{
    public function view(User $user, Dispute $dispute): bool
    {
        return $user->isAdmin()
            || $dispute->raised_by === $user->id
            || $dispute->order->client_id === $user->id;
    }

    public function manage(User $user, Dispute $dispute): bool
    {
        return $user->isAdmin();
    }
}
