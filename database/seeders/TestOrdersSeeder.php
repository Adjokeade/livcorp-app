<?php

namespace Database\Seeders;

use App\Models\Commission;
use App\Models\Deliverer;
use App\Models\Order;
use App\Models\Transaction;
use App\Models\User;
use App\Services\CommissionService;
use App\Services\GeolocationService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/**
 * Livraisons de test, à toutes les étapes, pour les profils de TestProfilesSeeder.
 * Relançable sans doublon (clé : référence LIV-TEST-xxx) et sans rien supprimer : une livraison déjà
 * présente n'est jamais modifiée ni recréée.
 *
 *   php artisan db:seed --class=TestOrdersSeeder
 */
class TestOrdersSeeder extends Seeder
{
    private const PLACES = [
        'fidjrosse' => ['Fidjrossè, Cotonou, Littoral', 6.3520, 2.3620],
        'cadjehoun' => ['Cadjehoun, Cotonou, Littoral', 6.3590, 2.3850],
        'dantokpa' => ['Marché Dantokpa, Dantokpa, Cotonou, Littoral', 6.3654, 2.4183],
        'akpakpa' => ['Akpakpa, Cotonou, Littoral', 6.3560, 2.4420],
        'haievive' => ['Haie Vive, Cotonou, Littoral', 6.3667, 2.3856],
        'godomey' => ['Godomey, Abomey-Calavi, Atlantique', 6.4020, 2.3410],
        'calavi' => ['Abomey-Calavi, Atlantique', 6.4485, 2.3550],
        'zogbo' => ['Zogbo, Cotonou, Littoral', 6.3790, 2.3970],
        'ganhi' => ['Ganhi, Cotonou, Littoral', 6.3600, 2.4260],
    ];

    public function run(GeolocationService $geo): void
    {
        $users = User::whereIn('email', [
            'particulier1@livcorp.bj', 'particulier2@livcorp.bj', 'entreprise1@livcorp.bj', 'entreprise2@livcorp.bj',
            'livreur1@livcorp.bj', 'livreur2@livcorp.bj',
        ])->get()->keyBy('email');

        if ($users->count() < 6) {
            $this->command->error('Lancez d\'abord TestProfilesSeeder (profils de test manquants).');

            return;
        }

        $d1 = Deliverer::where('user_id', $users['livreur1@livcorp.bj']->id)->first();
        $d2 = Deliverer::where('user_id', $users['livreur2@livcorp.bj']->id)->first();

        // [n°, expéditeur, type, urgence, départ, destination, prix, contenu, statut, livreur, destinataire]
        $rows = [
            // --- Particuliers ---
            [1, 'particulier1', 'colis', 'standard', 'fidjrosse', 'cadjehoun', 1500, 'Sac de vêtements', 'creee', null, 'Mireille Tossou'],
            [2, 'particulier1', 'course', 'express', 'dantokpa', 'akpakpa', 2500, 'Acheter 2 sacs de riz et de l\'huile', 'creee', null, 'Mireille Tossou'],
            [3, 'particulier1', 'colis', 'standard', 'haievive', 'godomey', 3000, 'Ordinateur portable', 'acceptee', $d1, 'Hervé Gbaguidi'],
            [4, 'particulier2', 'colis', 'standard', 'akpakpa', 'calavi', 4000, 'Carton de livres', 'creee', null, 'Sandrine Kiki'],
            [5, 'particulier2', 'colis', 'standard', 'zogbo', 'ganhi', 1200, 'Documents', 'livree', $d2, 'Patrice Dansou'],
            [6, 'particulier2', 'colis', 'standard', 'cadjehoun', 'fidjrosse', 1500, 'Cadeau d\'anniversaire', 'annulee', null, 'Awa Adjovi'],
            // --- Entreprises ---
            [7, 'entreprise1', 'colis', 'standard', 'dantokpa', 'fidjrosse', 2000, 'Commande boutique n°1042', 'creee', null, 'Client Houngbadji'],
            [8, 'entreprise1', 'colis', 'express', 'dantokpa', 'cadjehoun', 2500, 'Commande boutique n°1043', 'creee', null, 'Client Sossou'],
            [9, 'entreprise1', 'colis', 'standard', 'dantokpa', 'zogbo', 1500, 'Commande boutique n°1044', 'creee', null, 'Client Adande'],
            [10, 'entreprise1', 'colis', 'standard', 'dantokpa', 'akpakpa', 1800, 'Commande boutique n°1040', 'livree', $d1, 'Client Mensah'],
            [11, 'entreprise2', 'colis', 'express', 'haievive', 'cadjehoun', 2000, 'Médicaments (chaîne du froid)', 'creee', null, 'Pharmacie du Port'],
            [12, 'entreprise2', 'colis', 'standard', 'haievive', 'godomey', 3000, 'Matériel médical', 'en_cours_livraison', $d2, 'Clinique Saint-Luc'],
            [13, 'entreprise2', 'course', 'standard', 'haievive', 'zogbo', 2200, 'Récupérer une ordonnance et la livrer', 'colis_recupere', $d1, 'M. Agossou'],
            // Colis remis (photo de réception envoyée) : l'expéditeur doit confirmer, l'argent est bloqué chez LIV corp.
            [14, 'entreprise1', 'colis', 'standard', 'dantokpa', 'ganhi', 1500, 'Commande boutique n°1041', 'remise', $d2, 'Client Gnonlonfoun'],
            // Livraison créée mais pas encore payée : invisible des livreurs, annulée au bout de 30 minutes.
            [15, 'particulier2', 'colis', 'standard', 'zogbo', 'haievive', 1300, 'Chaussures', 'creee', null, 'Awa Adjovi'],
            // Paiement en espèces : publiée sans paiement en ligne (n°16), puis acceptée, le livreur doit encaisser au retrait (n°17).
            [16, 'particulier1', 'colis', 'standard', 'ganhi', 'cadjehoun', 1500, 'Panier de courses', 'creee', null, 'Mireille Tossou'],
            [17, 'particulier2', 'colis', 'standard', 'fidjrosse', 'akpakpa', 2500, 'Matériel de bureau', 'acceptee', $d1, 'Sandrine Kiki'],
        ];

        foreach ($rows as [$n, $who, $type, $urgency, $from, $to, $price, $what, $status, $deliverer, $recipient]) {
            $reference = sprintf('LIV-TEST-%03d', $n);
            if ($existing = Order::where('reference', $reference)->first()) {
                // Livraison de test créée avant le paiement d'avance : on lui donne son paiement, sans rien recréer.
                $this->ensurePayment($existing, $n);

                continue;
            }

            [$pAddr, $pLat, $pLng] = self::PLACES[$from];
            [$dAddr, $dLat, $dLng] = self::PLACES[$to];
            $km = round($geo->distanceInKm($pLat, $pLng, $dLat, $dLng) * 1.3, 2);
            $client = $users["{$who}@livcorp.bj"];

            $photo = null;
            if ($type === 'colis') {
                $photo = 'orders/seed-'.$n.'.jpg';
                $this->placeholderPhoto($photo, $what, $n);
            }

            $times = [
                'creee' => [],
                'acceptee' => ['accepted_at' => now()->subMinutes(20)],
                'colis_recupere' => ['accepted_at' => now()->subMinutes(40), 'picked_up_at' => now()->subMinutes(15)],
                'en_cours_livraison' => ['accepted_at' => now()->subMinutes(50), 'picked_up_at' => now()->subMinutes(30)],
                'remise' => ['accepted_at' => now()->subHours(3), 'picked_up_at' => now()->subHours(2), 'handed_over_at' => now()->subHour()],
                'livree' => ['accepted_at' => now()->subDay(), 'picked_up_at' => now()->subDay()->addMinutes(10), 'delivered_at' => now()->subDay()->addMinutes(35)],
                'annulee' => ['cancelled_at' => now()->subHours(3)],
            ][$status];

            $order = Order::create(array_replace([
                'reference' => $reference,
                'type' => $type,
                'client_id' => $client->id,
                'deliverer_id' => $deliverer?->id,
                'pickup_address' => $pAddr, 'pickup_lat' => $pLat, 'pickup_lng' => $pLng,
                'dropoff_address' => $dAddr, 'dropoff_lat' => $dLat, 'dropoff_lng' => $dLng,
                'recipient_name' => $recipient, 'recipient_phone' => '+2290197'.str_pad((string) (100 + $n), 6, '0', STR_PAD_LEFT),
                'package_type' => $what,
                'photo_path' => $photo,
                'urgency' => $urgency,
                'distance_km' => $km,
                'duration_min' => (int) round($km * 3 + 5),
                'price' => $price, 'initial_price' => $price,
                'price_suggested' => (int) $geo->estimatePrice($km, $urgency),
                'status' => $status,
                'payment_status' => 'en_attente',
                'created_at' => now()->subMinutes(5 + $n * 7),
            ], $times));

            $this->ensurePayment($order, $n);
            if ($status === 'remise') {
                $order->update(['delivery_photo_path' => 'deliveries/seed-'.$n.'.jpg']);
                $this->placeholderPhoto('deliveries/seed-'.$n.'.jpg', 'Colis remis', $n);
            }

            $order->statusHistory()->create(['status' => 'creee', 'changed_by' => $client->id, 'note' => 'Commande créée']);
            if ($deliverer) {
                $order->statusHistory()->create(['status' => 'acceptee', 'changed_by' => $deliverer->user_id]);
            }
            if ($status !== 'creee' && $status !== 'acceptee') {
                $order->statusHistory()->create(['status' => $status, 'changed_by' => $deliverer?->user_id ?? $client->id]);
            }
        }

        // Commissions des livraisons terminées (comme à une vraie livraison) : alimente les écrans financiers.
        Order::where('reference', 'like', 'LIV-TEST-%')->where('status', 'livree')->get()
            ->each(fn (Order $o) => app(CommissionService::class)->computeForDeliveredOrder($o));

        $this->command->info('Livraisons de test prêtes (références LIV-TEST-001 à LIV-TEST-017).');
    }

    /**
     * Paiement d'avance d'une livraison de test : payée en ligne (transaction KKiaPay fictive), sauf la n°15 laissée à payer
     * et la n°6 annulée, remboursée. Idempotent : une livraison déjà reliée à un paiement n'est pas touchée.
     */
    private function ensurePayment(Order $order, int $n): void
    {
        if ($order->transaction_id || $order->payment_method === 'especes') {
            return;
        }

        $unpaid = $n === 15;
        $refunded = $order->status === 'annulee';

        // Livraison à payer en espèces au livreur : pas de paiement en ligne du tout.
        if (in_array($n, [16, 17], true)) {
            $order->update(['transaction_id' => null, 'payment_status' => 'en_attente', 'payment_method' => 'especes', 'delivery_code' => null]);

            return;
        }

        $transaction = Transaction::create([
            'order_id' => $order->id,
            'user_id' => $order->client_id,
            'provider' => 'kkiapay',
            'reference' => sprintf('LIVP-TEST-%03d', $n),
            'provider_transaction_id' => $unpaid ? null : sprintf('SEED-%03d', $n),
            'method' => $unpaid ? null : 'mobile_money',
            'amount' => $order->price,
            'currency' => 'XOF',
            'status' => $unpaid ? 'pending' : ($refunded ? 'refunded' : 'approved'),
            'paid_at' => $unpaid ? null : $order->created_at,
            'refund_status' => $refunded ? 'done' : null,
        ]);

        $order->update([
            'transaction_id' => $transaction->id,
            'payment_status' => $unpaid ? 'en_attente' : ($refunded ? 'rembourse' : 'paye'),
            'payment_method' => $unpaid ? null : 'en_ligne',
            'paid_at' => $unpaid ? null : $order->created_at,
            'delivery_code' => null,
        ]);

        // Ancienne commission « espèces » (négative) d'une livraison de test : tout est désormais payé en ligne.
        Commission::where('order_id', $order->id)->where('net_amount', '<', 0)->each(fn (Commission $c) => $c->update(['net_amount' => $c->order_amount - $c->commission_amount]));
        $order->deliverer?->refreshStats();
    }

    /** Photo de colis de remplacement : fond coloré et numéro, enregistrée comme une vraie photo. */
    private function placeholderPhoto(string $path, string $label, int $n): void
    {
        $img = imagecreatetruecolor(800, 600);
        $palette = [[222, 184, 135], [176, 196, 222], [188, 214, 176], [235, 190, 170], [205, 190, 225]];
        [$r, $g, $b] = $palette[$n % count($palette)];
        imagefill($img, 0, 0, imagecolorallocate($img, $r, $g, $b));
        imagefilledrectangle($img, 200, 150, 600, 450, imagecolorallocate($img, $r - 40, $g - 40, $b - 40));
        imagestring($img, 5, 330, 290, 'COLIS TEST '.$n, imagecolorallocate($img, 255, 255, 255));
        imagestring($img, 3, 330, 320, substr($label, 0, 28), imagecolorallocate($img, 255, 255, 255));

        ob_start();
        imagejpeg($img, null, 85);
        Storage::disk('parcel_photos')->put($path, (string) ob_get_clean());
    }
}
