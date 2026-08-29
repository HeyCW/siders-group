<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('readers', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->string('google_sub', 128)->unique();
            $table->string('email', 320);
            $table->boolean('email_verified')->default(false);
            $table->string('name', 255);
            $table->text('avatar_url')->nullable();
            $table->enum('status', ['active', 'banned'])->default('active');
            $table->dateTime('muted_until', 3)->nullable();
            $table->dateTime('last_login_at', 3)->nullable();
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));
            $table->dateTime('updated_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('readers');
    }
};
