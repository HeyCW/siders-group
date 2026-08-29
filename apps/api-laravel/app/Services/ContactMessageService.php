<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ContactMessage;
use Illuminate\Pagination\LengthAwarePaginator;

class ContactMessageService
{
    public function submit(array $data): ContactMessage
    {
        return ContactMessage::create([
            'name' => $data['name'],
            'organisation' => $data['organisation'] ?? null,
            'email' => $data['email'],
            'subject' => $data['subject'] ?? null,
            'message' => $data['message'],
            'status' => 'new',
        ]);
    }

    public function list(?string $statusFilter, int $page, int $perPage): LengthAwarePaginator
    {
        return ContactMessage::query()
            ->when($statusFilter && $statusFilter !== 'all', fn ($q) => $q->where('status', $statusFilter))
            ->orderByDesc('created_at')
            ->paginate($perPage, page: $page);
    }

    public function unreadCount(): int
    {
        return ContactMessage::where('status', 'new')->count();
    }

    public function markRead(ContactMessage $message): ContactMessage
    {
        $message->update(['status' => 'read']);

        return $message;
    }

    public function markNew(ContactMessage $message): ContactMessage
    {
        $message->update(['status' => 'new']);

        return $message;
    }
}
