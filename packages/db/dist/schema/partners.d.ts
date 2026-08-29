/**
 * The partner directory backing the public home page's partner ticker. `logoMediaId` is required
 * and `ON DELETE RESTRICT` rather than `SET NULL` or `CASCADE` — mirroring `guidePicks.photoMediaId`
 * for the same reason: a partner tile without a logo has no graceful degraded state to fall back
 * to, so losing the logo must fail loudly rather than silently leave a partner with nothing to
 * render (specs/partner-management/spec.md - "A partner requires a logo"). `sortOrder` is a plain
 * column rather than a separate ordering table (unlike `home_curation`) because a partner has no
 * independent existence outside the ticker — there is no pool to select from
 * (design.md - "Partners are directly-owned entities, not a curated selection").
 */
export declare const partners: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "partners";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "id";
            tableName: "partners";
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
        name: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "name";
            tableName: "partners";
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
        logoMediaId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "logo_media_id";
            tableName: "partners";
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
        websiteUrl: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "website_url";
            tableName: "partners";
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
        sortOrder: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "sort_order";
            tableName: "partners";
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
            tableName: "partners";
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
            tableName: "partners";
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
            tableName: "partners";
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
