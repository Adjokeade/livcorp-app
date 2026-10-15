<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

/** Envoie un e-mail de test (immédiatement, sans passer par la file d'attente). */
class MailTest extends Command
{
    protected $signature = 'mail:test {to : adresse destinataire}';

    protected $description = "Envoie un e-mail de test pour vérifier la configuration d'envoi";

    public function handle(): int
    {
        $to = $this->argument('to');

        if (! config('mail.enabled')) {
            $this->warn('Envoi silencieux (MAIL_ENABLED=false) : le message est seulement écrit dans storage/logs, rien ne part.');
        }

        try {
            Mail::raw("Ceci est un e-mail de test envoyé par LIV corp le ".now()->format('d/m/Y à H:i').'.', function ($message) use ($to) {
                $message->to($to)->subject('Test d\'envoi LIV corp');
            });
        } catch (\Throwable $e) {
            $this->error('Échec de l\'envoi : '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info(config('mail.enabled') ? "E-mail de test envoyé à {$to}." : 'Message enregistré dans les journaux (aucun envoi réel).');

        return self::SUCCESS;
    }
}
