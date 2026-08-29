<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('article_categories', function (Blueprint $table) {
            $table->char('article_id', 36);
            $table->char('category_id', 36);
            $table->primary(['article_id', 'category_id']);
            $table->foreign('article_id')->references('id')->on('articles')->cascadeOnDelete();
            $table->foreign('category_id')->references('id')->on('categories')->cascadeOnDelete();
            $table->index('category_id', 'article_categories_category_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('article_categories');
    }
};
