<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('article_views_daily', function (Blueprint $table) {
            $table->char('article_id', 36);
            $table->date('date');
            $table->integer('views')->default(0);
            $table->integer('unique_views')->default(0);
            $table->primary(['article_id', 'date']);
            $table->foreign('article_id')->references('id')->on('articles')->cascadeOnDelete();
            $table->index('date', 'article_views_daily_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('article_views_daily');
    }
};
