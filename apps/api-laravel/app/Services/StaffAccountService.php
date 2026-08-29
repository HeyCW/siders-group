<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\CannotActOnSelfException;
use App\Exceptions\DuplicateEmailException;
use App\Exceptions\InvalidCurrentPasswordException;
use App\Exceptions\OwnerActionRequiresOwnerException;
use App\Models\Role;
use App\Models\User;
use App\Support\StaffEmail;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class StaffAccountService
{
    public function __construct(
        private readonly OwnerRoleResolver $ownerRoleResolver,
        private readonly SessionRevocationService $sessionRevocationService,
    ) {}

    /** @return Collection<int, User> */
    public function list(): Collection
    {
        return User::with('role')->orderBy('name')->get();
    }

    /**
     * @return array{user: User, temporaryPassword: string}
     */
    public function create(User $actor, string $email, string $name, Role $role): array
    {
        $email = $this->normalizeEmail($email);

        if (User::where('email', $email)->exists()) {
            throw new DuplicateEmailException();
        }

        if ($this->ownerRoleResolver->isOwner($role->id) && ! $this->ownerRoleResolver->isOwner($actor->role_id)) {
            throw new OwnerActionRequiresOwnerException();
        }

        $temporaryPassword = Str::password(16);

        $user = User::create([
            'email' => $email,
            'name' => $name,
            'role_id' => $role->id,
            'password_hash' => Hash::make($temporaryPassword),
            'must_change_password' => true,
            'status' => 'active',
        ]);

        return ['user' => $user, 'temporaryPassword' => $temporaryPassword];
    }

    public function disable(User $actor, User $target): void
    {
        if ($actor->id === $target->id) {
            throw new CannotActOnSelfException('You cannot disable your own account.');
        }

        $this->assertMayActOnOwner($actor, $target);

        DB::transaction(function () use ($target) {
            $target->update(['status' => 'disabled']);
            $this->sessionRevocationService->revokeAllForUser($target->id);
        });
    }

    /** @return array{user: User, temporaryPassword: string} */
    public function reset(User $actor, User $target): array
    {
        $this->assertMayActOnOwner($actor, $target);

        $temporaryPassword = Str::password(16);

        DB::transaction(function () use ($target, $temporaryPassword) {
            $target->update([
                'password_hash' => Hash::make($temporaryPassword),
                'must_change_password' => true,
            ]);
            $this->sessionRevocationService->revokeAllForUser($target->id);
        });

        return ['user' => $target, 'temporaryPassword' => $temporaryPassword];
    }

    /**
     * Keeps the caller's own (current) session alive while revoking every other session for
     * this account — a password change elsewhere shouldn't log the person doing it out too.
     */
    public function changeOwnPassword(User $actor, string $currentPassword, string $newPassword, string $currentSessionId): void
    {
        if (! Hash::check($currentPassword, $actor->password_hash)) {
            throw new InvalidCurrentPasswordException();
        }

        DB::transaction(function () use ($actor, $newPassword, $currentSessionId) {
            $actor->update([
                'password_hash' => Hash::make($newPassword),
                'must_change_password' => false,
            ]);
            $this->sessionRevocationService->revokeAllForUserExcept($actor->id, $currentSessionId);
        });
    }

    private function assertMayActOnOwner(User $actor, User $target): void
    {
        if ($this->ownerRoleResolver->isOwner($target->role_id) && ! $this->ownerRoleResolver->isOwner($actor->role_id)) {
            throw new OwnerActionRequiresOwnerException();
        }
    }

    private function normalizeEmail(string $email): string
    {
        return StaffEmail::normalize($email);
    }
}
