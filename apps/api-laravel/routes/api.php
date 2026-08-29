<?php

use App\Http\Controllers\AnakUsahaController;
use App\Http\Controllers\ArticleController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\StaffAuthController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\MediaFileController;
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

// --- Media ---
Route::middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:media.manage'])->group(function () {
    Route::post('/media', [MediaController::class, 'store']);
    Route::get('/media/{id}', [MediaController::class, 'showById']);
    Route::patch('/media/{id}', [MediaController::class, 'update']);
    Route::delete('/media/{id}', [MediaController::class, 'destroy']);
});

// express.static equivalent — public, unauthenticated file serving.
Route::get('/media-files/{path}', [MediaFileController::class, 'show'])
    ->where('path', '.*')
    ->middleware('public');

// --- Categories ---
Route::get('/categories', [CategoryController::class, 'index'])->middleware('public');
Route::middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:category.manage'])->group(function () {
    Route::post('/categories', [CategoryController::class, 'store']);
    Route::patch('/categories/{id}', [CategoryController::class, 'update']);
    Route::delete('/categories/{id}', [CategoryController::class, 'destroy']);
});

// --- Anak Usaha ---
Route::get('/anak-usaha', [AnakUsahaController::class, 'publicIndex'])->middleware('public');
Route::middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:anak-usaha.manage'])->group(function () {
    Route::get('/anak-usaha/admin', [AnakUsahaController::class, 'adminIndex']);
    Route::post('/anak-usaha', [AnakUsahaController::class, 'store']);
    Route::patch('/anak-usaha/{id}', [AnakUsahaController::class, 'update']);
    Route::delete('/anak-usaha/{id}', [AnakUsahaController::class, 'destroy']);
    Route::post('/anak-usaha/{id}/profile', [AnakUsahaController::class, 'storeProfile']);
    Route::patch('/anak-usaha/{id}/profile', [AnakUsahaController::class, 'updateProfile']);
    Route::delete('/anak-usaha/{id}/profile', [AnakUsahaController::class, 'destroyProfile']);
    Route::put('/anak-usaha/profile/order', [AnakUsahaController::class, 'reorderProfiles']);
});

// --- Articles ---
Route::get('/articles', [ArticleController::class, 'publicIndex'])->middleware('public');
Route::get('/articles/{slug}', [ArticleController::class, 'publicShow'])->middleware('public');

Route::prefix('admin/articles')
    ->middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:news.manage'])
    ->group(function () {
        Route::get('/', [ArticleController::class, 'adminIndex']);
        Route::post('/', [ArticleController::class, 'store']);
        Route::get('/{id}', [ArticleController::class, 'adminShow']);
        Route::patch('/{id}', [ArticleController::class, 'update']);
        Route::patch('/{id}/autosave', [ArticleController::class, 'autosave']);
        Route::delete('/{id}', [ArticleController::class, 'destroy']);
        Route::post('/{id}/publish', [ArticleController::class, 'publish']);
        Route::post('/{id}/unpublish', [ArticleController::class, 'unpublish']);
        Route::post('/{id}/schedule', [ArticleController::class, 'schedule']);
    });
