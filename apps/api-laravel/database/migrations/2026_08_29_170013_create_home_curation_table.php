<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('home_curation', function (Blueprint $table) {
            // Shared PK/FK — a curated slot is 1:1 with an article, duplicate picks structurally
            // impossible.
            $table->char('article_id', 36)->primary();
            $table->integer('position')->unique();
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->foreign('article_id')->references('id')->on('articles')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('home_curation');
    }
};
