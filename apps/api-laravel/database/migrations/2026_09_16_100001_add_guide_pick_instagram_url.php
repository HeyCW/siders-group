<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('guide_picks', function (Blueprint $table) {
            $table->text('instagram_url')->nullable()->after('video_media_id');
        });
    }

    public function down(): void
    {
        Schema::table('guide_picks', function (Blueprint $table) {
            $table->dropColumn('instagram_url');
        });
    }
};
