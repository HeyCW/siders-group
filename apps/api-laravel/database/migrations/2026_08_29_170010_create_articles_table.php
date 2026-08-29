<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('articles', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->string('title', 500);
            $table->string('slug', 255)->unique();
            $table->json('body_json');
            $table->text('body_html');
            $table->text('excerpt')->nullable();
            $table->enum('status', ['draft', 'scheduled', 'published'])->default('draft');
            $table->char('author_id', 36);
            $table->char('featured_media_id', 36)->nullable();
            $table->char('anak_usaha_id', 36)->nullable();
            $table->text('seo_title')->nullable();
            $table->text('seo_description')->nullable();
            $table->dateTime('published_at', 3)->nullable();
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));
            $table->dateTime('updated_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->foreign('author_id')->references('id')->on('users');
            $table->foreign('featured_media_id')->references('id')->on('media')->nullOnDelete();
            $table->foreign('anak_usaha_id')->references('id')->on('anak_usaha')->nullOnDelete();

            $table->index(['status', 'published_at'], 'articles_status_published_at_idx');
            $table->index('author_id', 'articles_author_idx');
            $table->index('featured_media_id', 'articles_featured_media_idx');
            $table->index('anak_usaha_id', 'articles_anak_usaha_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('articles');
    }
};
