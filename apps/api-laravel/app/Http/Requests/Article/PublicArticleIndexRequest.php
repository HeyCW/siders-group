<?php

declare(strict_types=1);

namespace App\Http\Requests\Article;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Port of packages/contracts/src/article.ts's `articlePublicListQuerySchema` — the `/news`
 * explorer, related rail and sitemap all page and filter through these params.
 */
class PublicArticleIndexRequest extends FormRequest
{
    public const DEFAULT_LIMIT = 20;

    public const MAX_LIMIT = 50;

    private const LIST_PARAMS = ['categorySlugs', 'anakUsahaSlugs', 'excludeIds'];

    public function authorize(): bool
    {
        return true;
    }

    /** Comma-separated lists become arrays and a blank `q` becomes "no search", mirroring the
     *  contract's preprocessing — a reader clearing the search box must not produce a 422. */
    protected function prepareForValidation(): void
    {
        $normalized = [];

        foreach (self::LIST_PARAMS as $key) {
            $value = $this->query($key);
            if (is_string($value)) {
                $normalized[$key] = array_values(array_filter(explode(',', $value), fn (string $s) => $s !== ''));
            }
        }

        $q = $this->query('q');
        $normalized['q'] = is_string($q) && trim($q) !== '' ? trim($q) : null;

        $this->merge($normalized);
    }

    public function rules(): array
    {
        return [
            // Clamped to MAX_LIMIT in validatedFilter(), not rejected — the contract's "Limit is capped".
            'limit' => ['sometimes', 'integer', 'min:1'],
            'offset' => ['sometimes', 'integer', 'min:0'],
            'categorySlugs' => ['sometimes', 'array'],
            'categorySlugs.*' => ['string'],
            'anakUsahaSlugs' => ['sometimes', 'array'],
            'anakUsahaSlugs.*' => ['string'],
            'excludeIds' => ['sometimes', 'array'],
            'excludeIds.*' => ['uuid'],
            'publishedAfter' => ['sometimes', 'date'],
            'publishedBefore' => ['sometimes', 'date'],
            'order' => ['sometimes', 'in:newest,oldest'],
            'q' => ['nullable', 'string', 'max:100'],
        ];
    }

    /** The validated query with every default applied, ready for ArticleService::listPublic(). */
    public function validatedFilter(): array
    {
        $data = $this->validated();

        return [
            'limit' => min((int) ($data['limit'] ?? self::DEFAULT_LIMIT), self::MAX_LIMIT),
            'offset' => (int) ($data['offset'] ?? 0),
            'categorySlugs' => $data['categorySlugs'] ?? [],
            'anakUsahaSlugs' => $data['anakUsahaSlugs'] ?? [],
            'excludeIds' => $data['excludeIds'] ?? [],
            'publishedAfter' => $data['publishedAfter'] ?? null,
            'publishedBefore' => $data['publishedBefore'] ?? null,
            'order' => $data['order'] ?? 'newest',
            'q' => $data['q'] ?? null,
        ];
    }
}
