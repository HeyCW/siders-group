export declare const categories: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "categories";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "id";
            tableName: "categories";
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
            tableName: "categories";
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
            tableName: "categories";
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
            tableName: "categories";
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
 * Many-to-many: an article carries any number of categories, a category spans any number of
 * articles; there is no `articles.category_id`. Both FKs cascade, so deleting an article or a category detaches the
 * association without leaving an orphaned join row, and never deletes the article itself.
 */
export declare const articleCategories: import("drizzle-orm/mysql-core").MySqlTableWithColumns<{
    name: "article_categories";
    schema: undefined;
    columns: {
        articleId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "article_id";
            tableName: "article_categories";
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
        categoryId: import("drizzle-orm/mysql-core").MySqlColumn<{
            name: "category_id";
            tableName: "article_categories";
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
    };
    dialect: "mysql";
}>;
