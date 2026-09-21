/**
 * The hyperlocal spotlight: one permanent row holding at most one editor-picked article
 * (openspec/changes/add-hyperlocal-spotlight). `slot` is an enum of exactly one legal value
 * rather than a plain string primary key, so a second row is rejected by the column's own type,
 * not merely by application discipline — the same "structurally impossible, not merely
 * validated" reasoning `home_curation` applies to `article_id` as its primary key
 * (design.md - "The checkbox is UI over a singleton slot, not a boolean column on `articles`").
 *
 * `articleId` is nullable and deliberately never inserted or deleted — the migration seeds the
 * one row once, and every write thereafter is a plain `UPDATE` of it. `NULL` is not an
 * exceptional state: it is the "no editor pick" state, and the spotlight resolves to the most
 * recently published article whenever it reads `NULL` (design.md - "Exactly one row, forever;
 * `article_id NULL` means 'newest article'").
 *
 * The foreign key is `ON DELETE SET NULL`, not `CASCADE` as `home_curation` uses for its own
 * article reference. `home_curation`'s rows *are* the picks, so cascading a delete removes the
 * right thing. Here the row *is the slot itself* and must outlive any article it points at —
 * cascading would delete the slot, reintroducing the "does a row exist?" question this design
 * exists to remove (design.md - "Article deletion nulls the pick — `SET NULL`, not `CASCADE`").
 */
export declare const hyperlocalSpotlight: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "hyperlocal_spotlight";
    schema: undefined;
    columns: {
        slot: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "slot";
            tableName: "hyperlocal_spotlight";
            dataType: "string";
            columnType: "MySqlEnumColumn";
            data: "default";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: ["default"];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        articleId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "article_id";
            tableName: "hyperlocal_spotlight";
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
        updatedAt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "updated_at";
            tableName: "hyperlocal_spotlight";
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
