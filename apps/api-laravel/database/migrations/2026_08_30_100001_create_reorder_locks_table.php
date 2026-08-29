<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One sentinel row per orderable list — a reorder transaction takes a `lockForUpdate()` row
     * lock on its row here, serializing concurrent reorders of the *same* list without needing
     * MySQL named advisory locks (GET_LOCK). Transaction-scoped, released automatically on
     * commit/rollback.
     */
    public function up(): void
    {
        Schema::create('reorder_locks', function (Blueprint $table) {
            $table->string('name')->primary();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reorder_locks');
    }
};
