<?php

use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\StaffAuthController;
use Illuminate\Support\Facades\Route;

Route::prefix('staff')->group(function () {
    Route::post('/login', [StaffAuthController::class, 'login'])->middleware('public');
    Route::post('/logout', [StaffAuthController::class, 'logout'])->middleware('auth:staff');
});

Route::prefix('auth/google')->group(function () {
    Route::get('/redirect', [GoogleAuthController::class, 'redirect'])->middleware('public');
    Route::get('/callback', [GoogleAuthController::class, 'callback'])->middleware('public');
});
