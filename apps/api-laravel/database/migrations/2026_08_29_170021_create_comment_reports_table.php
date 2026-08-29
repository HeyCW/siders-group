<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comment_reports', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->char('comment_id', 36);
            $table->char('reporter_id', 36);
            $table->enum('reason', ['spam', 'harassment', 'off_topic', 'other']);
            $table->text('note')->nullable();
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));
            $table->dateTime('resolved_at', 3)->nullable();
            $table->char('resolved_by', 36)->nullable();
            // Stored generated column replacing a Postgres partial index. Deliberately nullable
            // (not NOT NULL) — MariaDB's grammar rejects NOT NULL on a STORED generated column;
            // MySQL 8 itself would allow it, but this stays engine-agnostic on purpose.
            $table->boolean('is_open')->nullable()->storedAs('(`resolved_at` is null)');

            $table->foreign('comment_id')->references('id')->on('comments')->cascadeOnDelete();
            $table->foreign('reporter_id')->references('id')->on('readers')->cascadeOnDelete();
            $table->foreign('resolved_by')->references('id')->on('users');
            $table->unique(['comment_id', 'reporter_id'], 'comment_reports_comment_reporter_unique');
            $table->index(['is_open', 'comment_id'], 'comment_reports_open_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comment_reports');
    }
};
