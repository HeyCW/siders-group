<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('moderation_actions', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->char('actor_id', 36);
            $table->enum('target_type', ['comment', 'reader']);
            // Polymorphic, deliberately no FK — the action log survives even if the target
            // (comment/reader) is later deleted.
            $table->char('target_id', 36);
            $table->enum('action', [
                'comment_removed',
                'comment_restored',
                'comment_reports_dismissed',
                'reader_muted',
                'reader_unmuted',
                'reader_banned',
                'reader_unbanned',
            ]);
            $table->text('reason')->nullable();
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->foreign('actor_id')->references('id')->on('users');
            $table->index(['target_type', 'target_id', 'created_at'], 'moderation_actions_target_history_idx');
            $table->index('created_at', 'moderation_actions_created_at_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('moderation_actions');
    }
};
