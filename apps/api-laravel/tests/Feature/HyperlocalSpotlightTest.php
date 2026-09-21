<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Article;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Covers openspec/changes/add-hyperlocal-spotlight/specs/hyperlocal-spotlight/spec.md end to
 * end: the checkbox lives on the article write endpoints, there is no separate write route, and
 * the public/admin reads resolve editor-pick-else-newest-published.
 */
class HyperlocalSpotlightTest extends TestCase
{
    use RefreshDatabase;

    /** The seeded `Owner` role — `OwnerRoleResolver` recognizes it by `is_system` alone, so this
     *  sidesteps seeding the whole permission catalog just to pass `permission:news.manage`. */
    private function ownerStaff(): User
    {
        $role = Role::create(['name' => 'Owner', 'slug' => 'owner', 'is_system' => true]);

        return User::create([
            'email' => Str::random(8).'@example.com',
            'password_hash' => bcrypt('secret'),
            'must_change_password' => false,
            'name' => 'Test Owner',
            'role_id' => $role->id,
            'status' => 'active',
        ]);
    }

    private function article(array $overrides = []): Article
    {
        return Article::create(array_merge([
            'title' => 'Untitled',
            'slug' => Str::random(12),
            'body_json' => ['type' => 'doc', 'content' => []],
            'body_html' => '',
            'status' => 'draft',
            'author_id' => $this->ownerStaff()->id,
        ], $overrides));
    }

    public function test_admin_read_requires_authentication(): void
    {
        $this->getJson('/api/admin/hyperlocal-spotlight')->assertUnauthorized();
    }

    public function test_public_read_reports_no_article_when_nothing_is_publicly_visible(): void
    {
        $this->article(['status' => 'draft', 'published_at' => null]);

        $this->getJson('/api/home/hyperlocal-spotlight')
            ->assertOk()
            ->assertJson(['data' => ['article' => null, 'isEditorPick' => false]]);
    }

    public function test_public_read_falls_back_to_the_newest_published_article_when_no_pick_is_set(): void
    {
        $older = $this->article(['status' => 'published', 'published_at' => now()->subDay()]);
        $newer = $this->article(['status' => 'published', 'published_at' => now()]);

        $this->getJson('/api/home/hyperlocal-spotlight')
            ->assertOk()
            ->assertJsonPath('data.article.id', $newer->id)
            ->assertJsonPath('data.isEditorPick', false);
    }

    public function test_spotlight_is_set_at_article_creation(): void
    {
        $staff = $this->ownerStaff();

        $response = $this->actingAs($staff, 'staff')->postJson('/api/admin/articles', [
            'title' => 'A Hyperlocal Story',
            'isHyperlocalSpotlight' => true,
        ])->assertCreated();

        $articleId = $response->json('data.id');
        $this->assertTrue($response->json('data.isHyperlocalSpotlight'));

        // Publish it so the public read can see it, then confirm it resolves as the editor pick.
        $this->actingAs($staff, 'staff')->postJson("/api/admin/articles/{$articleId}/publish")->assertOk();

        $this->getJson('/api/home/hyperlocal-spotlight')
            ->assertOk()
            ->assertJsonPath('data.article.id', $articleId)
            ->assertJsonPath('data.isEditorPick', true);
    }

    public function test_spotlighting_one_article_releases_the_previous_holder_without_altering_it(): void
    {
        $staff = $this->ownerStaff();
        $a = $this->article(['title' => 'A', 'status' => 'published', 'published_at' => now()]);
        $b = $this->article(['title' => 'B', 'status' => 'published', 'published_at' => now()]);

        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$a->id}", ['isHyperlocalSpotlight' => true])
            ->assertOk()->assertJsonPath('data.isHyperlocalSpotlight', true);

        $response = $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$b->id}", ['isHyperlocalSpotlight' => true])
            ->assertOk();
        $this->assertTrue($response->json('data.isHyperlocalSpotlight'));

        // A no longer holds it, but is otherwise completely untouched.
        $aResponse = $this->actingAs($staff, 'staff')->getJson("/api/admin/articles/{$a->id}")->assertOk();
        $this->assertFalse($aResponse->json('data.isHyperlocalSpotlight'));
        $this->assertSame('A', $aResponse->json('data.title'));
        $this->assertSame('published', $aResponse->json('data.status'));
    }

    public function test_unsetting_the_flag_on_the_holder_releases_it_and_the_spotlight_falls_back(): void
    {
        $staff = $this->ownerStaff();
        $held = $this->article(['title' => 'Held', 'status' => 'published', 'published_at' => now()->subHour()]);
        $newer = $this->article(['title' => 'Newer', 'status' => 'published', 'published_at' => now()]);

        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$held->id}", ['isHyperlocalSpotlight' => true])
            ->assertOk();

        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$held->id}", ['isHyperlocalSpotlight' => false])
            ->assertOk()
            ->assertJsonPath('data.isHyperlocalSpotlight', false);

        $this->getJson('/api/home/hyperlocal-spotlight')
            ->assertOk()
            ->assertJsonPath('data.article.id', $newer->id)
            ->assertJsonPath('data.isEditorPick', false);
    }

    public function test_unsetting_the_flag_on_a_non_holder_is_a_no_op(): void
    {
        $staff = $this->ownerStaff();
        $holder = $this->article(['title' => 'Holder']);
        $other = $this->article(['title' => 'Other']);

        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$holder->id}", ['isHyperlocalSpotlight' => true])
            ->assertOk();

        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$other->id}", ['isHyperlocalSpotlight' => false])
            ->assertOk();

        $holderResponse = $this->actingAs($staff, 'staff')->getJson("/api/admin/articles/{$holder->id}")->assertOk();
        $this->assertTrue($holderResponse->json('data.isHyperlocalSpotlight'));
    }

    public function test_saving_without_the_flag_leaves_the_spotlight_untouched(): void
    {
        $staff = $this->ownerStaff();
        $holder = $this->article(['title' => 'Holder']);

        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$holder->id}", ['isHyperlocalSpotlight' => true])
            ->assertOk();

        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$holder->id}", ['title' => 'Holder renamed'])
            ->assertOk()
            ->assertJsonPath('data.isHyperlocalSpotlight', true);
    }

    public function test_autosave_cannot_move_the_spotlight_even_if_asked_to(): void
    {
        $staff = $this->ownerStaff();
        $a = $this->article(['title' => 'A']);
        $b = $this->article(['title' => 'B']);

        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$b->id}", ['isHyperlocalSpotlight' => true])
            ->assertOk();

        // AutosaveArticleRequest::rules() declares no such field, so Laravel's validated() drops
        // it silently — it is never seen by ArticleService::autosave() at all.
        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$a->id}/autosave", ['title' => 'A edited', 'isHyperlocalSpotlight' => true])
            ->assertOk();

        $bResponse = $this->actingAs($staff, 'staff')->getJson("/api/admin/articles/{$b->id}")->assertOk();
        $this->assertTrue($bResponse->json('data.isHyperlocalSpotlight'));
    }

    public function test_admin_read_reports_an_invisible_pick_alongside_what_is_resolved_publicly(): void
    {
        $staff = $this->ownerStaff();
        $draftPick = $this->article(['title' => 'Draft Pick', 'status' => 'draft']);
        $published = $this->article(['title' => 'Published', 'status' => 'published', 'published_at' => now()]);

        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$draftPick->id}", ['isHyperlocalSpotlight' => true])
            ->assertOk();

        $this->actingAs($staff, 'staff')
            ->getJson('/api/admin/hyperlocal-spotlight')
            ->assertOk()
            ->assertJsonPath('data.editorPick.article.id', $draftPick->id)
            ->assertJsonPath('data.editorPick.isPubliclyVisible', false)
            ->assertJsonPath('data.resolved.id', $published->id)
            ->assertJsonPath('data.resolvedIsEditorPick', false);
    }

    public function test_deleting_the_pick_hands_the_spotlight_to_the_newest_article(): void
    {
        $staff = $this->ownerStaff();
        $pick = $this->article(['title' => 'Pick', 'status' => 'published', 'published_at' => now()]);
        $older = $this->article(['title' => 'Older', 'status' => 'published', 'published_at' => now()->subDay()]);

        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$pick->id}", ['isHyperlocalSpotlight' => true])
            ->assertOk();

        $this->actingAs($staff, 'staff')->deleteJson("/api/admin/articles/{$pick->id}")->assertOk();

        $this->getJson('/api/home/hyperlocal-spotlight')
            ->assertOk()
            ->assertJsonPath('data.article.id', $older->id);
    }

    public function test_replacing_the_curated_home_list_leaves_the_spotlight_intact(): void
    {
        $staff = $this->ownerStaff();
        $spotlighted = $this->article(['title' => 'Spotlighted', 'status' => 'published', 'published_at' => now()]);
        $curated = $this->article(['title' => 'Curated', 'status' => 'published', 'published_at' => now()]);

        $this->actingAs($staff, 'staff')
            ->patchJson("/api/admin/articles/{$spotlighted->id}", ['isHyperlocalSpotlight' => true])
            ->assertOk();

        $this->actingAs($staff, 'staff')
            ->putJson('/api/admin/curation', ['articleIds' => [$curated->id]])
            ->assertOk();

        $this->getJson('/api/home/hyperlocal-spotlight')
            ->assertOk()
            ->assertJsonPath('data.article.id', $spotlighted->id);
    }
}
