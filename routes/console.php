<?php

use App\Jobs\ProcessScheduledPayouts;
use Illuminate\Foundation\Console\ClosureCommand;
use Illuminate\Support\Facades\Schedule;

// Calcul et déclenchement automatique des versements de commissions
// Cf. cahier des charges §3.4 : "périodicité journalière ou mensuelle"
Schedule::job(new ProcessScheduledPayouts)->dailyAt('20:00');
