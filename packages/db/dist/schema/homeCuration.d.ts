/**
 * One global, ordered list of articles leading the public homepage. `articleId` is the primary
 * key rather than a surrogate id, so a duplicate pick is structurally impossible instead of
 * merely validated (design.md - "Data model"). `ON DELETE CASCADE` matters specifically because
 * articles are hard-deleted in this system — without it, deleting an article would leave a
 * curated row pointing at nothing. `position` is zero-based, assigned from the submitted array
 * index on every write, but is not guaranteed contiguous afterwards — `ON DELETE CASCADE` can
 * remove an interior entry (a 3-entry list can be left as `0, 2`); nothing reads its absolute
 * value, only its relative order via `ORDER BY position`.
 */
export declare const homeCuration: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "home_curation";
    schema: undefined;
    columns: {
        articleId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "article_id";
            tableName: "home_curation";
            dataType: "string";
            columnType: "MySqlChar";
            data: string;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, object>;
        position: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "position";
            tableName: "home_curation";
            dataType: "number";
            columnType: "MySqlInt";
            data: number;
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
        createdAt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "created_at";
            tableName: "home_curation";
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
