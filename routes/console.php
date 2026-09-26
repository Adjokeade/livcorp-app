<?php

use App\Jobs\ProcessScheduledPayouts;
use Illuminate\Foundation\Console\ClosureCommand;
use App\Models\TrackingPoint;
use Illuminate\Support\Facades\Schedule;

// Calcul et déclenchement automatique des versements de commissions
// Cf. cahier des charges §3.4 : "périodicité journalière ou mensuelle"
Schedule::job(new ProcessScheduledPayouts)->dailyAt('20:00');

// Les positions GPS des livreurs sont des données personnelles : on ne les garde que le temps utile au suivi
// et aux éventuels litiges (30 jours).
Schedule::call(fn () => TrackingPoint::where('recorded_at', '<', now()->subDays(30))->delete())->dailyAt('03:00');
