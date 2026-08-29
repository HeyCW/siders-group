<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->string('email', 320)->unique();
            $table->string('password_hash', 255);
            $table->boolean('must_change_password')->default(true);
            $table->string('name', 255);
            $table->char('role_id', 36);
            $table->enum('status', ['active', 'disabled'])->default('active');
            $table->dateTime('last_login_at', 3)->nullable();
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));
            $table->dateTime('updated_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->foreign('role_id')->references('id')->on('roles');
            $table->index('role_id', 'users_role_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
