export declare const MODERATION_TARGET_TYPE_VALUES: readonly ["comment", "reader"];
export type ModerationTargetTypeValue = (typeof MODERATION_TARGET_TYPE_VALUES)[number];
/** `comment_reports_dismissed` is its own action, distinct from `comment_removed` — "this comment
 *  stays up despite being reported" is a decision worth its own record
 *  (design.md - Decision 8). */
export declare const MODERATION_ACTION_VALUES: readonly ["comment_removed", "comment_restored", "comment_reports_dismissed", "reader_muted", "reader_unmuted", "reader_banned", "reader_unbanned"];
export type ModerationActionValue = (typeof MODERATION_ACTION_VALUES)[number];
/**
 * One row per moderation action taken, never overwritten — a repeat offender is a question this
 * table can answer and a `removed_by`/`banned_at` column pair on the target tables could not
 * (design.md - Decision 3, "Only the latest action is ever visible"). This is not the general
 * `audit_log` `docs/ARCHITECTURE.md` §11 still lists as outstanding: it is scoped to exactly the
 * seven actions above, with a shape suited to that narrow purpose, not a stand-in for logging
 * every admin mutation.
 *
 * `targetId` is **deliberately not a foreign key** to either `comments` or `readers` — the table
 * is polymorphic across both, so one FK column cannot reference either, and a target deleted
 * later should not be able to erase the record that it was once moderated (design.md - Decision
 * 3). The cost, stated plainly: `targetId` carries no referential integrity, so a reference to a
 * since-deleted target is possible, and reading moderation history against one is the
 * application's responsibility, not the database's.
 *
 * No column is added to `comments` or `readers` here. `status` (both tables) and `mutedUntil`
 * (`readers`) already exist and are already enforced — by `visibleComments()` in
 * `engagement.repository.ts` and by `requireReader` in
 * `apps/api/src/middleware/authorize.ts` — before this table or the surface that writes to them
 * existed. This table only gives staff a way to set them, and a record that they did.
 */
export declare const moderationActions: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "moderation_actions";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "id";
            tableName: "moderation_actions";
            dataType: "string";
            columnType: "MySqlChar";
            data: string;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        actorId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "actor_id";
            tableName: "moderation_actions";
            dataType: "string";
            columnType: "MySqlChar";
            data: string;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        targetType: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "target_type";
            tableName: "moderation_actions";
            dataType: "string";
            columnType: "MySqlEnumColumn";
            data: "reader" | "comment";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["comment", "reader"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        targetId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "target_id";
            tableName: "moderation_actions";
            dataType: "string";
            columnType: "MySqlChar";
            data: string;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        action: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "action";
            tableName: "moderation_actions";
            dataType: "string";
            columnType: "MySqlEnumColumn";
            data: "comment_removed" | "comment_restored" | "comment_reports_dismissed" | "reader_muted" | "reader_unmuted" | "reader_banned" | "reader_unbanned";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["comment_removed", "comment_restored", "comment_reports_dismissed", "reader_muted", "reader_unmuted", "reader_banned", "reader_unbanned"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        reason: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "reason";
            tableName: "moderation_actions";
            dataType: "string";
            columnType: "MySqlText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        createdAt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "created_at";
            tableName: "moderation_actions";
            dataType: "date";
            columnType: "MySqlDateTime";
            data: Date;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
    };
    dialect: "mysql";
}>;
export declare const COMMENT_REPORT_REASON_VALUES: readonly ["spam", "harassment", "off_topic", "other"];
export type CommentReportReasonValue = (typeof COMMENT_REPORT_REASON_VALUES)[number];
/**
 * One open report per reader per comment — the unique index on `(commentId, reporterId)` is what
 * enforces "a reader may report a given comment only once"
 * (specs/community-moderation/spec.md), not application logic re-checked on every insert.
 *
 * `resolvedAt`/`resolvedBy` are set together, either by a comment's removal (in the same
 * transaction as that status change) or by a standalone dismiss action — never independently, and
 * never cleared once set: restoring a removed comment does not reopen the reports its removal
 * resolved (design.md - Decision 8, "Restoring a previously removed comment does not reopen the
 * reports that removal resolved"). `resolvedBy` is nullable because the row itself is never
 * deleted or reset — only ever created unresolved and, at most once, resolved.
 *
 * Both references cascade. A deleted comment's reports are meaningless, and a reporter's identity
 * is exactly what the unique index needs to exist for the constraint to mean anything.
 */
export declare const commentReports: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "comment_reports";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "id";
            tableName: "comment_reports";
            dataType: "string";
            columnType: "MySqlChar";
            data: string;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        commentId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "comment_id";
            tableName: "comment_reports";
            dataType: "string";
            columnType: "MySqlChar";
            data: string;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        reporterId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "reporter_id";
            tableName: "comment_reports";
            dataType: "string";
            columnType: "MySqlChar";
            data: string;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        reason: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "reason";
            tableName: "comment_reports";
            dataType: "string";
            columnType: "MySqlEnumColumn";
            data: "spam" | "harassment" | "off_topic" | "other";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["spam", "harassment", "off_topic", "other"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        note: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "note";
            tableName: "comment_reports";
            dataType: "string";
            columnType: "MySqlText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        createdAt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "created_at";
            tableName: "comment_reports";
            dataType: "date";
            columnType: "MySqlDateTime";
            data: Date;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        resolvedAt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "resolved_at";
            tableName: "comment_reports";
            dataType: "date";
            columnType: "MySqlDateTime";
            data: Date;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        resolvedBy: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "resolved_by";
            tableName: "comment_reports";
            dataType: "string";
            columnType: "MySqlChar";
            data: string;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        isOpen: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "is_open";
            tableName: "comment_reports";
            dataType: "boolean";
            columnType: "MySqlBoolean";
            data: boolean;
            driverParam: number | boolean;
            notNull: false;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: {
                type: "always";
            };
        }, object>;
    };
    dialect: "mysql";
}>;
