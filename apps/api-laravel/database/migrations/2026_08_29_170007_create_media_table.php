<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->string('storage_path', 512)->unique();
            $table->string('mime', 255);
            $table->integer('size_bytes');
            $table->string('original_filename', 512);
            $table->text('alt')->nullable();
            $table->text('caption')->nullable();
            $table->char('uploaded_by', 36)->nullable();
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->foreign('uploaded_by')->references('id')->on('users')->nullOnDelete();
            $table->index('uploaded_by', 'media_uploaded_by_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media');
    }
};
