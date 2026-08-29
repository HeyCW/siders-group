<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Contact\SubmitContactMessageRequest;
use App\Models\ContactMessage;
use App\Services\ContactMessageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContactMessageController extends Controller
{
    public function __construct(private readonly ContactMessageService $contactMessageService) {}

    public function submit(SubmitContactMessageRequest $request): JsonResponse
    {
        $message = $this->contactMessageService->submit($request->validated());

        return response()->json(['data' => ['id' => $message->id]], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $messages = $this->contactMessageService->list(
            $request->query('status'),
            (int) $request->query('page', 1),
            min((int) $request->query('perPage', 20), 50),
        );

        return response()->json([
            'data' => collect($messages->items())->map(fn (ContactMessage $m) => $this->shape($m)),
            'meta' => ['total' => $messages->total(), 'page' => $messages->currentPage()],
        ]);
    }

    public function unreadCount(): JsonResponse
    {
        return response()->json(['data' => ['count' => $this->contactMessageService->unreadCount()]]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:new,read']]);
        $message = ContactMessage::findOrFail($id);

        $message = $data['status'] === 'read'
            ? $this->contactMessageService->markRead($message)
            : $this->contactMessageService->markNew($message);

        return response()->json(['data' => $this->shape($message)]);
    }

    private function shape(ContactMessage $message): array
    {
        return [
            'id' => $message->id,
            'name' => $message->name,
            'organisation' => $message->organisation,
            'email' => $message->email,
            'subject' => $message->subject,
            'message' => $message->message,
            'status' => $message->status,
            'createdAt' => $message->created_at->toIso8601String(),
        ];
    }
}
