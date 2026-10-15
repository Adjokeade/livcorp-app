<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/** Indique si l'envoi d'e-mails est actif ou silencieux, et vers où partent les messages. */
class MailStatus extends Command
{
    protected $signature = 'mail:status';

    protected $description = "Affiche l'état de l'envoi d'e-mails (silencieux ou actif)";

    public function handle(): int
    {
        $default = config('mail.default');

        if (! config('mail.enabled')) {
            $this->warn('Envoi SILENCIEUX : aucun e-mail ne part. Les messages sont seulement écrits dans storage/logs.');
            $this->line('Pour activer : MAIL_ENABLED=true dans .env, avec les identifiants SMTP renseignés.');

            return self::SUCCESS;
        }

        $mailer = config("mail.mailers.{$default}", []);
        $this->info("Envoi ACTIF via « {$default} ».");
        $this->table(['Réglage', 'Valeur'], [
            ['Serveur', ($mailer['host'] ?? '—').':'.($mailer['port'] ?? '—')],
            ['Identifiant', ($mailer['username'] ?? '') !== '' ? $mailer['username'] : '(vide)'],
            ['Mot de passe', ($mailer['password'] ?? '') !== '' ? '(renseigné)' : '(vide)'],
            ['Expéditeur', config('mail.from.name').' <'.config('mail.from.address').'>'],
        ]);

        if (($mailer['transport'] ?? null) === 'smtp' && (($mailer['username'] ?? '') === '' || ($mailer['password'] ?? '') === '')) {
            $this->error('Identifiants SMTP incomplets : les envois échoueront.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
