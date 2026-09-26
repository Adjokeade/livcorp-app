<?php

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Routing\Controller as BaseController;

abstract class Controller extends BaseController
{
    // Donne $this->authorize() à tous les contrôleurs (policies OrderPolicy, DisputePolicy).
    use AuthorizesRequests;
}
