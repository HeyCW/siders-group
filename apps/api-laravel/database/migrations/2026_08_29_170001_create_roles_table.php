<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->string('name', 191)->unique();
            $table->string('slug', 191)->unique();
            $table->boolean('is_system')->default(false);
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));
            $table->dateTime('updated_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('roles');
    }
};
