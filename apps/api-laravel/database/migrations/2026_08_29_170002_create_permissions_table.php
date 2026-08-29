<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permissions', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->string('key', 191)->unique();
            $table->text('description');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('permissions');
    }
};
