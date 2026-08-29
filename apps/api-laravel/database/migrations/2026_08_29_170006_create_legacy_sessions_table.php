<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Preserved from the previous Node app for data continuity only — no longer written by new
     * code (Sanctum's own `framework_sessions` table replaces its role, see that migration).
     * Polymorphic across staff/reader subjects by design, so `subject_id` carries no FK.
     */
    public function up(): void
    {
        Schema::create('sessions', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->char('subject_id', 36);
            $table->enum('subject_type', ['staff', 'reader']);
            $table->string('refresh_token_hash', 128)->unique();
            $table->char('family_id', 36);
            $table->text('user_agent')->nullable();
            $table->string('ip_hash', 128)->nullable();
            $table->dateTime('expires_at', 3);
            $table->dateTime('absolute_expires_at', 3);
            $table->dateTime('revoked_at', 3)->nullable();
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->index(['subject_type', 'subject_id'], 'sessions_subject_idx');
            $table->index('family_id', 'sessions_family_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
    }
};
