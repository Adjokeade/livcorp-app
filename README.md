<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## LIV corp : installation après un clonage

```sh
composer install
npm install
cp .env.example .env          # sous Windows : copy .env.example .env
php artisan key:generate
```

1. **Base de données** : créer une base MySQL vide `livcorp` (phpMyAdmin, ou `CREATE DATABASE livcorp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`),
   puis régler `DB_USERNAME` / `DB_PASSWORD` dans `.env` (XAMPP et WAMP : `root`, mot de passe vide). `php artisan migrate` propose aussi de
   créer la base si elle n'existe pas. Sans MySQL, `DB_CONNECTION=sqlite` (créer le fichier vide `database/database.sqlite`) suffit pour tester.
2. `php artisan migrate`, puis facultatif : `php artisan db:seed` (compte admin et démonstration), `php artisan db:seed --class=TestProfilesSeeder`
   et `php artisan db:seed --class=TestOrdersSeeder` (profils et livraisons de test, mot de passe `ChangeMoi123!`).
3. `npm run dev` : serveur, file d'attente, planificateur et interface.

**Dépannage**
- *« Connection refused » / « Aucune connexion n'a pu être établie »* : MySQL n'est pas démarré (XAMPP, Laragon, WAMP : bouton Start).
- *« Base 'livcorp' inconnue »* : la base n'existe pas, voir l'étape 1.
- *« La clé est trop longue. Longueur maximale : 1000 » (erreur 1071)* : moteur MyISAM ou MySQL ancien. Le moteur InnoDB est utilisé par défaut dans ce projet ;
  mettre à jour le code (`git pull`) puis `php artisan migrate:fresh`. Avec un MySQL antérieur à 5.7, ajouter `DB_LEGACY_MYSQL=true` dans `.env`.
- Les clés KKiaPay (paiement en ligne) ne sont pas partagées : sans elles, seul le paiement en espèces fonctionne.

## LIV corp : lancer le projet

```sh
php artisan serve          # API sur http://localhost:8000
php artisan queue:work     # OBLIGATOIRE : e-mails et notifications push passent par la file d'attente
npm run dev                # interface sur http://localhost:5173
```

### Espace administrateur

- Connexion : **http://localhost:5173/admin/connexion** (compte du seeder en local : `admin@livcorp.bj` / `ChangeMoi123!`, à changer avant toute mise en ligne).
- Back-office : **http://localhost:5173/admin**. Sans session, cette adresse renvoie vers la connexion administrateur.
- Les comptes administrateur ne se connectent **que** par cette page (la connexion publique les refuse). Elle répond la même chose pour
  un compte inconnu, un mauvais mot de passe ou un compte non administrateur, limite à 5 essais par minute, ferme la session au bout de
  8 h (`ADMIN_TOKEN_MINUTES`) et journalise chaque tentative (`audit_logs` : `admin.login`, `admin.login_failed`).
- Les pages `/admin*` ne sont pas référencées par les moteurs de recherche (`robots.txt` et balise `noindex`).

### E-mails (silencieux par défaut)

Le service d'envoi (Brevo, SMTP) est branché mais **désactivé** : tant que `MAIL_ENABLED=false` (valeur par défaut), aucun e-mail ne
part, chaque message est seulement écrit dans `storage/logs/laravel-*.log`. Les liens de réinitialisation de mot de passe s'y lisent donc
en local. La page « Mot de passe oublié » prévient l'utilisateur qu'il ne recevra rien tant que l'envoi est silencieux.

Pour l'activer : `MAIL_ENABLED=true` et `MAIL_USERNAME` / `MAIL_PASSWORD` (clés SMTP Brevo) dans `.env`, puis

```sh
php artisan mail:status               # silencieux ou actif, identifiants complets ?
php artisan mail:test vous@exemple.com
```

Les e-mails passent par la file d'attente : `queue:work` doit tourner. La vérification d'adresse e-mail est **désactivée pour le moment** (`EMAIL_VERIFICATION_REQUIRED=false`, comptes validés d'office) ; penser à passer `EMAIL_VERIFICATION_REQUIRED=true` une fois l'envoi actif.

### Paiement d'avance et confirmation de réception

Le destinataire d'un colis n'a pas forcément l'application : c'est donc **l'expéditeur** qui confirme la réception, et le paiement se
fait **à la création** de la livraison, au choix : **en ligne** (argent bloqué chez LIV corp) ou **en espèces** (remis au livreur).

**En espèces** : la livraison est publiée tout de suite, sans paiement en ligne. L'expéditeur remet le prix au livreur, en main propre,
**au retrait du colis** ; le livreur doit confirmer l'encaissement (« J'ai encaissé X FCFA ») avant de pouvoir récupérer le colis, et
l'expéditeur est notifié. Le livreur garde les espèces : à la confirmation de réception, seule sa **commission** (négative) est
inscrite à son compte et déduite de ses prochains versements en ligne. Pas d'annulation en ligne une fois les espèces encaissées.

1. **Création** : l'expéditeur crée la livraison et, en ligne, la **paie tout de suite** (KKiaPay : Mobile Money ou carte). Tant qu'elle n'est
   pas payée, elle est invisible des livreurs ; non payée au bout de 30 minutes (`ORDER_UNPAID_EXPIRY_MINUTES`), elle est annulée.
2. **Argent bloqué** : une fois payée, la livraison est publiée aux livreurs. L'argent reste sur le compte KKiaPay de LIV corp.
3. **Remise** : le livreur envoie la **photo de réception** (obligatoire) → statut « remise ».
4. **Confirmation** : l'expéditeur voit la photo et **confirme la réception**. L'argent bloqué devient un **solde pour le livreur**
   (net de la commission). Sans réponse sous 24 h (`ORDER_AUTO_CONFIRM_HOURS`, 0 pour désactiver), la réception est confirmée
   automatiquement. L'expéditeur peut aussi **signaler un problème** : litige, l'argent reste bloqué et l'administration tranche
   (remboursement du client, ou paiement du livreur).
5. **Annulation** avant la récupération du colis : le client est remboursé (Mobile Money par l'API, le reste à la main).

Ces échéances sont traitées par le planificateur (`php artisan schedule:work`, lancé par `npm run dev` ; en production, un cron
`* * * * * php artisan schedule:run`).

### Paiement en ligne (KKiaPay)

Le widget KKiaPay s'ouvre dans l'application avec la seule clé publique ; au retour, le **serveur** interroge KKiaPay (clés privée et
secrète) et ne valide que si la transaction a réussi, pour le bon montant et la bonne référence. Un webhook sert de filet. Un seul
paiement peut couvrir plusieurs livraisons (envoi en lot des entreprises).

Configuration (`.env`, valeurs dans le tableau de bord KKiaPay > Développeurs > Clés API) :

```
KKIAPAY_SANDBOX=true          # false en production
KKIAPAY_PUBLIC_KEY=  KKIAPAY_PRIVATE_KEY=  KKIAPAY_SECRET=
KKIAPAY_WEBHOOK_SECRET=       # « secret hash » choisi à la création du webhook
```

- **Webhook** à créer dans le tableau de bord : `https://VOTRE-DOMAINE/api/v1/webhooks/kkiapay`, événements succès et échec de transaction.
- **Tests** : mode sandbox, numéros MTN `61000000` / `97000000` (succès), `61000001` (erreur), `61000002` (fonds insuffisants).
- **Sans clés**, le paiement en ligne est indisponible : aucune livraison ne peut être créée (elle se paie à la création).
- **Versements aux livreurs** : KKiaPay n'offre pas d'API pour payer des tiers. Chaque soir (ou à la demande, Admin > Finances >
  Versements), LIV corp prépare un versement « à payer » par livreur ; l'administration l'envoie en Mobile Money au numéro indiqué,
  puis le marque « versé » (le livreur est prévenu).
- **Remboursement** d'un litige : un paiement Mobile Money remboursé en totalité passe par l'API KKiaPay ; carte, envoi en lot et
  remboursement partiel se règlent à la main (Admin > Finances > Remboursements).

### Application installable et notifications push

L'interface est une PWA (installable sur téléphone, utilisable hors ligne pour l'essentiel) et envoie des
notifications push : nouvelle course près d'un livreur, proposition de prix, paiement validé, statut de la
commande, dossiers livreurs à valider.

- **Clés VAPID** (une seule fois) : `php artisan push:vapid --write`. À conserver : les changer désabonne tous les appareils.
- **PHP autonome (herd-lite)** : il ne trouve pas `openssl.cnf`, ce qui casse les clés de chiffrement des
  notifications. Exporter `OPENSSL_CONF=/etc/ssl/openssl.cnf` avant `artisan serve` et `queue:work`
  (déjà fait dans `~/.bashrc` de cette machine). Un PHP classique n'a pas ce problème.
- **Tester la PWA** : le service worker n'existe que sur une version construite.
  `npm run build && npm run preview` puis http://localhost:4173, ou `PWA_DEV=true npm run dev`.
- **Production** : HTTPS obligatoire (les navigateurs refusent le service worker et le push sinon),
  `FRONTEND_URL` renseigné (liens des notifications), un `queue:work` supervisé (systemd, Supervisor),
  clés VAPID dans l'environnement du serveur. Les services push acceptés sont ceux listés dans
  `services.webpush.allowed_hosts` (Google, Mozilla, Apple, Microsoft) : c'est une protection contre les
  requêtes vers des adresses internes (SSRF).
- **iPhone** : les notifications n'existent que pour l'application ajoutée à l'écran d'accueil (iOS 16.4 ou plus).

### Déroulé d'une course (client, livreur)

- **Messagerie** : chaque commande a sa discussion client / livreur (messages rapides, pastille de non lus, notification push).
  Elle s'ouvre à l'acceptation et se ferme à la fin de la course ; un nouveau livreur ne voit pas les messages de l'ancien.
- **Contacts protégés** : le client ne reçoit jamais l'e-mail, le portefeuille, le Mobile Money ni le contact d'urgence du livreur.
  Le téléphone du livreur n'est visible que pendant la course, celui du destinataire n'est plus montré au livreur après.
- **Arrivée** : "Je suis arrivé" au retrait puis à la destination. Refusé au-delà de `ORDER_ARRIVAL_RADIUS_M` (500 m) quand une
  position récente existe. Le temps d'attente sur place est visible des deux côtés.
- **Remise** : photo de réception obligatoire du livreur, confirmée par l'expéditeur (cf. ci-dessus). Plus de code de remise.
- **Désistement** avant le retrait : motif obligatoire, la commande repart en circulation au prix initial du client, le livreur
  qui s'est désisté ne peut plus la reprendre ni la proposer.
- **Destinataire injoignable** : déclarable après 10 minutes sur place. La commande passe en litige et le client peut relancer la
  livraison (2 fois au plus).

Les seuils se règlent dans `config/services.php` (clé `orders`) : `arrival_radius_m`, `unreachable_wait_min`, `code_max_attempts`,
`code_lock_minutes`.

### Animations et charte visuelle

- Les couleurs de la marque sont des jetons dans `src/styles/index.css` (orange `primary`, bleu `secondary`, bleu marine du
  pied de page `footer`). Les boutons (`btn-primary`, `btn-secondary`, `btn-tertiary`, `btn-light`, `btn-outline-light`) et
  les cartes (`card-hover`) portent leurs animations : les utiliser suffit, rien à ajouter dans les pages.
- `<Reveal delay={ms} variant="up|left|scale">` fait apparaître un bloc au défilement. Les effets de survol se posent sur
  l'enfant, pas sur le `Reveal`.
- Le réglage système "réduire les animations" est respecté : plus aucun mouvement, le contenu reste affiché. Les effets de
  survol ne s'appliquent qu'aux appareils à souris.

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework.

In addition, [Laracasts](https://laracasts.com) contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

You can also watch bite-sized lessons with real-world projects on [Laravel Learn](https://laravel.com/learn), where you will be guided through building a Laravel application from scratch while learning PHP fundamentals.

## Agentic Development

Laravel's predictable structure and conventions make it ideal for AI coding agents like Claude Code, Cursor, and GitHub Copilot. Install [Laravel Boost](https://laravel.com/docs/ai) to supercharge your AI workflow:

```bash
composer require laravel/boost --dev

php artisan boost:install
```

Boost provides your agent 15+ tools and skills that help agents build Laravel applications while following best practices.

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

3The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
