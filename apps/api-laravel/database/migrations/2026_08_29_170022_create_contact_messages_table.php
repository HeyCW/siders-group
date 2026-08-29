<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contact_messages', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->string('name', 255);
            $table->string('organisation', 255)->nullable();
            $table->string('email', 320);
            $table->string('subject', 512)->nullable();
            $table->text('message');
            $table->enum('status', ['new', 'read'])->default('new');
            $table->dateTime('created_at', 3)->default(DB::raw('CURRENT_TIMESTAMP(3)'));

            $table->index('created_at', 'contact_messages_created_at_idx');
            $table->index('status', 'contact_messages_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_messages');
    }
};
