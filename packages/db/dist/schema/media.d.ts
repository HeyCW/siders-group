/**
 * The canonical media record (openspec/changes/add-news-management-system/design.md -
 * "Media storage"). `storagePath` is relative to `MEDIA_STORAGE_PATH`, never an absolute URL —
 * the public URL is derived at map time so relocating storage is a config change, not a
 * migration. Declared before `articles` so `articles.featuredMediaId` can reference it inline.
 */
export declare const media: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "media";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "id";
            tableName: "media";
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
        storagePath: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "storage_path";
            tableName: "media";
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
        mime: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "mime";
            tableName: "media";
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
        sizeBytes: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "size_bytes";
            tableName: "media";
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
        originalFilename: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "original_filename";
            tableName: "media";
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
        alt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "alt";
            tableName: "media";
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
        caption: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "caption";
            tableName: "media";
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
        uploadedBy: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "uploaded_by";
            tableName: "media";
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
        createdAt: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "created_at";
            tableName: "media";
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
