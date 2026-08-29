<?php

use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\StaffAuthController;
use App\Http\Controllers\ReaderMeController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\StaffAccountController;
use App\Http\Controllers\StaffMeController;
use Illuminate\Support\Facades\Route;

Route::prefix('staff')->group(function () {
    Route::post('/login', [StaffAuthController::class, 'login'])->middleware('public');
    Route::post('/logout', [StaffAuthController::class, 'logout'])->middleware('auth:staff');
});

Route::prefix('auth/google')->group(function () {
    Route::get('/redirect', [GoogleAuthController::class, 'redirect'])->middleware('public');
    Route::get('/callback', [GoogleAuthController::class, 'callback'])->middleware('public');
});

// Self-service — deliberately exempt from `staff.password_change_not_pending` (this is the one
// pair of endpoints that must stay reachable while a password change is pending).
Route::prefix('staff/me')->middleware(['auth:staff', 'staff.active'])->group(function () {
    Route::get('/', [StaffMeController::class, 'show']);
    Route::post('/password', [StaffMeController::class, 'changePassword']);
});

Route::prefix('staff')->middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending'])->group(function () {
    Route::get('/', [StaffAccountController::class, 'index'])->middleware('permission:user.manage,role.manage');
    Route::post('/', [StaffAccountController::class, 'store'])->middleware('permission:user.manage');
    Route::post('/{id}/disable', [StaffAccountController::class, 'disable'])->middleware('permission:user.manage');
    Route::post('/{id}/reset', [StaffAccountController::class, 'reset'])->middleware('permission:user.manage');
});

Route::prefix('roles')->middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending'])->group(function () {
    Route::get('/permissions', [RoleController::class, 'permissions'])->middleware('permission:role.manage');
    Route::get('/', [RoleController::class, 'index'])->middleware('permission:user.manage,role.manage');
    Route::get('/{id}', [RoleController::class, 'show'])->middleware('permission:role.manage');
    Route::post('/', [RoleController::class, 'store'])->middleware('permission:role.manage');
    Route::patch('/{id}', [RoleController::class, 'update'])->middleware('permission:role.manage');
    Route::delete('/{id}', [RoleController::class, 'destroy'])->middleware('permission:role.manage');
    Route::post('/assign/{staffId}', [RoleController::class, 'assign'])->middleware('permission:role.manage');
});

Route::prefix('reader')->middleware(['auth:reader'])->group(function () {
    Route::get('/me', [ReaderMeController::class, 'show']);
});
