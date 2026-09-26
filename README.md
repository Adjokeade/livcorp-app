<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

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
- **Code de remise** : 4 chiffres par commande, montré au client seul. Le livreur le saisit pour clôturer la course (5 essais,
  puis blocage de 15 minutes et client prévenu). Pour un paiement en espèces, une photo de remise est obligatoire.
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
