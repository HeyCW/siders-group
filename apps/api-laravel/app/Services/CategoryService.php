<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\CategoryConflictException;
use App\Models\Category;
use Illuminate\Support\Str;

class CategoryService
{
    public function create(string $name): Category
    {
        $slug = $this->slugFor($name, null);

        return Category::create(['name' => $name, 'slug' => $slug]);
    }

    public function update(Category $category, string $name): Category
    {
        $category->update(['name' => $name, 'slug' => $this->slugFor($name, $category->id)]);

        return $category;
    }

    /**
     * No app-level cascade needed: article_categories.category_id is ON DELETE CASCADE, so the
     * join rows clean themselves up — deleting a category never touches article content.
     */
    public function delete(Category $category): void
    {
        $category->delete();
    }

    private function slugFor(string $name, ?string $ignoreId): string
    {
        $slug = Str::slug($name);

        $exists = Category::where(fn ($q) => $q->where('name', $name)->orWhere('slug', $slug))
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new CategoryConflictException();
        }

        return $slug;
    }
}
