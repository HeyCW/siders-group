<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('anak_usaha_profile', function (Blueprint $table) {
            // Shared PK/FK — at most one profile per anak_usaha row, enforced structurally.
            $table->char('anak_usaha_id', 36)->primary();
            $table->char('logo_media_id', 36)->nullable();
            $table->string('background_color', 32)->nullable();
            $table->text('description')->nullable();
            // Not a native enum — validated at the app layer (Zod originally, Form Request now).
            $table->string('kind', 64);
            $table->json('links')->default(DB::raw("('[]')"));
            $table->integer('sort_order');
            $table->boolean('is_active')->default(true);
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));
            $table->dateTime('updated_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->foreign('anak_usaha_id')->references('id')->on('anak_usaha')->cascadeOnDelete();
            $table->foreign('logo_media_id')->references('id')->on('media')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('anak_usaha_profile');
    }
};
