<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('partners', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->string('name', 255);
            $table->char('logo_media_id', 36);
            $table->text('website_url')->nullable();
            $table->integer('sort_order');
            $table->boolean('is_active')->default(true);
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));
            $table->dateTime('updated_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            // No fallback UI state without a logo — restrict, not set-null.
            $table->foreign('logo_media_id')->references('id')->on('media')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('partners');
    }
};
