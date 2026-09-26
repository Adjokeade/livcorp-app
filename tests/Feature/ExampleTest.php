<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Le back-end est une API : il n'y a pas de page d'accueil sur "/" (la SPA React
     * est servie par Vite). On vérifie donc la route de santé et une route publique.
     */
    public function test_the_api_is_up_and_serves_public_routes(): void
    {
        $this->get('/up')->assertOk();
        $this->getJson('/api/v1/marketplace/deliverers')->assertOk();
    }
}
