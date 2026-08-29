<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;

class Like extends Model
{
    use HasUuidPrimaryKey;

    const UPDATED_AT = null;

    protected $fillable = ['reader_id', 'article_id'];
}
