<?php

use App\Http\Controllers\AnakUsahaController;
use App\Http\Controllers\ArticleController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\StaffAuthController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\ContactMessageController;
use App\Http\Controllers\CurationController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\EngagementController;
use App\Http\Controllers\GuidePickController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\ModerationController;
use App\Http\Controllers\PartnerController;
use App\Http\Controllers\ReaderMeController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\StaffAccountController;
use App\Http\Controllers\StaffMeController;
use Illuminate\Support\Facades\Route;

Route::prefix('staff')->group(function () {
    Route::post('/login', [StaffAuthController::class, 'login'])->middleware(['public', 'throttle:staff-login']);
    Route::post('/logout', [StaffAuthController::class, 'logout'])->middleware('auth:staff');
});

Route::prefix('auth/google')->group(function () {
    Route::get('/redirect', [GoogleAuthController::class, 'redirect'])->middleware('public');
    Route::get('/callback', [GoogleAuthController::class, 'callback'])->middleware(['public', 'throttle:google-callback']);
});

// Self-service — deliberately exempt from `staff.password_change_not_pending` (this is the one
// pair of endpoints that must stay reachable while a password change is pending).
Route::prefix('staff/me')->middleware(['auth:staff', 'staff.active'])->group(function () {
    Route::get('/', [StaffMeController::class, 'show']);
    Route::post('/password', [StaffMeController::class, 'changePassword'])->middleware('throttle:password-change');
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
    Route::post('/logout', [ReaderMeController::class, 'logout']);
});

// --- Media ---
Route::middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:media.manage'])->group(function () {
    Route::post('/media', [MediaController::class, 'store'])->middleware('throttle:media-upload');
    Route::get('/media/{id}', [MediaController::class, 'showById']);
    Route::patch('/media/{id}', [MediaController::class, 'update']);
    Route::delete('/media/{id}', [MediaController::class, 'destroy']);
});

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

// --- Curation / Home feed ---
Route::get('/home', [CurationController::class, 'publicFeed'])->middleware('public');
Route::middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:news.manage'])->group(function () {
    Route::get('/admin/curation', [CurationController::class, 'adminIndex']);
    Route::put('/admin/curation', [CurationController::class, 'replace']);
});

// --- Partners (settings.manage — treated as site config, not editorial content) ---
Route::get('/partners', [PartnerController::class, 'publicIndex'])->middleware('public');
Route::middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:settings.manage'])->group(function () {
    Route::get('/admin/partners', [PartnerController::class, 'adminIndex']);
    Route::post('/admin/partners', [PartnerController::class, 'store']);
    Route::patch('/admin/partners/{id}', [PartnerController::class, 'update']);
    Route::delete('/admin/partners/{id}', [PartnerController::class, 'destroy']);
    Route::put('/admin/partners/order', [PartnerController::class, 'reorder']);
});

// --- Guide Picks (news.manage — editorial content, unlike partners) ---
Route::get('/guide-picks', [GuidePickController::class, 'publicIndex'])->middleware('public');
Route::middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:news.manage'])->group(function () {
    Route::get('/admin/guide-picks', [GuidePickController::class, 'adminIndex']);
    Route::post('/admin/guide-picks', [GuidePickController::class, 'store']);
    Route::patch('/admin/guide-picks/{id}', [GuidePickController::class, 'update']);
    Route::delete('/admin/guide-picks/{id}', [GuidePickController::class, 'destroy']);
    Route::put('/admin/guide-picks/order', [GuidePickController::class, 'reorder']);
});

// --- Engagement (mounted alongside public articles) ---
Route::prefix('articles/{id}')->middleware('public')->group(function () {
    Route::post('/view', [EngagementController::class, 'recordView'])->middleware('throttle:engagement-view');
    Route::get('/engagement', [EngagementController::class, 'summary']);
    Route::get('/comments', [EngagementController::class, 'comments']);
});
Route::prefix('articles/{id}')->middleware(['auth:reader'])->group(function () {
    Route::post('/like', [EngagementController::class, 'like'])->middleware('throttle:engagement-like');
    Route::post('/comments', [EngagementController::class, 'createComment'])->middleware(['reader.can_author_content', 'throttle:engagement-comment']);
});

// --- Moderation ---
Route::prefix('admin/comments')->middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:moderation.manage'])->group(function () {
    Route::get('/', [ModerationController::class, 'commentQueue']);
    Route::patch('/{id}', [ModerationController::class, 'moderateComment']);
    Route::patch('/{id}/reports/dismiss', [ModerationController::class, 'dismissReports']);
});
Route::prefix('admin/readers')->middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:moderation.manage'])->group(function () {
    Route::get('/', [ModerationController::class, 'readerQueue']);
    Route::patch('/{id}', [ModerationController::class, 'moderateReader']);
});
Route::post('/comments/{id}/report', [ModerationController::class, 'reportComment'])
    ->middleware(['auth:reader', 'throttle:comment-report']);

// --- Analytics ---
Route::get('/admin/dashboard', [DashboardController::class, 'index'])
    ->middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:dashboard.view']);

// --- Contact messages ---
Route::post('/contact-messages', [ContactMessageController::class, 'submit'])->middleware(['public', 'throttle:contact-submit']);
Route::prefix('admin/contact-messages')
    ->middleware(['auth:staff', 'staff.active', 'staff.password_change_not_pending', 'permission:contact.manage'])
    ->group(function () {
        Route::get('/', [ContactMessageController::class, 'index']);
        Route::get('/unread-count', [ContactMessageController::class, 'unreadCount']);
        Route::patch('/{id}', [ContactMessageController::class, 'update']);
    });
