<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Minishlink\WebPush\VAPID;

class GenerateVapidKeys extends Command
{
    protected $signature = 'push:vapid {--write : Écrit les clés dans .env si elles n\'y sont pas déjà}';

    protected $description = 'Génère la paire de clés VAPID qui identifie ce serveur auprès des services de notifications push';

    public function handle(): int
    {
        if (filled(config('services.webpush.public_key')) && $this->option('write')) {
            $this->error('Des clés VAPID existent déjà. Les remplacer invaliderait tous les abonnements des utilisateurs.');

            return self::FAILURE;
        }

        $keys = VAPID::createVapidKeys();

        if ($this->option('write')) {
            file_put_contents(base_path('.env'), "\nVAPID_PUBLIC_KEY={$keys['publicKey']}\nVAPID_PRIVATE_KEY={$keys['privateKey']}\n", FILE_APPEND);
            $this->info('Clés VAPID ajoutées à .env (à conserver : les changer désabonne tous les appareils).');

            return self::SUCCESS;
        }

        $this->line("VAPID_PUBLIC_KEY={$keys['publicKey']}");
        $this->line("VAPID_PRIVATE_KEY={$keys['privateKey']}");
        $this->newLine();
        $this->comment('Copiez ces lignes dans .env (ou relancez avec --write).');

        return self::SUCCESS;
    }
}
