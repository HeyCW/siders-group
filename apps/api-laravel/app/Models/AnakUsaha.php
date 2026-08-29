<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class AnakUsaha extends Model
{
    use HasUuidPrimaryKey;

    const UPDATED_AT = null;

    /** Eloquent's naive pluralization would guess `anak_usahas`; the real table has no plural. */
    protected $table = 'anak_usaha';

    protected $fillable = ['name', 'slug'];

    public function profile(): HasOne
    {
        return $this->hasOne(AnakUsahaProfile::class);
    }

    public function articles(): HasMany
    {
        return $this->hasMany(Article::class);
    }
}
