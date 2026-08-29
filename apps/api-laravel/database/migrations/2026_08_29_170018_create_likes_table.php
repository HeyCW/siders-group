<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('likes', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->char('reader_id', 36);
            $table->char('article_id', 36);
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->foreign('reader_id')->references('id')->on('readers')->cascadeOnDelete();
            $table->foreign('article_id')->references('id')->on('articles')->cascadeOnDelete();
            $table->unique(['reader_id', 'article_id'], 'likes_reader_article_unique');
            $table->index('article_id', 'likes_article_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('likes');
    }
};
