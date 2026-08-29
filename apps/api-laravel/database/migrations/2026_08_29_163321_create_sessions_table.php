<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Laravel's own session store — renamed to `framework_sessions` so it never collides with
     * the legacy polymorphic `sessions` table preserved from the Node app for historical data.
     */
    public function up(): void
    {
        Schema::create('framework_sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            // A plain string, not foreignId/bigint: both `users.id` and `readers.id` are char(36)
            // UUIDs, not auto-increment integers, and either guard may populate this column.
            $table->string('user_id', 36)->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('framework_sessions');
    }
};
