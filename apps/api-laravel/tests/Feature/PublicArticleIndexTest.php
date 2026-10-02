<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Article;
use App\Models\Category;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * `GET /api/articles` must honour the full `articlePublicListQuerySchema` — the `/news` "Load
 * more" button pages with `offset`, and ignoring it returned page one again (duplicate cards).
 */
class PublicArticleIndexTest extends TestCase
{
    use RefreshDatabase;

    private ?string $authorId = null;

    private function author(): string
    {
        if ($this->authorId !== null) {
            return $this->authorId;
        }

        $role = Role::create(['name' => 'Owner', 'slug' => 'owner', 'is_system' => true]);

        return $this->authorId = User::create([
            'email' => Str::random(8).'@example.com',
            'password_hash' => bcrypt('secret'),
            'must_change_password' => false,
            'name' => 'Test Owner',
            'role_id' => $role->id,
            'status' => 'active',
        ])->id;
    }

    private function published(Carbon $publishedAt, array $overrides = []): Article
    {
        return Article::create(array_merge([
            'title' => 'Untitled',
            'slug' => Str::random(12),
            'body_json' => ['type' => 'doc', 'content' => []],
            'body_html' => '',
            'status' => 'published',
            'published_at' => $publishedAt,
            'author_id' => $this->author(),
        ], $overrides));
    }

    /** @return list<string> */
    private function ids(string $query): array
    {
        return $this->getJson('/api/articles'.$query)->assertOk()->json('data.*.id');
    }

    public function test_offset_returns_the_next_page_without_repeating_articles(): void
    {
        foreach (range(1, 5) as $i) {
            $this->published(now()->subDays($i));
        }

        $first = $this->ids('?limit=3&offset=0');
        $second = $this->ids('?limit=3&offset=3');

        $this->assertCount(3, $first);
        $this->assertCount(2, $second);
        $this->assertSame([], array_intersect($first, $second));
    }

    public function test_paging_is_stable_when_articles_share_a_publish_instant(): void
    {
        $sameInstant = now()->subHour()->startOfSecond();
        foreach (range(1, 4) as $_) {
            $this->published($sameInstant);
        }

        $all = array_merge($this->ids('?limit=2&offset=0'), $this->ids('?limit=2&offset=2'));

        $this->assertCount(4, array_unique($all));
    }

    public function test_order_oldest_reverses_the_list(): void
    {
        $older = $this->published(now()->subDays(2));
        $newer = $this->published(now()->subDay());

        $this->assertSame([$newer->id, $older->id], $this->ids(''));
        $this->assertSame([$older->id, $newer->id], $this->ids('?order=oldest'));
    }

    public function test_filters_by_any_of_several_category_slugs(): void
    {
        $kuliner = Category::create(['name' => 'Kuliner', 'slug' => 'kuliner']);
        $wisata = Category::create(['name' => 'Wisata', 'slug' => 'wisata']);
        $a = $this->published(now()->subDay());
        $b = $this->published(now()->subDays(2));
        $this->published(now()->subDays(3));
        $a->categories()->sync([$kuliner->id]);
        $b->categories()->sync([$wisata->id]);

        $this->assertSame([$a->id, $b->id], $this->ids('?categorySlugs=kuliner,wisata'));
    }

    public function test_filters_by_published_range_and_excludes_ids(): void
    {
        $inRange = $this->published(Carbon::parse('2026-03-10T00:00:00Z'));
        $excluded = $this->published(Carbon::parse('2026-03-11T00:00:00Z'));
        $this->published(Carbon::parse('2026-04-10T00:00:00Z'));

        $ids = $this->ids(
            '?publishedAfter=2026-03-01T00:00:00Z&publishedBefore=2026-03-31T23:59:59Z&excludeIds='.$excluded->id
        );

        $this->assertSame([$inRange->id], $ids);
    }

    public function test_a_blank_search_is_no_search_and_an_oversized_limit_is_capped(): void
    {
        $this->published(now()->subDay());

        $this->getJson('/api/articles?q=%20%20&limit=500')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_rejects_a_malformed_order(): void
    {
        $this->getJson('/api/articles?order=random')->assertUnprocessable();
    }
}
