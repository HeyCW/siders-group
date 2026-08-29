export declare const COMMENT_STATUS_VALUES: readonly ["visible", "removed"];
export type CommentStatusValue = (typeof COMMENT_STATUS_VALUES)[number];
/**
 * One row per reader per article. The unique index is the toggle's correctness guarantee, not a
 * nicety: the like path is delete-then-insert-if-nothing-was-deleted, so two of a reader's own
 * requests racing each other would otherwise both find no row and both insert
 * (specs/article-engagement/spec.md - "A reader cannot like the same article twice").
 *
 * Both references cascade. A deleted article's likes are meaningless, and a deleted reader's
 * likes are unattributable — neither is worth keeping as an orphan, and the like count is derived
 * from these rows, so a dangling one would inflate it forever.
 */
export declare const likes: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "likes";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "id";
            tableName: "likes";
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
        readerId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "reader_id";
            tableName: "likes";
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
        articleId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "article_id";
            tableName: "likes";
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
        createdAt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "created_at";
            tableName: "likes";
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
/**
 * Flat by construction: there is no `parent_id` column, so a reply relationship is not
 * representable rather than merely unimplemented
 * (specs/article-engagement/spec.md - "Comments are flat and stored as plain text").
 *
 * `body` is plain text and is never passed through `sanitizeHtml` — that renderer exists for
 * staff-authored Tiptap documents. A comment has no rich-text affordance, so it has no reason to
 * admit markup, and the web client renders it into a text node where markup has no render path to
 * escape through.
 */
export declare const comments: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "comments";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "id";
            tableName: "comments";
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
        articleId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "article_id";
            tableName: "comments";
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
        readerId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "reader_id";
            tableName: "comments";
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
        body: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "body";
            tableName: "comments";
            dataType: "string";
            columnType: "MySqlText";
            data: string;
            driverParam: string;
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
        status: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "status";
            tableName: "comments";
            dataType: "string";
            columnType: "MySqlEnumColumn";
            data: "visible" | "removed";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["visible", "removed"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        createdAt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "created_at";
            tableName: "comments";
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
/**
 * The daily view aggregate from `docs/ARCHITECTURE.md` §9.1. The composite primary key is what
 * `on duplicate key update` targets, so the counter is a single statement with no read-then-write
 * race.
 *
 * `date` is a calendar date, written by the application as `curdate()` under the connection's UTC
 * setting (`client.ts` pins `timezone: 'Z'`) while `admin-dashboard` reports in Asia/Jakarta, so a
 * view recorded at 05:00 Jakarta lands in the previous day's bucket. This shifts which day a view
 * is attributed to, never whether it is counted, and every dashboard figure derived from this
 * table is a rolling multi-day window (design.md - "View counting").
 */
export declare const articleViewsDaily: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "article_views_daily";
    schema: undefined;
    columns: {
        articleId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "article_id";
            tableName: "article_views_daily";
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
        date: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "date";
            tableName: "article_views_daily";
            dataType: "string";
            columnType: "MySqlDateString";
            data: string;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        views: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "views";
            tableName: "article_views_daily";
            dataType: "number";
            columnType: "MySqlInt";
            data: number;
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
        uniqueViews: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "unique_views";
            tableName: "article_views_daily";
            dataType: "number";
            columnType: "MySqlInt";
            data: number;
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
/**
 * Whether a given visitor has already been counted for a given article on a given day. Inserted
 * with `insert ignore`; the affected row count is the entire uniqueness decision
 * (`docs/ARCHITECTURE.md` §9.1).
 *
 * `visitorHash` is an HMAC of the caller's address keyed on `SESSION_SECRET`, never the address
 * itself — the same reasoning as `sessions.ip_hash`: an IPv4 address is only 2^32 candidates, so
 * an unkeyed digest of one is pseudonymous in name only.
 *
 * **This table grows without bound** — one row per (article, visitor, day), forever. The `date`
 * index exists so a retention job can delete aged rows with a range scan instead of a sequential
 * one. No such job is built here; this note is the record that one is owed.
 */
export declare const viewSeen: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "view_seen";
    schema: undefined;
    columns: {
        articleId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "article_id";
            tableName: "view_seen";
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
        visitorHash: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "visitor_hash";
            tableName: "view_seen";
            dataType: "string";
            columnType: "MySqlVarChar";
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
        date: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "date";
            tableName: "view_seen";
            dataType: "string";
            columnType: "MySqlDateString";
            data: string;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
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
