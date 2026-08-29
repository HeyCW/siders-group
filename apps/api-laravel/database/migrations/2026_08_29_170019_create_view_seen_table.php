<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('view_seen', function (Blueprint $table) {
            $table->char('article_id', 36);
            $table->string('visitor_hash', 128);
            $table->date('date');
            $table->primary(['article_id', 'visitor_hash', 'date']);
            $table->foreign('article_id')->references('id')->on('articles')->cascadeOnDelete();
            $table->index('date', 'view_seen_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('view_seen');
    }
};
