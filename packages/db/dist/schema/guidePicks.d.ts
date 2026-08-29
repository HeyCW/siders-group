/**
 * The city-guide picks backing the public home page's "Siders Guideline of the Week" section.
 * `photoMediaId` is required and `ON DELETE RESTRICT` rather than `SET NULL` or `CASCADE` —
 * mirroring `partners.logoMediaId` for the same reason: a guide pick with no photo has no
 * graceful degraded state to fall back to (specs/guide-of-the-week-management/spec.md - "A guide
 * pick requires a photo"). `videoMediaId` is its poster's video, required and `ON DELETE
 * RESTRICT` for the same reason. `sortOrder` is a plain column rather than a separate ordering
 * table — a guide pick has no independent existence outside this section, so there is no pool to
 * select from (design.md - "Guide picks are directly-owned entities, not a curated selection").
 * No maximum-count constraint anywhere in this table, deliberately — the list is bounded only by
 * how many rows exist (design.md - "No maximum pick count").
 */
export declare const guidePicks: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "guide_picks";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "id";
            tableName: "guide_picks";
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
        city: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "city";
            tableName: "guide_picks";
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
        place: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "place";
            tableName: "guide_picks";
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
        description: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "description";
            tableName: "guide_picks";
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
        photoMediaId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "photo_media_id";
            tableName: "guide_picks";
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
        videoMediaId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "video_media_id";
            tableName: "guide_picks";
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
        sortOrder: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "sort_order";
            tableName: "guide_picks";
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
        isActive: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "is_active";
            tableName: "guide_picks";
            dataType: "boolean";
            columnType: "MySqlBoolean";
            data: boolean;
            driverParam: number | boolean;
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
        createdAt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "created_at";
            tableName: "guide_picks";
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
        updatedAt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "updated_at";
            tableName: "guide_picks";
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
