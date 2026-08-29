<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('guide_picks', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->string('city', 255);
            $table->string('place', 255);
            $table->text('description');
            $table->char('photo_media_id', 36);
            $table->char('video_media_id', 36);
            $table->integer('sort_order');
            $table->boolean('is_active')->default(true);
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));
            $table->dateTime('updated_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->foreign('photo_media_id')->references('id')->on('media')->restrictOnDelete();
            $table->foreign('video_media_id')->references('id')->on('media')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guide_picks');
    }
};
