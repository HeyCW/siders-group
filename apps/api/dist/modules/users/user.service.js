import { toStaffUserDto } from './user.mapper.js';
export function createUserService(repository) {
    return {
        async getById(id, access) {
            const row = await repository.findById(id);
            return row ? toStaffUserDto({ ...row, ...access }) : null;
        },
    };
}
