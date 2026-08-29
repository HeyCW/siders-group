<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Category;
use App\Services\CategoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function __construct(private readonly CategoryService $categoryService) {}

    public function index(): JsonResponse
    {
        return response()->json(['data' => Category::orderBy('name')->get(['id', 'name', 'slug'])]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate(['name' => ['required', 'string', 'max:255']]);
        $category = $this->categoryService->create($request->string('name')->value());

        return response()->json(['data' => $category], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $request->validate(['name' => ['required', 'string', 'max:255']]);
        $category = $this->categoryService->update(Category::findOrFail($id), $request->string('name')->value());

        return response()->json(['data' => $category]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->categoryService->delete(Category::findOrFail($id));

        return response()->json(['data' => null]);
    }
}
