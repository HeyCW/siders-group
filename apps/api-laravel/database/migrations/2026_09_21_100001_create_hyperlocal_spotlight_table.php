<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One permanent row holding at most one editor-picked article
     * (openspec/changes/add-hyperlocal-spotlight). `slot` is an enum of exactly one legal value
     * — a second row is rejected by the column's own type, not merely by application
     * discipline. `article_id` is nullable and never inserted or deleted after the seed below;
     * `NULL` is the ordinary "no editor pick" state, resolved by the API to the most recently
     * published article. The foreign key is `nullOnDelete()`, not `cascadeOnDelete()` as
     * `home_curation` uses — this row is the slot itself and must survive the article it points
     * at being deleted.
     */
    public function up(): void
    {
        Schema::create('hyperlocal_spotlight', function (Blueprint $table) {
            $table->enum('slot', ['default'])->primary();
            $table->char('article_id', 36)->nullable();
            $table->dateTime('updated_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->foreign('article_id')->references('id')->on('articles')->nullOnDelete();
        });

        // Seeded once, here — no code path ever inserts or deletes this row again.
        DB::table('hyperlocal_spotlight')->insert([
            'slot' => 'default',
            'article_id' => null,
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('hyperlocal_spotlight');
    }
};
