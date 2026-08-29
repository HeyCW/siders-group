<?php

use App\Services\ScheduledPublishService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::call(fn () => app(ScheduledPublishService::class)->run())
    ->name('scheduled-publish')
    ->everyMinute()
    ->withoutOverlapping();
