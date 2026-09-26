<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderMessage;
use App\Notifications\NewChatMessage;
use Illuminate\Http\Request;

/**
 * Conversation entre le client et le livreur d'une commande. Partagée par les deux rôles : la politique
 * "chat" n'ouvre l'accès qu'au client de la commande et à son livreur actuel. Un nouveau livreur (après un
 * désistement) ne lit jamais la conversation du précédent.
 */
class OrderMessageController extends Controller
{
    public function index(Request $request, Order $order)
    {
        $this->authorize('chat', $order);

        $user = $request->user();
        $conversation = $order->messages()->where('deliverer_id', $order->deliverer_id);

        $messages = (clone $conversation)
            ->when($request->integer('after'), fn ($q, $after) => $q->where('id', '>', $after))
            ->orderBy('id')
            ->limit(200)
            ->get();

        // La conversation est "ouverte" à l'écran : ce que l'autre a écrit est alors lu.
        if ($request->boolean('open')) {
            (clone $conversation)->where('sender_id', '!=', $user->id)->whereNull('read_at')->update(['read_at' => now()]);
        }

        return response()->json([
            'data' => $messages->map(fn (OrderMessage $m) => [
                'id' => $m->id,
                'mine' => $m->sender_id === $user->id,
                'body' => $m->body,
                'created_at' => $m->created_at,
            ]),
            // Écrire n'est possible que pendant la course ; ensuite la conversation reste lisible.
            'writable' => $order->isActive(),
        ]);
    }

    public function store(Request $request, Order $order)
    {
        $this->authorize('chat', $order);

        if (! $order->isActive()) {
            return response()->json(['message' => 'La conversation est fermée : la course est terminée.'], 422);
        }

        $validated = $request->validate(['body' => 'required|string|max:500']);
        $user = $request->user();

        $message = OrderMessage::create([
            'order_id' => $order->id,
            'deliverer_id' => $order->deliverer_id,
            'sender_id' => $user->id,
            'body' => trim($validated['body']),
        ]);

        // L'autre partie est prévenue (notification), comme pour un SMS.
        $toClient = $user->id !== $order->client_id;
        $recipient = $toClient ? $order->client : $order->deliverer->user;
        $url = config('app.frontend_url').($toClient
            ? "/client/suivi/{$order->id}?chat=1"
            : '/deliverer/tableau-de-bord?chat='.$order->id);
        rescue(fn () => $recipient->notify(new NewChatMessage($message, $user, $url)));

        return response()->json(['message' => [
            'id' => $message->id, 'mine' => true, 'body' => $message->body, 'created_at' => $message->created_at,
        ]], 201);
    }
}
