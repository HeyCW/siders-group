<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('comments', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->char('article_id', 36);
            $table->char('reader_id', 36);
            $table->text('body');
            $table->enum('status', ['visible', 'removed'])->default('visible');
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->foreign('article_id')->references('id')->on('articles')->cascadeOnDelete();
            $table->foreign('reader_id')->references('id')->on('readers')->cascadeOnDelete();
            $table->index(['article_id', 'created_at'], 'comments_article_created_at_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comments');
    }
};
