/**
 * The anak usaha (sub-brand) catalog: Siders Culture, Jakarta Siders, Surabaya Siders, and
 * SidersVox (seeded by migration, matching `SUB_BRANDS` in `apps/web/lib/content.tsx`). Same
 * `{id, name, slug}` shape as `categories` (`taxonomy.ts`), but an article relates to at most one
 * via `articles.anakUsahaId` rather than a many-to-many join table
 * (specs/anak-usaha-management/spec.md - "Articles relate to anak usaha one-to-many"). Declared
 * before `articles` so `articles.anakUsahaId` can reference it inline.
 */
export declare const anakUsaha: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "anak_usaha";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "id";
            tableName: "anak_usaha";
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
            tableName: "anak_usaha";
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
        slug: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "slug";
            tableName: "anak_usaha";
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
        createdAt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "created_at";
            tableName: "anak_usaha";
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
 * The optional public presentation for an anak usaha entry — logo, description, kind, links,
 * order, and visibility — kept separate from the lightweight taxonomy row above so an entry used
 * only for article tagging never needs to carry unused presentation columns
 * (design.md - "Separate anak_usaha_profile table, not new columns on anak_usaha"). `anakUsahaId`
 * is both the primary key and the foreign key: this makes "at most one profile per entry" a
 * schema-level guarantee rather than an application check, and `onDelete: 'cascade'` deletes the
 * profile automatically when its entry is deleted (design.md - "One-to-one via a shared primary
 * key"). `logoMediaId` is nullable / `set null`, unlike `partners.logoMediaId`, because a
 * logo-less profile is a valid public entry here (design.md - "Logo FK is nullable"). `kind` is
 * `text`, validated by the Zod enum in `packages/contracts/src/anak-usaha.ts` rather than a
 * database enum. `links` is `json` (Postgres `jsonb` has no MySQL equivalent; MySQL's `json` type
 * covers the same "no child table" reasoning `articles.bodyJson` follows).
 */
export declare const anakUsahaProfile: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "anak_usaha_profile";
    schema: undefined;
    columns: {
        anakUsahaId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "anak_usaha_id";
            tableName: "anak_usaha_profile";
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
        logoMediaId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "logo_media_id";
            tableName: "anak_usaha_profile";
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
        backgroundColor: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "background_color";
            tableName: "anak_usaha_profile";
            dataType: "string";
            columnType: "MySqlVarChar";
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
        description: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "description";
            tableName: "anak_usaha_profile";
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
        kind: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "kind";
            tableName: "anak_usaha_profile";
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
        links: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "links";
            tableName: "anak_usaha_profile";
            dataType: "json";
            columnType: "MySqlJson";
            data: unknown;
            driverParam: string;
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
        sortOrder: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "sort_order";
            tableName: "anak_usaha_profile";
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
            tableName: "anak_usaha_profile";
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
            tableName: "anak_usaha_profile";
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
            tableName: "anak_usaha_profile";
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
