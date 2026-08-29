var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/server.ts
import { pathToFileURL } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express2 from "express";
import { pinoHttp } from "pino-http";

// src/config/env.ts
import { isAbsolute } from "node:path";
import { z } from "zod";
function unescapeNewlines(value) {
  return value.replace(/\\n/g, "\n");
}
function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
var pemPrivateKeySchema = z.string().min(1).transform(unescapeNewlines).refine((v) => v.includes("BEGIN PRIVATE KEY") && v.includes("END PRIVATE KEY"), {
  message: "must be a PKCS#8 PEM-encoded private key"
});
var pemPublicKeySchema = z.string().min(1).transform(unescapeNewlines).refine((v) => v.includes("BEGIN PUBLIC KEY") && v.includes("END PUBLIC KEY"), {
  message: "must be an SPKI PEM-encoded public key"
});
var envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4e3),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  // A single `mysql://` connection string for both runtime queries and migrations — MySQL has no
  // pooled/direct-connection split the way Supabase's Postgres did, so there is no `DIRECT_URL`
  // to carry over (openspec/changes/migrate-postgres-to-mysql).
  DATABASE_URL: z.string().url(),
  // CSRF double-submit token signing secret (openspec/changes/add-auth-foundation/design.md -
  // "SESSION_SECRET is repurposed, not orphaned"). Access credentials are EdDSA-signed and
  // refresh credentials are opaque hashed-at-rest values, so nothing else consumes this.
  SESSION_SECRET: z.string().min(32),
  // `apps/web` is a static export with no `/api/revalidate` route to call (see
  // apps/api/src/lib/revalidate.ts), so a content change instead triggers a rebuild via this
  // webhook — a GitHub Actions `repository_dispatch` endpoint, or any CI system that accepts an
  // authenticated POST to start a job. Both optional: unset in local dev and any environment
  // that hasn't wired up a deploy pipeline yet, in which case revalidate.ts silently no-ops.
  DEPLOY_TRIGGER_URL: z.string().url().optional(),
  DEPLOY_TRIGGER_TOKEN: z.string().min(1).optional(),
  // Access-credential signing key pair (EdDSA). See apps/api/src/lib/tokens.ts.
  ACCESS_TOKEN_PRIVATE_KEY: pemPrivateKeySchema,
  ACCESS_TOKEN_PUBLIC_KEY: pemPublicKeySchema,
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  // Local-filesystem media storage for add-news-management-system (design.md - "Media storage:
  // the local filesystem, not R2"). Deliberately separate from the R2 variables above, which
  // remain unused by this change. MEDIA_STORAGE_PATH must be absolute so the storage root is
  // unambiguous regardless of the process's working directory.
  // `isAbsolute` (not `.startsWith('/')`) so this accepts a Windows-style root (`C:\data\media`)
  // as well as a POSIX one — local dev on Windows was otherwise rejected at boot.
  MEDIA_STORAGE_PATH: z.string().min(1).refine((v) => isAbsolute(v), {
    message: "must be an absolute path"
  }),
  MEDIA_PUBLIC_BASE_URL: z.string().url().transform(stripTrailingSlash),
  // Separate maxima per kind, not one shared limit — raising a single limit for video would also
  // authorize an image of that size (openspec/changes/self-hosted-guideline-videos/design.md -
  // "Per-kind size limit, enforced after sniffing").
  MEDIA_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MEDIA_MAX_VIDEO_BYTES: z.coerce.number().int().positive().default(200 * 1024 * 1024),
  // Trailing slashes are stripped so these compare equal to a parsed `URL.origin`, which never
  // carries one. `redirect.ts` matches the post-sign-in target's origin against this set; with
  // a trailing slash in the environment nothing ever matched and every redirect silently fell
  // back to the default path — a misconfiguration with no error, only quietly wrong behaviour.
  APP_ORIGIN: z.string().url().transform(stripTrailingSlash),
  ADMIN_ORIGIN: z.string().url().transform(stripTrailingSlash),
  // Number of reverse proxies in front of the API, so Express can resolve `req.ip` to the
  // real client rather than the proxy. Defaults to 0 (trust nothing): every rate limit here
  // is keyed on `req.ip`, and trusting `X-Forwarded-For` when nothing strips it lets a
  // caller spoof the header and sidestep the limits entirely. Set to the actual hop count
  // (usually 1) once the API sits behind a load balancer, or every caller shares one bucket.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  // Shared registrable domain for session/CSRF cookies (e.g. `.siders.id` in production so
  // web/admin/api subdomains all receive them). Unset in local dev, where api/admin/web run
  // on different hosts/ports and a cookie `domain` would make the browser reject the cookie
  // entirely rather than scope it (docs/ARCHITECTURE.md §5.3, §12 pitfall #4).
  COOKIE_DOMAIN: z.string().optional()
});
var cachedEnv;
function loadEnv(source = process.env) {
  if (cachedEnv) return cachedEnv;
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:
${issues}`);
  }
  cachedEnv = result.data;
  return cachedEnv;
}

// src/lib/logger.ts
import pino from "pino";
var REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]'
];
function createLogger(env) {
  const options = { level: env.LOG_LEVEL, redact: REDACT_PATHS };
  if (env.NODE_ENV === "development") {
    options.transport = { target: "pino-pretty", options: { colorize: true } };
  }
  return pino(options);
}

// src/lib/scheduler.ts
import cron from "node-cron";
function startScheduler(logger) {
  const tasks = [];
  function registerJob(expression, job) {
    const task = cron.schedule(expression, () => {
      Promise.resolve(job()).catch((err) => logger.error({ err }, "scheduled job failed"));
    });
    tasks.push(task);
    logger.info({ expression }, "scheduled job registered");
  }
  return {
    registerJob,
    stop: () => tasks.forEach((task) => task.stop())
  };
}

// src/lib/csrf.ts
import { createHmac as createHmac2, randomBytes as randomBytes2 } from "node:crypto";

// src/middleware/errorHandler.ts
import { ZodError } from "zod";
import { MulterError } from "multer";
var AppError = class extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "AppError";
  }
  status;
  code;
};
function createErrorHandler(logger) {
  return function errorHandler(err, req, res, _next) {
    if (err instanceof AppError) {
      logger.warn({ err, requestId: req.requestId }, err.message);
      res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof ZodError) {
      logger.warn({ err, requestId: req.requestId }, "request validation failed");
      res.status(400).json({
        success: false,
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
        }
      });
      return;
    }
    if (err instanceof MulterError) {
      logger.warn({ err, requestId: req.requestId }, "upload rejected by multer");
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          success: false,
          error: { code: "file_too_large", message: "File exceeds the maximum allowed size" }
        });
        return;
      }
      res.status(400).json({ success: false, error: { code: "upload_error", message: err.message } });
      return;
    }
    logger.error({ err, requestId: req.requestId }, "unhandled error");
    res.status(500).json({
      success: false,
      error: { code: "internal_error", message: "An unexpected error occurred" }
    });
  };
}

// src/lib/tokens.ts
import { randomBytes, randomUUID } from "node:crypto";
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";

// src/lib/hashCompare.ts
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
function sha256Hex(raw) {
  return createHash("sha256").update(raw).digest("hex");
}
function hmacSha256Hex(raw, secret) {
  return createHmac("sha256", secret).update(raw).digest("hex");
}
function timingSafeEqualString(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// src/lib/tokens.ts
var ISSUER = "siders-api";
var AUDIENCE = "siders";
var ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
var ALG = "EdDSA";
var REFRESH_TOKEN_COOKIE = "sid_rt";
async function signAccessToken(claims, env) {
  const privateKey = await importPKCS8(env.ACCESS_TOKEN_PRIVATE_KEY, ALG);
  return new SignJWT({ type: claims.subjectType, sid: claims.sessionId }).setProtectedHeader({ alg: ALG }).setSubject(claims.subjectId).setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`).sign(privateKey);
}
async function verifyAccessToken(token, env) {
  const publicKey = await importSPKI(env.ACCESS_TOKEN_PUBLIC_KEY, ALG);
  const { payload } = await jwtVerify(token, publicKey, { issuer: ISSUER, audience: AUDIENCE });
  const { sub, type, sid } = payload;
  if (typeof sub !== "string" || typeof sid !== "string" || type !== "staff" && type !== "reader") {
    throw new Error("malformed access token claims");
  }
  return { subjectId: sub, subjectType: type, sessionId: sid };
}
function generateOpaqueToken() {
  return randomBytes(32).toString("base64url");
}
function issueRefreshToken() {
  const token = generateOpaqueToken();
  return { token, tokenHash: sha256Hex(token), familyId: randomUUID() };
}
function rotateRefreshToken(familyId) {
  const token = generateOpaqueToken();
  return { token, tokenHash: sha256Hex(token), familyId };
}

// src/middleware/authenticate.ts
var ACCESS_TOKEN_COOKIE = "sid_at";
function createAuthenticate(env) {
  return async function authenticate(req, _res, next) {
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
    if (typeof token === "string" && token.length > 0) {
      try {
        req.auth = await verifyAccessToken(token, env);
      } catch {
      }
    }
    next();
  };
}

// src/lib/csrf.ts
var CSRF_COOKIE = "csrf_token";
var CSRF_HEADER = "x-csrf-token";
function sign(value, secret) {
  return createHmac2("sha256", secret).update(value).digest("hex");
}
function issueCsrfToken(env, sessionId) {
  const value = randomBytes2(32).toString("base64url");
  const body = `${value}.${sessionId}`;
  return `${body}.${sign(body, env.SESSION_SECRET)}`;
}
function verifyCsrfToken(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [value, sessionId, signature] = parts;
  if (!value || !sessionId || !signature) return null;
  if (!timingSafeEqualString(signature, sign(`${value}.${sessionId}`, env.SESSION_SECRET))) {
    return null;
  }
  return { sessionId };
}
function setCsrfCookie(res, token, options) {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    // must be script-readable — the client echoes it back as a header
    secure: options.secure,
    sameSite: "lax",
    domain: options.domain,
    maxAge: options.maxAge,
    path: "/"
  });
}
function clearCsrfCookie(res, options) {
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: options.secure,
    sameSite: "lax",
    domain: options.domain,
    path: "/"
  });
}
var SAFE_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS"]);
function createCsrfMiddleware(env) {
  return function csrfMiddleware(req, _res, next) {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const hasSessionCredential = Boolean(
      req.cookies?.[ACCESS_TOKEN_COOKIE] || req.cookies?.[REFRESH_TOKEN_COOKIE]
    );
    if (!hasSessionCredential) {
      next();
      return;
    }
    const header = req.get(CSRF_HEADER);
    const cookie = req.cookies?.[CSRF_COOKIE];
    if (!header || !cookie || !timingSafeEqualString(header, cookie)) {
      next(new AppError("CSRF token missing or invalid", 403, "csrf_failed"));
      return;
    }
    const payload = verifyCsrfToken(cookie, env);
    if (!payload) {
      next(new AppError("CSRF token missing or invalid", 403, "csrf_failed"));
      return;
    }
    if (req.auth && payload.sessionId !== req.auth.sessionId) {
      next(new AppError("CSRF token does not match this session", 403, "csrf_failed"));
      return;
    }
    next();
  };
}

// ../../packages/db/dist/client.js
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";

// ../../packages/db/dist/schema/index.js
var schema_exports = {};
__export(schema_exports, {
  ARTICLE_STATUS_VALUES: () => ARTICLE_STATUS_VALUES,
  COMMENT_REPORT_REASON_VALUES: () => COMMENT_REPORT_REASON_VALUES,
  COMMENT_STATUS_VALUES: () => COMMENT_STATUS_VALUES,
  CONTACT_MESSAGE_STATUS_VALUES: () => CONTACT_MESSAGE_STATUS_VALUES,
  MODERATION_ACTION_VALUES: () => MODERATION_ACTION_VALUES,
  MODERATION_TARGET_TYPE_VALUES: () => MODERATION_TARGET_TYPE_VALUES,
  READER_STATUS_VALUES: () => READER_STATUS_VALUES,
  SUBJECT_TYPE_VALUES: () => SUBJECT_TYPE_VALUES,
  USER_STATUS_VALUES: () => USER_STATUS_VALUES,
  anakUsaha: () => anakUsaha,
  anakUsahaProfile: () => anakUsahaProfile,
  articleCategories: () => articleCategories,
  articleViewsDaily: () => articleViewsDaily,
  articles: () => articles,
  categories: () => categories,
  commentReports: () => commentReports,
  comments: () => comments,
  contactMessages: () => contactMessages,
  guidePicks: () => guidePicks,
  homeCuration: () => homeCuration,
  likes: () => likes,
  media: () => media,
  moderationActions: () => moderationActions,
  partners: () => partners,
  permissions: () => permissions,
  readers: () => readers,
  rolePermissions: () => rolePermissions,
  roles: () => roles,
  sessions: () => sessions,
  users: () => users,
  viewSeen: () => viewSeen
});

// ../../packages/db/dist/schema/rbac.js
import { sql } from "drizzle-orm";
import { boolean, char, datetime, mysqlTable, primaryKey, text, varchar } from "drizzle-orm/mysql-core";

// ../../packages/db/dist/newId.js
import { v7 as uuidv7 } from "uuid";
function newId() {
  return uuidv7();
}

// ../../packages/db/dist/schema/rbac.js
var roles = mysqlTable("roles", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(newId),
  name: varchar("name", { length: 191 }).notNull().unique(),
  slug: varchar("slug", { length: 191 }).notNull().unique(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`)
});
var permissions = mysqlTable("permissions", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(newId),
  key: varchar("key", { length: 191 }).notNull().unique(),
  description: text("description").notNull()
});
var rolePermissions = mysqlTable("role_permissions", {
  roleId: char("role_id", { length: 36 }).notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: char("permission_id", { length: 36 }).notNull().references(() => permissions.id, { onDelete: "cascade" })
}, (table) => ({
  pk: primaryKey({ columns: [table.roleId, table.permissionId] })
}));

// ../../packages/db/dist/schema/users.js
import { sql as sql2 } from "drizzle-orm";
import { boolean as boolean2, char as char2, datetime as datetime2, index, mysqlEnum, mysqlTable as mysqlTable2, varchar as varchar2 } from "drizzle-orm/mysql-core";
var USER_STATUS_VALUES = ["active", "disabled"];
var users = mysqlTable2("users", {
  id: char2("id", { length: 36 }).primaryKey().$defaultFn(newId),
  email: varchar2("email", { length: 320 }).notNull().unique(),
  // Always set — creation and reset generate a temporary password immediately, so there is
  // no credential-less window to model (see openspec/changes/add-auth-foundation/design.md -
  // "No email anywhere in the staff lifecycle").
  passwordHash: varchar2("password_hash", { length: 255 }).notNull(),
  mustChangePassword: boolean2("must_change_password").notNull().default(true),
  name: varchar2("name", { length: 255 }).notNull(),
  roleId: char2("role_id", { length: 36 }).notNull().references(() => roles.id),
  status: mysqlEnum("status", USER_STATUS_VALUES).notNull().default("active"),
  lastLoginAt: datetime2("last_login_at", { fsp: 3 }),
  createdAt: datetime2("created_at", { fsp: 3 }).notNull().default(sql2`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime2("updated_at", { fsp: 3 }).notNull().default(sql2`CURRENT_TIMESTAMP(3)`)
}, (table) => ({
  // Supports the gated-path lookup: session -> subject -> role_id -> role_permissions.
  roleIdx: index("users_role_idx").on(table.roleId)
}));

// ../../packages/db/dist/schema/readers.js
import { sql as sql3 } from "drizzle-orm";
import { boolean as boolean3, char as char3, datetime as datetime3, mysqlEnum as mysqlEnum2, mysqlTable as mysqlTable3, text as text2, varchar as varchar3 } from "drizzle-orm/mysql-core";
var READER_STATUS_VALUES = ["active", "banned"];
var readers = mysqlTable3("readers", {
  id: char3("id", { length: 36 }).primaryKey().$defaultFn(newId),
  googleSub: varchar3("google_sub", { length: 128 }).notNull().unique(),
  email: varchar3("email", { length: 320 }).notNull(),
  emailVerified: boolean3("email_verified").notNull().default(false),
  name: varchar3("name", { length: 255 }).notNull(),
  avatarUrl: text2("avatar_url"),
  status: mysqlEnum2("status", READER_STATUS_VALUES).notNull().default("active"),
  mutedUntil: datetime3("muted_until", { fsp: 3 }),
  lastLoginAt: datetime3("last_login_at", { fsp: 3 }),
  createdAt: datetime3("created_at", { fsp: 3 }).notNull().default(sql3`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime3("updated_at", { fsp: 3 }).notNull().default(sql3`CURRENT_TIMESTAMP(3)`)
});

// ../../packages/db/dist/schema/sessions.js
import { sql as sql4 } from "drizzle-orm";
import { char as char4, datetime as datetime4, index as index2, mysqlEnum as mysqlEnum3, mysqlTable as mysqlTable4, text as text3, varchar as varchar4 } from "drizzle-orm/mysql-core";
var SUBJECT_TYPE_VALUES = ["staff", "reader"];
var sessions = mysqlTable4("sessions", {
  id: char4("id", { length: 36 }).primaryKey().$defaultFn(newId),
  // the `sid` claim
  subjectId: char4("subject_id", { length: 36 }).notNull(),
  subjectType: mysqlEnum3("subject_type", SUBJECT_TYPE_VALUES).notNull(),
  refreshTokenHash: varchar4("refresh_token_hash", { length: 128 }).notNull().unique(),
  familyId: char4("family_id", { length: 36 }).notNull(),
  userAgent: text3("user_agent"),
  ipHash: varchar4("ip_hash", { length: 128 }),
  expiresAt: datetime4("expires_at", { fsp: 3 }).notNull(),
  // sliding
  absoluteExpiresAt: datetime4("absolute_expires_at", { fsp: 3 }).notNull(),
  // hard cap
  revokedAt: datetime4("revoked_at", { fsp: 3 }),
  createdAt: datetime4("created_at", { fsp: 3 }).notNull().default(sql4`CURRENT_TIMESTAMP(3)`)
}, (table) => ({
  subjectIdx: index2("sessions_subject_idx").on(table.subjectType, table.subjectId),
  familyIdx: index2("sessions_family_idx").on(table.familyId)
}));

// ../../packages/db/dist/schema/media.js
import { sql as sql5 } from "drizzle-orm";
import { char as char5, datetime as datetime5, index as index3, int, mysqlTable as mysqlTable5, text as text4, varchar as varchar5 } from "drizzle-orm/mysql-core";
var media = mysqlTable5("media", {
  id: char5("id", { length: 36 }).primaryKey().$defaultFn(newId),
  storagePath: varchar5("storage_path", { length: 512 }).notNull().unique(),
  mime: varchar5("mime", { length: 255 }).notNull(),
  sizeBytes: int("size_bytes").notNull(),
  originalFilename: varchar5("original_filename", { length: 512 }).notNull(),
  alt: text4("alt"),
  caption: text4("caption"),
  uploadedBy: char5("uploaded_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: datetime5("created_at", { fsp: 3 }).notNull().default(sql5`CURRENT_TIMESTAMP(3)`)
}, (table) => ({
  uploadedByIdx: index3("media_uploaded_by_idx").on(table.uploadedBy)
}));

// ../../packages/db/dist/schema/anakUsaha.js
import { sql as sql6 } from "drizzle-orm";
import { boolean as boolean4, char as char6, datetime as datetime6, int as int2, json, mysqlTable as mysqlTable6, text as text5, varchar as varchar6 } from "drizzle-orm/mysql-core";
var anakUsaha = mysqlTable6("anak_usaha", {
  id: char6("id", { length: 36 }).primaryKey().$defaultFn(newId),
  name: varchar6("name", { length: 255 }).notNull(),
  slug: varchar6("slug", { length: 191 }).notNull().unique(),
  createdAt: datetime6("created_at", { fsp: 3 }).notNull().default(sql6`CURRENT_TIMESTAMP(3)`)
});
var anakUsahaProfile = mysqlTable6("anak_usaha_profile", {
  anakUsahaId: char6("anak_usaha_id", { length: 36 }).primaryKey().references(() => anakUsaha.id, { onDelete: "cascade" }),
  logoMediaId: char6("logo_media_id", { length: 36 }).references(() => media.id, { onDelete: "set null" }),
  /** Hex color (`#rrggbb`) behind the logo on the home page tile, admin-picked per entry. `null`
   *  falls back to the tile's default paper background (`AnakUsahaTiles.tsx`). */
  backgroundColor: varchar6("background_color", { length: 32 }),
  description: text5("description"),
  kind: varchar6("kind", { length: 64 }).notNull(),
  links: json("links").notNull().default([]),
  sortOrder: int2("sort_order").notNull(),
  isActive: boolean4("is_active").notNull().default(true),
  createdAt: datetime6("created_at", { fsp: 3 }).notNull().default(sql6`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime6("updated_at", { fsp: 3 }).notNull().default(sql6`CURRENT_TIMESTAMP(3)`)
});

// ../../packages/db/dist/schema/articles.js
import { sql as sql7 } from "drizzle-orm";
import { char as char7, datetime as datetime7, index as index4, json as json2, mysqlEnum as mysqlEnum4, mysqlTable as mysqlTable7, text as text6, varchar as varchar7 } from "drizzle-orm/mysql-core";
var ARTICLE_STATUS_VALUES = ["draft", "scheduled", "published"];
var articles = mysqlTable7("articles", {
  id: char7("id", { length: 36 }).primaryKey().$defaultFn(newId),
  // `varchar(500)`, not `text`, to match every sibling short single-line name/label column
  // converted in this migration — bound matches `packages/contracts/src/article.ts`'s
  // `z.string().min(1).max(500)` at the API boundary.
  title: varchar7("title", { length: 500 }).notNull(),
  slug: varchar7("slug", { length: 255 }).notNull().unique(),
  bodyJson: json2("body_json").notNull(),
  bodyHtml: text6("body_html").notNull(),
  excerpt: text6("excerpt"),
  status: mysqlEnum4("status", ARTICLE_STATUS_VALUES).notNull().default("draft"),
  authorId: char7("author_id", { length: 36 }).notNull().references(() => users.id),
  featuredMediaId: char7("featured_media_id", { length: 36 }).references(() => media.id, { onDelete: "set null" }),
  anakUsahaId: char7("anak_usaha_id", { length: 36 }).references(() => anakUsaha.id, { onDelete: "set null" }),
  seoTitle: text6("seo_title"),
  seoDescription: text6("seo_description"),
  publishedAt: datetime7("published_at", { fsp: 3 }),
  createdAt: datetime7("created_at", { fsp: 3 }).notNull().default(sql7`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime7("updated_at", { fsp: 3 }).notNull().default(sql7`CURRENT_TIMESTAMP(3)`)
}, (table) => ({
  // The public list/by-slug queries filter on status and order by publishedAt — the pair
  // this index covers is exactly the read-time visibility predicate
  // (specs/public-news-api/spec.md - "One canonical public visibility rule").
  statusPublishedAtIdx: index4("articles_status_published_at_idx").on(table.status, table.publishedAt),
  authorIdx: index4("articles_author_idx").on(table.authorId),
  featuredMediaIdx: index4("articles_featured_media_idx").on(table.featuredMediaId),
  anakUsahaIdx: index4("articles_anak_usaha_idx").on(table.anakUsahaId)
}));

// ../../packages/db/dist/schema/taxonomy.js
import { sql as sql8 } from "drizzle-orm";
import { char as char8, datetime as datetime8, index as index5, mysqlTable as mysqlTable8, primaryKey as primaryKey2, varchar as varchar8 } from "drizzle-orm/mysql-core";
var categories = mysqlTable8("categories", {
  id: char8("id", { length: 36 }).primaryKey().$defaultFn(newId),
  name: varchar8("name", { length: 255 }).notNull(),
  slug: varchar8("slug", { length: 191 }).notNull().unique(),
  createdAt: datetime8("created_at", { fsp: 3 }).notNull().default(sql8`CURRENT_TIMESTAMP(3)`)
});
var articleCategories = mysqlTable8("article_categories", {
  articleId: char8("article_id", { length: 36 }).notNull().references(() => articles.id, { onDelete: "cascade" }),
  categoryId: char8("category_id", { length: 36 }).notNull().references(() => categories.id, { onDelete: "cascade" })
}, (table) => ({
  pk: primaryKey2({ columns: [table.articleId, table.categoryId] }),
  categoryIdx: index5("article_categories_category_idx").on(table.categoryId)
}));

// ../../packages/db/dist/schema/homeCuration.js
import { sql as sql9 } from "drizzle-orm";
import { char as char9, datetime as datetime9, int as int3, mysqlTable as mysqlTable9 } from "drizzle-orm/mysql-core";
var homeCuration = mysqlTable9("home_curation", {
  articleId: char9("article_id", { length: 36 }).primaryKey().references(() => articles.id, { onDelete: "cascade" }),
  position: int3("position").notNull().unique(),
  createdAt: datetime9("created_at", { fsp: 3 }).notNull().default(sql9`CURRENT_TIMESTAMP(3)`)
});

// ../../packages/db/dist/schema/partners.js
import { sql as sql10 } from "drizzle-orm";
import { boolean as boolean5, char as char10, datetime as datetime10, int as int4, mysqlTable as mysqlTable10, text as text7, varchar as varchar9 } from "drizzle-orm/mysql-core";
var partners = mysqlTable10("partners", {
  id: char10("id", { length: 36 }).primaryKey().$defaultFn(newId),
  name: varchar9("name", { length: 255 }).notNull(),
  logoMediaId: char10("logo_media_id", { length: 36 }).notNull().references(() => media.id, { onDelete: "restrict" }),
  websiteUrl: text7("website_url"),
  sortOrder: int4("sort_order").notNull(),
  isActive: boolean5("is_active").notNull().default(true),
  createdAt: datetime10("created_at", { fsp: 3 }).notNull().default(sql10`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime10("updated_at", { fsp: 3 }).notNull().default(sql10`CURRENT_TIMESTAMP(3)`)
});

// ../../packages/db/dist/schema/guidePicks.js
import { sql as sql11 } from "drizzle-orm";
import { boolean as boolean6, char as char11, datetime as datetime11, int as int5, mysqlTable as mysqlTable11, text as text8, varchar as varchar10 } from "drizzle-orm/mysql-core";
var guidePicks = mysqlTable11("guide_picks", {
  id: char11("id", { length: 36 }).primaryKey().$defaultFn(newId),
  city: varchar10("city", { length: 255 }).notNull(),
  place: varchar10("place", { length: 255 }).notNull(),
  description: text8("description").notNull(),
  photoMediaId: char11("photo_media_id", { length: 36 }).notNull().references(() => media.id, { onDelete: "restrict" }),
  videoMediaId: char11("video_media_id", { length: 36 }).notNull().references(() => media.id, { onDelete: "restrict" }),
  sortOrder: int5("sort_order").notNull(),
  isActive: boolean6("is_active").notNull().default(true),
  createdAt: datetime11("created_at", { fsp: 3 }).notNull().default(sql11`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime11("updated_at", { fsp: 3 }).notNull().default(sql11`CURRENT_TIMESTAMP(3)`)
});

// ../../packages/db/dist/schema/engagement.js
import { sql as sql12 } from "drizzle-orm";
import { char as char12, date, datetime as datetime12, index as index6, int as int6, mysqlEnum as mysqlEnum5, mysqlTable as mysqlTable12, primaryKey as primaryKey3, text as text9, uniqueIndex, varchar as varchar11 } from "drizzle-orm/mysql-core";
var COMMENT_STATUS_VALUES = ["visible", "removed"];
var likes = mysqlTable12("likes", {
  id: char12("id", { length: 36 }).primaryKey().$defaultFn(newId),
  readerId: char12("reader_id", { length: 36 }).notNull().references(() => readers.id, { onDelete: "cascade" }),
  articleId: char12("article_id", { length: 36 }).notNull().references(() => articles.id, { onDelete: "cascade" }),
  createdAt: datetime12("created_at", { fsp: 3 }).notNull().default(sql12`CURRENT_TIMESTAMP(3)`)
}, (table) => ({
  readerArticleUnique: uniqueIndex("likes_reader_article_unique").on(table.readerId, table.articleId),
  // The like *count* query filters on article alone; the unique index above leads with
  // `reader_id` and so cannot serve it.
  articleIdx: index6("likes_article_idx").on(table.articleId)
}));
var comments = mysqlTable12("comments", {
  id: char12("id", { length: 36 }).primaryKey().$defaultFn(newId),
  articleId: char12("article_id", { length: 36 }).notNull().references(() => articles.id, { onDelete: "cascade" }),
  readerId: char12("reader_id", { length: 36 }).notNull().references(() => readers.id, { onDelete: "cascade" }),
  body: text9("body").notNull(),
  status: mysqlEnum5("status", COMMENT_STATUS_VALUES).notNull().default("visible"),
  createdAt: datetime12("created_at", { fsp: 3 }).notNull().default(sql12`CURRENT_TIMESTAMP(3)`)
}, (table) => ({
  // Covers the public listing's exact shape: filter by article, order newest first.
  articleCreatedAtIdx: index6("comments_article_created_at_idx").on(table.articleId, table.createdAt)
}));
var articleViewsDaily = mysqlTable12("article_views_daily", {
  articleId: char12("article_id", { length: 36 }).notNull().references(() => articles.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  views: int6("views").notNull().default(0),
  uniqueViews: int6("unique_views").notNull().default(0)
}, (table) => ({
  pk: primaryKey3({ columns: [table.articleId, table.date] }),
  // The dashboard scans a trailing window across all articles; the primary key leads with
  // `article_id` and so cannot serve that.
  dateIdx: index6("article_views_daily_date_idx").on(table.date)
}));
var viewSeen = mysqlTable12("view_seen", {
  articleId: char12("article_id", { length: 36 }).notNull().references(() => articles.id, { onDelete: "cascade" }),
  visitorHash: varchar11("visitor_hash", { length: 128 }).notNull(),
  date: date("date", { mode: "string" }).notNull()
}, (table) => ({
  pk: primaryKey3({ columns: [table.articleId, table.visitorHash, table.date] }),
  dateIdx: index6("view_seen_date_idx").on(table.date)
}));

// ../../packages/db/dist/schema/moderation.js
import { sql as sql13 } from "drizzle-orm";
import { boolean as boolean7, char as char13, datetime as datetime13, index as index7, mysqlEnum as mysqlEnum6, mysqlTable as mysqlTable13, text as text10, uniqueIndex as uniqueIndex2 } from "drizzle-orm/mysql-core";
var MODERATION_TARGET_TYPE_VALUES = ["comment", "reader"];
var MODERATION_ACTION_VALUES = [
  "comment_removed",
  "comment_restored",
  "comment_reports_dismissed",
  "reader_muted",
  "reader_unmuted",
  "reader_banned",
  "reader_unbanned"
];
var moderationActions = mysqlTable13("moderation_actions", {
  id: char13("id", { length: 36 }).primaryKey().$defaultFn(newId),
  actorId: char13("actor_id", { length: 36 }).notNull().references(() => users.id),
  targetType: mysqlEnum6("target_type", MODERATION_TARGET_TYPE_VALUES).notNull(),
  targetId: char13("target_id", { length: 36 }).notNull(),
  action: mysqlEnum6("action", MODERATION_ACTION_VALUES).notNull(),
  reason: text10("reason"),
  createdAt: datetime13("created_at", { fsp: 3 }).notNull().default(sql13`CURRENT_TIMESTAMP(3)`)
}, (table) => ({
  // Per-target history: "has this comment or reader been moderated before, and how".
  targetHistoryIdx: index7("moderation_actions_target_history_idx").on(table.targetType, table.targetId, table.createdAt),
  // The queue read: every action, newest first, regardless of target.
  createdAtIdx: index7("moderation_actions_created_at_idx").on(table.createdAt)
}));
var COMMENT_REPORT_REASON_VALUES = ["spam", "harassment", "off_topic", "other"];
var commentReports = mysqlTable13("comment_reports", {
  id: char13("id", { length: 36 }).primaryKey().$defaultFn(newId),
  commentId: char13("comment_id", { length: 36 }).notNull().references(() => comments.id, { onDelete: "cascade" }),
  reporterId: char13("reporter_id", { length: 36 }).notNull().references(() => readers.id, { onDelete: "cascade" }),
  reason: mysqlEnum6("reason", COMMENT_REPORT_REASON_VALUES).notNull(),
  note: text10("note"),
  createdAt: datetime13("created_at", { fsp: 3 }).notNull().default(sql13`CURRENT_TIMESTAMP(3)`),
  resolvedAt: datetime13("resolved_at", { fsp: 3 }),
  resolvedBy: char13("resolved_by", { length: 36 }).references(() => users.id),
  // Replaces the Postgres partial index `comment_reports_open_idx ... WHERE resolved_at IS
  // NULL` (MySQL has no partial index) — see
  // openspec/changes/migrate-postgres-to-mysql/design.md, "the one partial index becomes a
  // stored generated column". Generated from `resolvedAt` alone, deliberately not from
  // `commentId`: MySQL/InnoDB rejects a generated column whose expression reads a column that
  // is itself the base of a cascading foreign key (`commentId` cascades on comment delete) —
  // confirmed against a live MySQL 8 instance while implementing this, where the natural
  // `case when resolved_at is null then comment_id end` design failed to install with
  // `ERROR 1215 Cannot add foreign key constraint`. A boolean flag has no such dependency, and
  // the composite index below (`isOpen` leading) serves `moderation.repository.ts`'s
  // open-report aggregate (`WHERE resolved_at IS NULL GROUP BY comment_id`) exactly as
  // selectively as the partial index did.
  // No `.notNull()` here even though the expression can never actually produce NULL (`IS NULL`
  // always returns 0/1) — MariaDB's grammar rejects `NOT NULL` on a `STORED` generated column
  // outright (`ER_PARSE_ERROR` right after `STORED`), unlike MySQL 8 which accepts it.
  isOpen: boolean7("is_open").generatedAlwaysAs(sql13`(\`resolved_at\` is null)`, { mode: "stored" })
}, (table) => ({
  commentReporterUnique: uniqueIndex2("comment_reports_comment_reporter_unique").on(table.commentId, table.reporterId),
  openReportsIdx: index7("comment_reports_open_idx").on(table.isOpen, table.commentId)
}));

// ../../packages/db/dist/schema/contact.js
import { sql as sql14 } from "drizzle-orm";
import { char as char14, datetime as datetime14, index as index8, mysqlEnum as mysqlEnum7, mysqlTable as mysqlTable14, text as text11, varchar as varchar12 } from "drizzle-orm/mysql-core";
var CONTACT_MESSAGE_STATUS_VALUES = ["new", "read"];
var contactMessages = mysqlTable14("contact_messages", {
  id: char14("id", { length: 36 }).primaryKey().$defaultFn(newId),
  name: varchar12("name", { length: 255 }).notNull(),
  organisation: varchar12("organisation", { length: 255 }),
  email: varchar12("email", { length: 320 }).notNull(),
  subject: varchar12("subject", { length: 512 }),
  message: text11("message").notNull(),
  status: mysqlEnum7("status", CONTACT_MESSAGE_STATUS_VALUES).notNull().default("new"),
  createdAt: datetime14("created_at", { fsp: 3 }).notNull().default(sql14`CURRENT_TIMESTAMP(3)`)
}, (table) => ({
  // The inbox read: every message, newest first, optionally filtered by status.
  createdAtIdx: index8("contact_messages_created_at_idx").on(table.createdAt),
  // The badge poll: `count(*) where status = 'new'` — cheap and pagination-free
  // (design.md - "Unread count is its own endpoint, not derived by the client from the full list").
  statusIdx: index8("contact_messages_status_idx").on(table.status)
}));

// ../../packages/db/dist/client.js
function resolveSsl(databaseUrl, nodeEnv) {
  const sslmode = new URL(databaseUrl).searchParams.get("sslmode");
  if (sslmode === null || sslmode === "disable") {
    if (nodeEnv === "production") {
      throw new Error("DATABASE_URL must set sslmode (e.g. 'require') in production \u2014 refusing to connect to MySQL in plaintext.");
    }
    return void 0;
  }
  return { rejectUnauthorized: sslmode !== "require" };
}
function getDb(env) {
  const ssl = resolveSsl(env.DATABASE_URL, env.NODE_ENV);
  const pool = createPool({
    uri: env.DATABASE_URL,
    timezone: "Z",
    supportBigNumbers: true,
    dateStrings: false,
    ...ssl ? { ssl } : {},
    connectionLimit: 10,
    queueLimit: 50,
    idleTimeout: 6e4
  });
  pool.on("connection", (connection) => {
    const raw = connection;
    raw.query("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED", (err) => {
      if (err)
        console.error("failed to set MySQL session isolation level", err);
    });
    raw.query("SET SESSION time_zone = '+00:00'", (err) => {
      if (err)
        console.error("failed to set MySQL session time zone", err);
    });
  });
  return drizzle(pool, { schema: schema_exports, mode: "default" });
}

// src/lib/db.ts
var cachedDb;
function getDatabase(env) {
  if (!cachedDb) {
    cachedDb = getDb(env);
  }
  return cachedDb;
}

// src/lib/mediaStorage.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
var MEDIA_TEMP_SUBDIR = ".tmp";
function readFtypBrand(b) {
  if (b.length < 12 || b.subarray(4, 8).toString("ascii") !== "ftyp") return null;
  return b.subarray(8, 12).toString("ascii");
}
var MP4_BRANDS = /* @__PURE__ */ new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "dash",
  "M4V ",
  "M4A ",
  "M4P ",
  "M4B "
]);
var SIGNATURES = [
  {
    mime: "image/jpeg",
    ext: "jpg",
    kind: "image",
    matches: (b) => b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255
  },
  {
    mime: "image/png",
    ext: "png",
    kind: "image",
    matches: (b) => b.length >= 8 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71 && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10
  },
  {
    mime: "image/gif",
    ext: "gif",
    kind: "image",
    matches: (b) => b.length >= 6 && b.subarray(0, 3).toString("ascii") === "GIF" && ["87a", "89a"].includes(b.subarray(3, 6).toString("ascii"))
  },
  {
    mime: "image/webp",
    ext: "webp",
    kind: "image",
    matches: (b) => b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP"
  },
  {
    mime: "image/avif",
    ext: "avif",
    kind: "image",
    matches: (b) => {
      const brand = readFtypBrand(b);
      return brand === "avif" || brand === "avis";
    }
  },
  {
    mime: "video/mp4",
    ext: "mp4",
    kind: "video",
    matches: (b) => {
      const brand = readFtypBrand(b);
      return brand !== null && MP4_BRANDS.has(brand);
    }
  }
];
function sniffMimeType(buffer) {
  for (const signature of SIGNATURES) {
    if (signature.matches(buffer)) return { mime: signature.mime, ext: signature.ext, kind: signature.kind };
  }
  return null;
}
async function ensureMediaStorageDir(env) {
  await mkdir(env.MEDIA_STORAGE_PATH, { recursive: true });
  await mkdir(path.join(env.MEDIA_STORAGE_PATH, MEDIA_TEMP_SUBDIR), { recursive: true });
}
function datedSubdir(date2) {
  const year = date2.getUTCFullYear();
  const month = String(date2.getUTCMonth() + 1).padStart(2, "0");
  return `${year}/${month}`;
}
var SNIFF_BYTES = 64;
async function readLeadingBytes(filePath) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
async function removeTempFile(tempPath) {
  try {
    await unlink(tempPath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}
async function storeUpload(env, input) {
  const { tempPath, sizeBytes, declaredMime } = input;
  const fail = async (message, status, code) => {
    await removeTempFile(tempPath);
    throw new AppError(message, status, code);
  };
  if (sizeBytes === 0) {
    return fail("Uploaded file is empty", 400, "empty_file");
  }
  const leading = await readLeadingBytes(tempPath);
  const sniffed = sniffMimeType(leading);
  if (!sniffed) {
    return fail("File type is not one of the accepted types", 415, "unsupported_media_type");
  }
  const maxBytes = sniffed.kind === "video" ? env.MEDIA_MAX_VIDEO_BYTES : env.MEDIA_MAX_IMAGE_BYTES;
  if (sizeBytes > maxBytes) {
    return fail("File exceeds the maximum allowed size for its type", 413, "file_too_large");
  }
  if (declaredMime && declaredMime !== sniffed.mime) {
    return fail("Declared content type does not match the file's actual content", 415, "content_type_mismatch");
  }
  const subdir = datedSubdir(/* @__PURE__ */ new Date());
  const filename = `${randomUUID2()}.${sniffed.ext}`;
  const absoluteDir = path.join(env.MEDIA_STORAGE_PATH, subdir);
  await mkdir(absoluteDir, { recursive: true });
  const finalPath = path.join(absoluteDir, filename);
  try {
    await rename(tempPath, finalPath);
  } catch (err) {
    await removeTempFile(tempPath);
    throw err;
  }
  return { storagePath: `${subdir}/${filename}`, mime: sniffed.mime, sizeBytes };
}
function publicUrlFor(env, storagePath) {
  return `${env.MEDIA_PUBLIC_BASE_URL}/${storagePath}`;
}
async function deleteStoredFile(env, storagePath) {
  try {
    await unlink(path.join(env.MEDIA_STORAGE_PATH, storagePath));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

// src/middleware/requestId.ts
import { randomUUID as randomUUID3 } from "node:crypto";
function requestId(req, res, next) {
  req.requestId = req.header("x-request-id") ?? randomUUID3();
  res.setHeader("x-request-id", req.requestId);
  next();
}

// src/middleware/authorize.ts
import { and, eq as eq2 } from "drizzle-orm";

// src/lib/ownerRole.ts
import { eq } from "drizzle-orm";
var cachedOwnerRoleId;
async function getOwnerRoleId(db2) {
  if (cachedOwnerRoleId) return cachedOwnerRoleId;
  const rows = await db2.select({ id: roles.id }).from(roles).where(eq(roles.isSystem, true));
  const [row] = rows;
  if (!row) throw new Error("Owner role not found \u2014 has the seed migration run?");
  if (rows.length > 1) {
    throw new Error(`Expected exactly one is_system role, found ${rows.length} \u2014 Owner identity is ambiguous`);
  }
  cachedOwnerRoleId = row.id;
  return cachedOwnerRoleId;
}

// src/middleware/authorize.ts
var DECLARATION_MARKER = /* @__PURE__ */ Symbol("authorizationDeclaration");
function markDeclaration(fn) {
  Object.assign(fn, { [DECLARATION_MARKER]: true });
  return fn;
}
function db() {
  return getDatabase(loadEnv());
}
var MUTATING_METHODS = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH", "DELETE"]);
function requirePublic() {
  return markDeclaration((_req, _res, next) => {
    next();
  });
}
function isSessionUsable(row) {
  const now = Date.now();
  return !row.revokedAt && row.expiresAt.getTime() > now && row.absoluteExpiresAt.getTime() > now;
}
var SESSION_VALIDITY_COLUMNS = {
  revokedAt: sessions.revokedAt,
  expiresAt: sessions.expiresAt,
  absoluteExpiresAt: sessions.absoluteExpiresAt
};
async function resolveReaderAccess(sessionId) {
  const [row] = await db().select({
    subjectId: sessions.subjectId,
    ...SESSION_VALIDITY_COLUMNS,
    status: readers.status,
    mutedUntil: readers.mutedUntil
  }).from(sessions).innerJoin(readers, eq2(sessions.subjectId, readers.id)).where(and(eq2(sessions.id, sessionId), eq2(sessions.subjectType, "reader"))).limit(1);
  if (!row || !isSessionUsable(row)) return null;
  return { subjectId: row.subjectId, status: row.status, mutedUntil: row.mutedUntil };
}
function requireReader(options = {}) {
  return markDeclaration(async (req, _res, next) => {
    try {
      if (!req.auth || req.auth.subjectType !== "reader") {
        throw new AppError("Reader session required", 401, "unauthenticated");
      }
      const access = await resolveReaderAccess(req.auth.sessionId);
      if (!access || access.subjectId !== req.auth.subjectId) {
        throw new AppError("Reader session required", 401, "unauthenticated");
      }
      const createsContent = options.createsContent ?? MUTATING_METHODS.has(req.method);
      if (createsContent) {
        if (access.status === "banned") {
          throw new AppError("Reader is banned from commenting", 403, "reader_banned");
        }
        if (access.mutedUntil && access.mutedUntil.getTime() > Date.now()) {
          throw new AppError("Reader is muted", 403, "reader_muted");
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  });
}
async function resolveStaffAccess(sessionId) {
  const rows = await db().select({
    subjectId: sessions.subjectId,
    ...SESSION_VALIDITY_COLUMNS,
    status: users.status,
    roleId: users.roleId,
    mustChangePassword: users.mustChangePassword,
    permissionKey: permissions.key
  }).from(sessions).innerJoin(users, eq2(sessions.subjectId, users.id)).leftJoin(rolePermissions, eq2(rolePermissions.roleId, users.roleId)).leftJoin(permissions, eq2(permissions.id, rolePermissions.permissionId)).where(and(eq2(sessions.id, sessionId), eq2(sessions.subjectType, "staff")));
  const [first] = rows;
  if (!first || !isSessionUsable(first)) return null;
  return {
    subjectId: first.subjectId,
    status: first.status,
    roleId: first.roleId,
    mustChangePassword: first.mustChangePassword,
    permissionKeys: rows.map((r) => r.permissionKey).filter((k) => k !== null)
  };
}
function passwordChangeRequiredError() {
  return new AppError("Password change required before continuing", 403, "password_change_required");
}
function requireStaff(options = {}) {
  return markDeclaration(async (req, _res, next) => {
    try {
      if (!req.auth || req.auth.subjectType !== "staff") {
        throw new AppError("Staff session required", 403, "forbidden");
      }
      const access = await resolveStaffAccess(req.auth.sessionId);
      if (!access || access.subjectId !== req.auth.subjectId || access.status !== "active") {
        throw new AppError("Staff session required", 403, "forbidden");
      }
      if (access.mustChangePassword && !options.allowPendingPasswordChange) {
        throw passwordChangeRequiredError();
      }
      const ownerRoleId = await getOwnerRoleId(db());
      req.staffRole = { roleId: access.roleId, isOwner: access.roleId === ownerRoleId, permissionKeys: access.permissionKeys };
      next();
    } catch (err) {
      next(err);
    }
  });
}
function requireAnyPermission(...keys) {
  return markDeclaration(async (req, _res, next) => {
    try {
      if (!req.auth || req.auth.subjectType !== "staff") {
        throw new AppError("Staff session required", 403, "forbidden");
      }
      const access = await resolveStaffAccess(req.auth.sessionId);
      if (!access || access.subjectId !== req.auth.subjectId || access.status !== "active") {
        throw new AppError("Staff session required", 403, "forbidden");
      }
      if (access.mustChangePassword) {
        throw passwordChangeRequiredError();
      }
      const ownerRoleId = await getOwnerRoleId(db());
      const isOwner = access.roleId === ownerRoleId;
      if (!isOwner && !keys.some((key) => access.permissionKeys.includes(key))) {
        throw new AppError("Insufficient permission", 403, "forbidden");
      }
      req.staffRole = { roleId: access.roleId, isOwner, permissionKeys: access.permissionKeys };
      next();
    } catch (err) {
      next(err);
    }
  });
}
function requirePermission(key) {
  return requireAnyPermission(key);
}
function isDeclared(handle) {
  return typeof handle === "function" && Boolean(handle[DECLARATION_MARKER]);
}
function nestedStack(handle) {
  if (typeof handle !== "function" && (typeof handle !== "object" || handle === null)) return null;
  const candidate = handle;
  for (const stack of [candidate.stack, candidate._router?.stack, candidate.router?.stack]) {
    if (Array.isArray(stack)) return stack;
  }
  return null;
}
function mountPathOf(layer) {
  const regexp = layer.regexp;
  if (!regexp?.source || regexp.fast_slash === true) return "";
  const match = /^\^\\\/(?<path>[^\\]*)/.exec(regexp.source);
  return match?.groups?.path ? `/${match.groups.path}` : "";
}
function isGloballyMounted(layer) {
  return layer.regexp?.fast_slash === true;
}
function auditAuthorizationDeclarations(app) {
  const undeclared = [];
  function walk(stack, mountPath, inheritedDeclaration) {
    if (!Array.isArray(stack)) return;
    let declaredHere = inheritedDeclaration;
    for (const layer of stack) {
      const route = layer.route;
      if (route) {
        const declared = declaredHere || (route.stack ?? []).some((l) => isDeclared(l.handle));
        if (!declared) {
          const methods = Object.keys(route.methods ?? {}).join(",").toUpperCase();
          undeclared.push(`${methods} ${mountPath}${route.path ?? ""}`);
        }
        continue;
      }
      const handle = layer.handle;
      if (isDeclared(handle)) {
        declaredHere = true;
        continue;
      }
      const nested = nestedStack(handle);
      if (nested) {
        walk(nested, `${mountPath}${mountPathOf(layer)}`, declaredHere);
        continue;
      }
      if (typeof handle === "function") {
        if (isGloballyMounted(layer) || handle.length >= 4 || declaredHere) continue;
        const name = typeof handle.name === "string" && handle.name ? handle.name : "anonymous";
        undeclared.push(`ALL ${mountPath}${mountPathOf(layer)} (${name}, not introspectable)`);
        continue;
      }
      throw new Error(
        `Cannot audit authorization: unrecognized Express layer shape at "${mountPath}". Refusing to boot rather than assume it is declared.`
      );
    }
  }
  const root = app;
  walk(root._router?.stack ?? root.router?.stack, "", false);
  if (undeclared.length > 0) {
    throw new Error(
      `Routes with no authorization declaration (public/reader/staff/permission): ${undeclared.join(", ")}`
    );
  }
}

// src/modules/health/health.routes.ts
import { Router } from "express";
function healthRoutes() {
  const router = Router();
  router.get("/", requirePublic(), (_req, res) => {
    const body = { status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() };
    res.json(body);
  });
  return router;
}

// src/modules/users/user.routes.ts
import { Router as Router2 } from "express";

// src/modules/users/user.controller.ts
function createUserController(service) {
  return {
    async getMe(req, res, next) {
      try {
        const subjectId = req.auth?.subjectId;
        if (!subjectId) throw new AppError("Not authenticated", 401, "unauthenticated");
        const access = { permissionKeys: req.staffRole?.permissionKeys ?? [], isOwner: req.staffRole?.isOwner ?? false };
        const user = await service.getById(subjectId, access);
        if (!user) throw new AppError("User not found", 404, "not_found");
        res.json({ success: true, data: user });
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/users/user.mapper.ts
function toStaffUserDto(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roleId: row.roleId,
    roleName: row.roleName,
    status: row.status,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
    permissionKeys: row.permissionKeys,
    isOwner: row.isOwner
  };
}

// src/modules/users/user.service.ts
function createUserService(repository) {
  return {
    async getById(id, access) {
      const row = await repository.findById(id);
      return row ? toStaffUserDto({ ...row, ...access }) : null;
    }
  };
}

// src/modules/users/user.repository.ts
import { eq as eq3 } from "drizzle-orm";
function createUserRepository(db2) {
  return {
    async findById(id) {
      const [row] = await db2.select({
        id: users.id,
        email: users.email,
        name: users.name,
        roleId: users.roleId,
        roleName: roles.name,
        status: users.status,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt
      }).from(users).innerJoin(roles, eq3(users.roleId, roles.id)).where(eq3(users.id, id)).limit(1);
      return row ?? null;
    }
  };
}

// src/modules/users/user.routes.ts
function userRoutes(db2) {
  const router = Router2();
  const controller = createUserController(createUserService(createUserRepository(db2)));
  router.get("/me", requireStaff({ allowPendingPasswordChange: true }), controller.getMe);
  return router;
}

// src/modules/auth/auth.routes.ts
import { Router as Router3 } from "express";

// ../../packages/contracts/dist/article-status.js
import { z as z2 } from "zod";
var ARTICLE_STATUSES = ["draft", "scheduled", "published"];
var articleStatusSchema = z2.enum(ARTICLE_STATUSES);

// ../../packages/contracts/dist/health.js
import { z as z3 } from "zod";
var pingResponseSchema = z3.object({
  status: z3.literal("ok"),
  timestamp: z3.string().datetime()
});

// ../../packages/contracts/dist/permission.js
import { z as z4 } from "zod";
var PERMISSION_KEYS = [
  "news.manage",
  "category.manage",
  "anak-usaha.manage",
  "media.manage",
  "user.manage",
  "role.manage",
  "dashboard.view",
  "settings.manage",
  "moderation.manage",
  "contact.manage"
];
var permissionKeySchema = z4.enum(PERMISSION_KEYS);

// ../../packages/contracts/dist/auth.js
import { z as z7 } from "zod";

// ../../packages/contracts/dist/staff.js
import { z as z6 } from "zod";

// ../../packages/contracts/dist/session.js
import { z as z5 } from "zod";
var staffAccountResponseSchema = z5.object({
  id: z5.string().uuid(),
  email: z5.string().email(),
  name: z5.string(),
  roleId: z5.string().uuid(),
  roleName: z5.string(),
  status: z5.enum(["active", "disabled"]),
  mustChangePassword: z5.boolean(),
  createdAt: z5.string()
});
var staffCreateResponseSchema = staffAccountResponseSchema.extend({
  temporaryPassword: z5.string()
});
var staffResetResponseSchema = z5.object({
  temporaryPassword: z5.string()
});
var readerAccountResponseSchema = z5.object({
  id: z5.string().uuid(),
  email: z5.string().email(),
  name: z5.string(),
  avatarUrl: z5.string().url().nullable(),
  status: z5.enum(["active", "banned"]),
  createdAt: z5.string()
});

// ../../packages/contracts/dist/staff.js
var staffEmailSchema = z6.string().trim().toLowerCase().pipe(z6.string().email());
var staffCreateRequestSchema = z6.object({
  email: staffEmailSchema,
  name: z6.string().min(1).max(200),
  roleId: z6.string().uuid()
}).strict();
var staffPasswordChangeRequestSchema = z6.object({
  currentPassword: z6.string().min(1),
  newPassword: z6.string().min(8)
}).strict();

// ../../packages/contracts/dist/auth.js
var staffSignInRequestSchema = z7.object({
  email: staffEmailSchema,
  password: z7.string().min(1)
});

// ../../packages/contracts/dist/role.js
import { z as z8 } from "zod";
var roleCreateRequestSchema = z8.object({
  name: z8.string().min(1).max(100),
  permissions: z8.array(permissionKeySchema)
}).strict();
var roleUpdateRequestSchema = z8.object({
  name: z8.string().min(1).max(100).optional(),
  permissions: z8.array(permissionKeySchema).optional()
}).strict();
var roleAssignmentRequestSchema = z8.object({
  roleId: z8.string().uuid()
});
var roleResponseSchema = z8.object({
  id: z8.string().uuid(),
  name: z8.string(),
  slug: z8.string(),
  isSystem: z8.boolean(),
  permissions: z8.array(permissionKeySchema)
});
var roleSummaryResponseSchema = z8.object({
  id: z8.string().uuid(),
  name: z8.string(),
  slug: z8.string(),
  isSystem: z8.boolean(),
  holderCount: z8.number().int().nonnegative()
});
var roleDetailResponseSchema = roleSummaryResponseSchema.extend({
  permissions: z8.array(permissionKeySchema)
});

// ../../packages/contracts/dist/category.js
import { z as z9 } from "zod";
var categoryCreateRequestSchema = z9.object({
  name: z9.string().min(1).max(200)
}).strict();
var categoryUpdateRequestSchema = z9.object({
  name: z9.string().min(1).max(200)
}).strict();
var categoryResponseSchema = z9.object({
  id: z9.string().uuid(),
  name: z9.string(),
  slug: z9.string()
});

// ../../packages/contracts/dist/anak-usaha.js
import { z as z11 } from "zod";

// ../../packages/contracts/dist/partner.js
import { z as z10 } from "zod";
function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
var websiteUrlSchema = z10.string().url().refine(isHttpUrl, { message: "Website URL must use http or https" });
var partnerCreateRequestSchema = z10.object({
  name: z10.string().min(1).max(200),
  logoMediaId: z10.string().uuid(),
  websiteUrl: websiteUrlSchema.nullable().optional(),
  isActive: z10.boolean().optional()
}).strict();
var partnerUpdateRequestSchema = z10.object({
  name: z10.string().min(1).max(200).optional(),
  logoMediaId: z10.string().uuid().optional(),
  websiteUrl: websiteUrlSchema.nullable().optional(),
  isActive: z10.boolean().optional()
}).strict();
var partnerReorderRequestSchema = z10.object({
  partnerIds: z10.array(z10.string().uuid()).refine((ids) => new Set(ids).size === ids.length, {
    message: "partnerIds must not contain duplicates"
  })
}).strict();
var partnerResponseSchema = z10.object({
  id: z10.string().uuid(),
  name: z10.string(),
  logoUrl: z10.string(),
  websiteUrl: z10.string().nullable(),
  isActive: z10.boolean(),
  sortOrder: z10.number().int(),
  createdAt: z10.string().datetime(),
  updatedAt: z10.string().datetime()
});
var publicPartnerSchema = z10.object({
  name: z10.string(),
  logoUrl: z10.string(),
  websiteUrl: z10.string().nullable()
});

// ../../packages/contracts/dist/anak-usaha.js
var anakUsahaCreateRequestSchema = z11.object({
  name: z11.string().min(1).max(200)
}).strict();
var anakUsahaUpdateRequestSchema = z11.object({
  name: z11.string().min(1).max(200)
}).strict();
var anakUsahaResponseSchema = z11.object({
  id: z11.string().uuid(),
  name: z11.string(),
  slug: z11.string()
});
var anakUsahaKindSchema = z11.enum(["Media Platform", "News & Community"]);
var hexColorSchema = z11.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #RRGGBB");
var anakUsahaLinkSchema = z11.object({
  label: z11.string().min(1).max(100),
  href: z11.string().url().refine(isHttpUrl, { message: "Link URL must use http or https" })
}).strict();
var anakUsahaProfileCreateRequestSchema = z11.object({
  logoMediaId: z11.string().uuid().nullable().optional(),
  backgroundColor: hexColorSchema.nullable().optional(),
  description: z11.string().max(2e3).nullable().optional(),
  kind: anakUsahaKindSchema,
  links: z11.array(anakUsahaLinkSchema).max(10).optional()
}).strict();
var anakUsahaProfileUpdateRequestSchema = z11.object({
  logoMediaId: z11.string().uuid().nullable().optional(),
  backgroundColor: hexColorSchema.nullable().optional(),
  description: z11.string().max(2e3).nullable().optional(),
  kind: anakUsahaKindSchema.optional(),
  links: z11.array(anakUsahaLinkSchema).max(10).optional(),
  isActive: z11.boolean().optional()
}).strict();
var anakUsahaProfileReorderRequestSchema = z11.object({
  anakUsahaIds: z11.array(z11.string().uuid()).refine((ids) => new Set(ids).size === ids.length, {
    message: "anakUsahaIds must not contain duplicates"
  })
}).strict();
var anakUsahaProfileFieldsSchema = z11.object({
  logoUrl: z11.string().nullable(),
  backgroundColor: z11.string().nullable(),
  description: z11.string().nullable(),
  kind: anakUsahaKindSchema,
  links: z11.array(anakUsahaLinkSchema),
  sortOrder: z11.number().int(),
  isActive: z11.boolean()
});
var anakUsahaAdminResponseSchema = anakUsahaResponseSchema.extend({
  profile: anakUsahaProfileFieldsSchema.nullable()
});
var publicAnakUsahaSchema = anakUsahaResponseSchema.extend({
  logoUrl: z11.string().nullable().optional(),
  backgroundColor: z11.string().nullable().optional(),
  description: z11.string().nullable().optional(),
  kind: anakUsahaKindSchema.optional(),
  links: z11.array(anakUsahaLinkSchema).optional(),
  sortOrder: z11.number().int().optional()
});

// ../../packages/contracts/dist/media.js
import { z as z12 } from "zod";
var MEDIA_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
var MEDIA_VIDEO_MIME_TYPES = ["video/mp4"];
var MEDIA_MIME_TYPES = [...MEDIA_IMAGE_MIME_TYPES, ...MEDIA_VIDEO_MIME_TYPES];
var mediaMimeTypeSchema = z12.enum(MEDIA_MIME_TYPES);
function isVideoMimeType(mime) {
  return MEDIA_VIDEO_MIME_TYPES.includes(mime);
}
var mediaUploadMetadataSchema = z12.object({
  alt: z12.string().max(500).optional(),
  caption: z12.string().max(1e3).optional()
}).strict();
var mediaUpdateRequestSchema = z12.object({
  alt: z12.string().max(500).nullable().optional(),
  caption: z12.string().max(1e3).nullable().optional()
}).strict();
var mediaResponseSchema = z12.object({
  id: z12.string().uuid(),
  url: z12.string(),
  mime: mediaMimeTypeSchema,
  sizeBytes: z12.number().int().positive(),
  originalFilename: z12.string(),
  alt: z12.string().nullable(),
  caption: z12.string().nullable(),
  createdAt: z12.string().datetime()
});

// ../../packages/contracts/dist/article.js
import { z as z13 } from "zod";
var articleSlugSchema = z13.string().min(1).max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be a lowercase, kebab-case, URL-safe slug");
var articleBodyJsonSchema = z13.unknown();
var articleWriteFieldsSchema = z13.object({
  title: z13.string().min(1).max(500),
  slug: articleSlugSchema.optional(),
  bodyJson: articleBodyJsonSchema.optional(),
  excerpt: z13.string().max(1e3).optional(),
  categoryIds: z13.array(z13.string().uuid()).optional(),
  featuredMediaId: z13.string().uuid().nullable().optional(),
  anakUsahaId: z13.string().uuid().nullable().optional(),
  seoTitle: z13.string().max(200).optional(),
  seoDescription: z13.string().max(500).optional()
});
var articleCreateRequestSchema = articleWriteFieldsSchema.strict();
var articleUpdateRequestSchema = articleWriteFieldsSchema.partial().strict();
var articleAutosaveRequestSchema = z13.object({
  title: z13.string().min(1).max(500).optional(),
  bodyJson: articleBodyJsonSchema.optional(),
  excerpt: z13.string().max(1e3).optional(),
  categoryIds: z13.array(z13.string().uuid()).optional(),
  featuredMediaId: z13.string().uuid().nullable().optional(),
  anakUsahaId: z13.string().uuid().nullable().optional(),
  seoTitle: z13.string().max(200).optional(),
  seoDescription: z13.string().max(500).optional()
}).strict();
var articleScheduleRequestSchema = z13.object({
  publishedAt: z13.string().datetime()
}).strict();
var DEFAULT_PUBLIC_LIST_LIMIT = 20;
var MAX_PUBLIC_LIST_LIMIT = 100;
function commaSeparatedList(itemSchema) {
  return z13.preprocess((value) => {
    const raw = typeof value === "string" ? [value] : Array.isArray(value) ? value : void 0;
    if (raw === void 0)
      return void 0;
    const entries = raw.filter((entry) => typeof entry === "string").flatMap((entry) => entry.split(",")).filter((entry) => entry.length > 0);
    return entries.length > 0 ? entries : void 0;
  }, z13.array(itemSchema).optional());
}
var articlePublicListQuerySchema = z13.object({
  // Clamped, not rejected: a client asking for more than the cap gets the cap, not a 400
  // (specs/public-news-api/spec.md - "Scenario: Limit is capped"). `.min(1)` still rejects zero
  // and negatives — those are malformed, not merely oversized, and no scenario asks for them to
  // be clamped.
  limit: z13.coerce.number().int().min(1).default(DEFAULT_PUBLIC_LIST_LIMIT).transform((n) => Math.min(n, MAX_PUBLIC_LIST_LIMIT)),
  offset: z13.coerce.number().int().min(0).default(0),
  categorySlugs: commaSeparatedList(z13.string()),
  anakUsahaSlugs: commaSeparatedList(z13.string()),
  publishedAfter: z13.coerce.date().optional(),
  publishedBefore: z13.coerce.date().optional(),
  excludeIds: commaSeparatedList(z13.string().uuid())
});
var articlePublicCardSchema = z13.object({
  id: z13.string().uuid(),
  slug: z13.string(),
  title: z13.string(),
  excerpt: z13.string().nullable(),
  featuredImageUrl: z13.string().nullable(),
  categories: z13.array(categoryResponseSchema),
  anakUsaha: anakUsahaResponseSchema.nullable(),
  authorName: z13.string(),
  publishedAt: z13.string().datetime()
});
var articlePublicDetailSchema = articlePublicCardSchema.extend({
  bodyHtml: z13.string(),
  seoTitle: z13.string().nullable(),
  seoDescription: z13.string().nullable()
});
var articleAdminResponseSchema = z13.object({
  id: z13.string().uuid(),
  title: z13.string(),
  slug: z13.string(),
  bodyJson: z13.unknown(),
  bodyHtml: z13.string(),
  excerpt: z13.string().nullable(),
  status: articleStatusSchema,
  authorId: z13.string().uuid(),
  authorName: z13.string(),
  featuredMediaId: z13.string().uuid().nullable(),
  featuredImageUrl: z13.string().nullable(),
  categories: z13.array(categoryResponseSchema),
  anakUsaha: anakUsahaResponseSchema.nullable(),
  seoTitle: z13.string().nullable(),
  seoDescription: z13.string().nullable(),
  publishedAt: z13.string().datetime().nullable(),
  createdAt: z13.string().datetime(),
  updatedAt: z13.string().datetime()
});

// ../../packages/contracts/dist/curation.js
import { z as z14 } from "zod";
var MAX_HOME_CURATION_ENTRIES = 10;
var homeCurationReplaceRequestSchema = z14.object({
  articleIds: z14.array(z14.string().uuid()).max(MAX_HOME_CURATION_ENTRIES).refine((ids) => new Set(ids).size === ids.length, {
    message: "articleIds must not contain duplicates"
  })
}).strict();
var homeCurationArticleSummarySchema = z14.object({
  id: z14.string().uuid(),
  title: z14.string(),
  slug: z14.string()
});
var homeCurationEntryResponseSchema = z14.object({
  article: homeCurationArticleSummarySchema,
  status: articleStatusSchema,
  position: z14.number().int(),
  isPubliclyVisible: z14.boolean()
});
var homeFeedQuerySchema = z14.object({
  limit: z14.coerce.number().int().min(1).default(DEFAULT_PUBLIC_LIST_LIMIT).transform((n) => Math.min(n, MAX_PUBLIC_LIST_LIMIT))
});

// ../../packages/contracts/dist/dashboard.js
import { z as z15 } from "zod";
var DASHBOARD_CADENCE_WEEKS = 8;
var DASHBOARD_DUE_SOON_LIMIT = 20;
var dashboardPipelineSchema = z15.object({
  draft: z15.number().int().nonnegative(),
  scheduled: z15.number().int().nonnegative(),
  published: z15.number().int().nonnegative()
});
var dashboardCadenceBucketSchema = z15.object({
  weekStart: z15.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z15.number().int().nonnegative()
});
var dashboardContentDebtSchema = z15.object({
  missingSeoDescription: z15.number().int().nonnegative(),
  missingExcerpt: z15.number().int().nonnegative(),
  missingFeaturedImage: z15.number().int().nonnegative(),
  uncategorized: z15.number().int().nonnegative()
});
var curationIntegrityCountsSchema = z15.object({
  total: z15.number().int().nonnegative(),
  visible: z15.number().int().nonnegative()
});
var dashboardCurationIntegritySchema = z15.object({
  home: curationIntegrityCountsSchema
});
var dashboardUpNextArticleSchema = z15.object({
  id: z15.string().uuid(),
  title: z15.string(),
  slug: z15.string(),
  publishedAt: z15.string().datetime()
});
var dashboardUpNextSchema = z15.object({
  dueWithin48h: z15.array(dashboardUpNextArticleSchema).max(DASHBOARD_DUE_SOON_LIMIT),
  dueWithin48hTotal: z15.number().int().nonnegative(),
  overdueUnpromotedCount: z15.number().int().nonnegative()
});
var dashboardReadersSchema = z15.object({
  newLast7d: z15.number().int().nonnegative(),
  activeLast30d: z15.number().int().nonnegative()
});
var DASHBOARD_TOP_ARTICLES_LIMIT = 5;
var dashboardTopArticleSchema = z15.object({
  id: z15.string().uuid(),
  title: z15.string(),
  slug: z15.string(),
  views: z15.number().int().nonnegative()
});
var dashboardReadershipSchema = z15.object({
  last7dViews: z15.number().int().nonnegative(),
  last7dUniqueViews: z15.number().int().nonnegative(),
  topArticles: z15.array(dashboardTopArticleSchema).max(DASHBOARD_TOP_ARTICLES_LIMIT)
});
var dashboardResponseSchema = z15.object({
  pipeline: dashboardPipelineSchema,
  cadence: z15.array(dashboardCadenceBucketSchema).length(DASHBOARD_CADENCE_WEEKS),
  contentDebt: dashboardContentDebtSchema,
  curationIntegrity: dashboardCurationIntegritySchema,
  upNext: dashboardUpNextSchema,
  readers: dashboardReadersSchema,
  readership: dashboardReadershipSchema
});

// ../../packages/contracts/dist/guidePick.js
import { z as z16 } from "zod";
var guidePickCreateRequestSchema = z16.object({
  city: z16.string().min(1).max(200),
  place: z16.string().min(1).max(200),
  description: z16.string().min(1).max(1e3),
  photoMediaId: z16.string().uuid(),
  videoMediaId: z16.string().uuid(),
  isActive: z16.boolean().optional()
}).strict();
var guidePickUpdateRequestSchema = z16.object({
  city: z16.string().min(1).max(200).optional(),
  place: z16.string().min(1).max(200).optional(),
  description: z16.string().min(1).max(1e3).optional(),
  photoMediaId: z16.string().uuid().optional(),
  videoMediaId: z16.string().uuid().optional(),
  isActive: z16.boolean().optional()
}).strict();
var guidePickReorderRequestSchema = z16.object({
  guidePickIds: z16.array(z16.string().uuid()).refine((ids) => new Set(ids).size === ids.length, {
    message: "guidePickIds must not contain duplicates"
  })
}).strict();
var guidePickResponseSchema = z16.object({
  id: z16.string().uuid(),
  city: z16.string(),
  place: z16.string(),
  description: z16.string(),
  photoUrl: z16.string(),
  videoUrl: z16.string(),
  isActive: z16.boolean(),
  sortOrder: z16.number().int(),
  createdAt: z16.string().datetime(),
  updatedAt: z16.string().datetime()
});
var publicGuidePickSchema = z16.object({
  city: z16.string(),
  place: z16.string(),
  description: z16.string(),
  photoUrl: z16.string(),
  videoUrl: z16.string()
});

// ../../packages/contracts/dist/engagement.js
import { z as z17 } from "zod";
var COMMENT_MAX_LENGTH = 2e3;
var COMMENT_PAGE_SIZE = 10;
var MAX_COMMENT_LIST_LIMIT = 50;
var commentListQuerySchema = z17.object({
  limit: z17.coerce.number().int().min(1).default(COMMENT_PAGE_SIZE).transform((n) => Math.min(n, MAX_COMMENT_LIST_LIMIT)),
  offset: z17.coerce.number().int().min(0).default(0)
});
var articleEngagementSchema = z17.object({
  viewCount: z17.number().int().nonnegative(),
  likeCount: z17.number().int().nonnegative(),
  commentCount: z17.number().int().nonnegative(),
  likedByReader: z17.boolean()
});
var likeToggleResponseSchema = z17.object({
  liked: z17.boolean(),
  likeCount: z17.number().int().nonnegative()
});
var commentResponseSchema = z17.object({
  id: z17.string().uuid(),
  body: z17.string(),
  authorName: z17.string(),
  authorAvatarUrl: z17.string().nullable(),
  createdAt: z17.string().datetime()
});
var commentCreateRequestSchema = z17.object({
  body: z17.string().trim().min(1).max(COMMENT_MAX_LENGTH)
}).strict();

// ../../packages/contracts/dist/moderation.js
import { z as z18 } from "zod";
var MODERATION_ACTIONS = [
  "comment_removed",
  "comment_restored",
  "comment_reports_dismissed",
  "reader_muted",
  "reader_unmuted",
  "reader_banned",
  "reader_unbanned"
];
var moderationActionSchema = z18.enum(MODERATION_ACTIONS);
var MODERATION_REASON_MAX_LENGTH = 500;
var moderationReasonSchema = z18.string().trim().min(1).max(MODERATION_REASON_MAX_LENGTH).optional();
var DEFAULT_COMMENT_QUEUE_LIMIT = 20;
var MAX_COMMENT_QUEUE_LIMIT = 100;
var COMMENT_QUEUE_STATUS_FILTERS = ["visible", "removed", "all", "reported"];
var commentQueueStatusFilterSchema = z18.enum(COMMENT_QUEUE_STATUS_FILTERS);
var MODERATION_COMMENT_STATUSES = ["visible", "removed"];
var moderationCommentStatusSchema = z18.enum(MODERATION_COMMENT_STATUSES);
var COMMENT_REPORT_REASONS = ["spam", "harassment", "off_topic", "other"];
var commentReportReasonSchema = z18.enum(COMMENT_REPORT_REASONS);
var commentQueueQuerySchema = z18.object({
  status: commentQueueStatusFilterSchema.default("all"),
  cursor: z18.string().min(1).optional(),
  limit: z18.coerce.number().int().min(1).default(DEFAULT_COMMENT_QUEUE_LIMIT).transform((n) => Math.min(n, MAX_COMMENT_QUEUE_LIMIT))
});
var commentQueueRowSchema = z18.object({
  id: z18.string().uuid(),
  body: z18.string(),
  status: moderationCommentStatusSchema,
  articleId: z18.string().uuid(),
  articleTitle: z18.string(),
  articleSlug: z18.string(),
  authorName: z18.string(),
  createdAt: z18.string().datetime(),
  // Present only when the comment carries at least one unresolved report
  // (specs/community-moderation/spec.md - "A comment's open report count and reasons are never
  // themselves an action"). A comment with zero open reports carries neither field, rather than
  // `openReportCount: 0` — the absence of a report is not itself information a moderator reads.
  openReportCount: z18.number().int().positive().optional(),
  reportReasons: z18.array(commentReportReasonSchema).min(1).optional()
});
var commentQueueResponseSchema = z18.object({
  items: z18.array(commentQueueRowSchema),
  nextCursor: z18.string().nullable()
});
var commentModerateRequestSchema = z18.object({
  status: moderationCommentStatusSchema,
  reason: moderationReasonSchema
}).strict();
var COMMENT_REPORT_NOTE_MAX_LENGTH = 500;
var commentReportRequestSchema = z18.object({
  reason: commentReportReasonSchema,
  note: z18.string().trim().min(1).max(COMMENT_REPORT_NOTE_MAX_LENGTH).optional()
}).strict();
var commentReportResponseSchema = z18.object({
  id: z18.string().uuid(),
  commentId: z18.string().uuid(),
  reason: commentReportReasonSchema,
  note: z18.string().nullable(),
  createdAt: z18.string().datetime()
});
var commentReportsDismissRequestSchema = z18.object({
  reason: moderationReasonSchema
}).strict();
var DEFAULT_READER_QUEUE_LIMIT = 20;
var MAX_READER_QUEUE_LIMIT = 100;
var READER_QUEUE_STATUS_FILTERS = ["active", "banned", "all"];
var readerQueueStatusFilterSchema = z18.enum(READER_QUEUE_STATUS_FILTERS);
var readerQueueQuerySchema = z18.object({
  search: z18.string().trim().min(1).optional(),
  status: readerQueueStatusFilterSchema.default("all"),
  limit: z18.coerce.number().int().min(1).default(DEFAULT_READER_QUEUE_LIMIT).transform((n) => Math.min(n, MAX_READER_QUEUE_LIMIT)),
  offset: z18.coerce.number().int().min(0).default(0)
});
var readerQueueRowSchema = z18.object({
  id: z18.string().uuid(),
  name: z18.string(),
  email: z18.string().email(),
  avatarUrl: z18.string().nullable(),
  status: z18.enum(["active", "banned"]),
  mutedUntil: z18.string().datetime().nullable(),
  commentCount: z18.number().int().nonnegative(),
  createdAt: z18.string().datetime()
});
var readerQueueResponseSchema = z18.array(readerQueueRowSchema);
var readerModerateRequestSchema = z18.object({
  status: z18.enum(["active", "banned"]).optional(),
  mutedUntil: z18.string().datetime().nullable().optional(),
  reason: moderationReasonSchema
}).strict().refine((body) => body.status !== void 0 || body.mutedUntil !== void 0, {
  message: "At least one of status or mutedUntil is required"
});
var moderationActionResponseSchema = z18.object({
  id: z18.string().uuid(),
  actorName: z18.string(),
  targetType: z18.enum(["comment", "reader"]),
  targetId: z18.string().uuid(),
  action: moderationActionSchema,
  reason: z18.string().nullable(),
  createdAt: z18.string().datetime()
});

// ../../packages/contracts/dist/contact.js
import { z as z19 } from "zod";
var CONTACT_MESSAGE_STATUSES = ["new", "read"];
var contactMessageStatusSchema = z19.enum(CONTACT_MESSAGE_STATUSES);
var CONTACT_NAME_MAX_LENGTH = 200;
var CONTACT_ORGANISATION_MAX_LENGTH = 200;
var CONTACT_EMAIL_MAX_LENGTH = 320;
var CONTACT_SUBJECT_MAX_LENGTH = 200;
var CONTACT_MESSAGE_MAX_LENGTH = 5e3;
var contactMessageSubmitRequestSchema = z19.object({
  name: z19.string().trim().min(1).max(CONTACT_NAME_MAX_LENGTH),
  organisation: z19.string().trim().min(1).max(CONTACT_ORGANISATION_MAX_LENGTH).optional(),
  email: z19.string().trim().email().max(CONTACT_EMAIL_MAX_LENGTH),
  subject: z19.string().trim().min(1).max(CONTACT_SUBJECT_MAX_LENGTH).optional(),
  message: z19.string().trim().min(1).max(CONTACT_MESSAGE_MAX_LENGTH)
}).strict();
var contactMessageSubmitResponseSchema = z19.object({
  id: z19.string().uuid(),
  createdAt: z19.string().datetime()
});
var CONTACT_MESSAGE_STATUS_FILTERS = ["new", "read", "all"];
var contactMessageStatusFilterSchema = z19.enum(CONTACT_MESSAGE_STATUS_FILTERS);
var contactMessageQuerySchema = z19.object({
  status: contactMessageStatusFilterSchema.default("all")
});
var contactMessageRowSchema = z19.object({
  id: z19.string().uuid(),
  name: z19.string(),
  organisation: z19.string().nullable(),
  email: z19.string(),
  subject: z19.string().nullable(),
  message: z19.string(),
  status: contactMessageStatusSchema,
  createdAt: z19.string().datetime()
});
var contactMessageListResponseSchema = z19.array(contactMessageRowSchema);
var contactMessageUnreadCountResponseSchema = z19.object({
  count: z19.number().int().nonnegative()
});
var contactMessageUpdateRequestSchema = z19.object({
  status: contactMessageStatusSchema
}).strict();

// src/modules/auth/auth.service.ts
var REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
var ABSOLUTE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1e3;
function createAuthService(repository, env) {
  async function issueTokens(sessionId, subjectId, subjectType, refreshToken) {
    const accessToken = await signAccessToken({ subjectId, subjectType, sessionId }, env);
    return {
      accessToken,
      refreshToken,
      // Bound to this session id, so the token issued before a rotation stops being accepted.
      csrfToken: issueCsrfToken(env, sessionId),
      sessionId,
      subjectId,
      subjectType
    };
  }
  return {
    async startSession(subjectId, subjectType, meta) {
      const { token, tokenHash, familyId } = issueRefreshToken();
      const now = Date.now();
      const row = await repository.create({
        subjectId,
        subjectType,
        refreshTokenHash: tokenHash,
        familyId,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
        absoluteExpiresAt: new Date(now + ABSOLUTE_SESSION_TTL_MS),
        userAgent: meta.userAgent,
        ipHash: meta.ipHash
      });
      return issueTokens(row.id, subjectId, subjectType, token);
    },
    async refresh(rawRefreshToken, meta) {
      const tokenHash = sha256Hex(rawRefreshToken);
      const row = await repository.findByRefreshTokenHash(tokenHash);
      if (!row) {
        throw new AppError("Invalid refresh token", 401, "invalid_refresh_token");
      }
      if (row.revokedAt) {
        await repository.revokeFamily(row.familyId);
        throw new AppError("Refresh token reuse detected", 401, "refresh_reuse_detected");
      }
      const now = Date.now();
      if (row.expiresAt.getTime() < now || row.absoluteExpiresAt.getTime() < now) {
        await repository.revoke(row.id);
        throw new AppError("Session expired", 401, "session_expired");
      }
      const active = await repository.isSubjectActive(row.subjectType, row.subjectId);
      if (!active) {
        await repository.revoke(row.id);
        throw new AppError("Account is no longer active", 401, "account_inactive");
      }
      await repository.revoke(row.id);
      const { token, tokenHash: newHash } = rotateRefreshToken(row.familyId);
      const newRow = await repository.create({
        subjectId: row.subjectId,
        subjectType: row.subjectType,
        refreshTokenHash: newHash,
        familyId: row.familyId,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
        absoluteExpiresAt: row.absoluteExpiresAt,
        // hard cap carries forward, never extended
        userAgent: meta.userAgent,
        ipHash: meta.ipHash
      });
      return issueTokens(newRow.id, row.subjectId, row.subjectType, token);
    },
    async logout(rawRefreshToken, sessionId) {
      if (rawRefreshToken) {
        const row = await repository.findByRefreshTokenHash(sha256Hex(rawRefreshToken));
        if (row) {
          await repository.revoke(row.id);
          return;
        }
      }
      if (sessionId) await repository.revoke(sessionId);
    },
    async revokeAllForSubject(subjectType, subjectId) {
      await repository.revokeAllForSubject(subjectType, subjectId);
    },
    async revokeAllForSubjectExcept(subjectType, subjectId, exceptSessionId) {
      await repository.revokeAllForSubjectExcept(subjectType, subjectId, exceptSessionId);
    },
    async revokeAll() {
      await repository.revokeAll();
    },
    async getReaderAccount(subjectId) {
      return repository.findReaderAccount(subjectId);
    },
    async resolveSessionForCsrfBootstrap(rawRefreshToken) {
      const tokenHash = sha256Hex(rawRefreshToken);
      const row = await repository.findByRefreshTokenHash(tokenHash);
      if (!row || row.revokedAt) return null;
      const now = Date.now();
      if (row.expiresAt.getTime() < now || row.absoluteExpiresAt.getTime() < now) return null;
      return row.id;
    }
  };
}

// src/modules/auth/session.repository.ts
import { and as and2, eq as eq4, isNull, ne } from "drizzle-orm";
function toSessionRow(row) {
  return {
    id: row.id,
    subjectId: row.subjectId,
    subjectType: row.subjectType,
    refreshTokenHash: row.refreshTokenHash,
    familyId: row.familyId,
    expiresAt: row.expiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    revokedAt: row.revokedAt
  };
}
function createSessionRepository(db2) {
  return {
    async create(input) {
      const id = newId();
      await db2.insert(sessions).values({
        id,
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        refreshTokenHash: input.refreshTokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
        userAgent: input.userAgent ?? null,
        ipHash: input.ipHash ?? null
      });
      return {
        id,
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        refreshTokenHash: input.refreshTokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
        revokedAt: null
      };
    },
    async findByRefreshTokenHash(hash) {
      const [row] = await db2.select().from(sessions).where(eq4(sessions.refreshTokenHash, hash)).limit(1);
      return row ? toSessionRow(row) : null;
    },
    async revoke(sessionId) {
      await db2.update(sessions).set({ revokedAt: /* @__PURE__ */ new Date() }).where(eq4(sessions.id, sessionId));
    },
    async revokeFamily(familyId) {
      await db2.update(sessions).set({ revokedAt: /* @__PURE__ */ new Date() }).where(and2(eq4(sessions.familyId, familyId), isNull(sessions.revokedAt)));
    },
    async revokeAllForSubject(subjectType, subjectId) {
      await db2.update(sessions).set({ revokedAt: /* @__PURE__ */ new Date() }).where(
        and2(
          eq4(sessions.subjectType, subjectType),
          eq4(sessions.subjectId, subjectId),
          isNull(sessions.revokedAt)
        )
      );
    },
    async revokeAllForSubjectExcept(subjectType, subjectId, exceptSessionId) {
      await db2.update(sessions).set({ revokedAt: /* @__PURE__ */ new Date() }).where(
        and2(
          eq4(sessions.subjectType, subjectType),
          eq4(sessions.subjectId, subjectId),
          isNull(sessions.revokedAt),
          ne(sessions.id, exceptSessionId)
        )
      );
    },
    async revokeAll() {
      await db2.update(sessions).set({ revokedAt: /* @__PURE__ */ new Date() }).where(isNull(sessions.revokedAt));
    },
    async isSubjectActive(subjectType, subjectId) {
      if (subjectType === "staff") {
        const [row2] = await db2.select({ status: users.status }).from(users).where(eq4(users.id, subjectId)).limit(1);
        return row2?.status === "active";
      }
      const [row] = await db2.select({ status: readers.status }).from(readers).where(eq4(readers.id, subjectId)).limit(1);
      return row?.status === "active";
    },
    async findReaderAccount(subjectId) {
      const [row] = await db2.select({
        id: readers.id,
        email: readers.email,
        name: readers.name,
        avatarUrl: readers.avatarUrl,
        status: readers.status,
        createdAt: readers.createdAt
      }).from(readers).where(eq4(readers.id, subjectId)).limit(1);
      return row ?? null;
    }
  };
}

// src/modules/auth/auth.mapper.ts
function toReaderAccountResponse(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    status: row.status,
    createdAt: row.createdAt.toISOString()
  };
}

// src/lib/cookies.ts
var ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1e3;
var REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1e3;
function requiresSecureCookies(env) {
  return !env.APP_ORIGIN.startsWith("http://");
}
function sharedOptions(env) {
  return {
    secure: requiresSecureCookies(env),
    domain: env.COOKIE_DOMAIN,
    sameSite: "lax",
    // survives the OAuth redirect back from Google (docs/ARCHITECTURE.md §5.3)
    path: "/"
  };
}
function setSessionCookies(res, tokens, env) {
  const shared = sharedOptions(env);
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, { ...shared, httpOnly: true, maxAge: ACCESS_TOKEN_MAX_AGE_MS });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, { ...shared, httpOnly: true, maxAge: REFRESH_TOKEN_MAX_AGE_MS });
}
function clearSessionCookies(res, env) {
  const shared = sharedOptions(env);
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...shared, httpOnly: true });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...shared, httpOnly: true });
}

// src/lib/sessionMeta.ts
function sessionMetaFromRequest(req, env) {
  return {
    userAgent: req.get("user-agent") ?? void 0,
    ipHash: req.ip ? hmacSha256Hex(req.ip, env.SESSION_SECRET) : void 0
  };
}

// src/modules/auth/auth.controller.ts
function createAuthController(service, env) {
  return {
    async refresh(req, res, next) {
      try {
        const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
        if (typeof raw !== "string" || raw.length === 0) {
          throw new AppError("No refresh credential presented", 401, "invalid_refresh_token");
        }
        const issued = await service.refresh(raw, sessionMetaFromRequest(req, env));
        setSessionCookies(res, issued, env);
        setCsrfCookie(res, issued.csrfToken, { ...sharedOptions(env), maxAge: REFRESH_TOKEN_MAX_AGE_MS });
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
    async logout(req, res, next) {
      try {
        const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
        await service.logout(typeof raw === "string" ? raw : void 0, req.auth?.sessionId);
        clearSessionCookies(res, env);
        clearCsrfCookie(res, sharedOptions(env));
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
    async me(req, res, next) {
      try {
        const subjectId = req.auth?.subjectId;
        if (!subjectId) throw new AppError("Not authenticated", 401, "unauthenticated");
        const account = await service.getReaderAccount(subjectId);
        if (!account) throw new AppError("Reader not found", 404, "not_found");
        res.json({ success: true, data: toReaderAccountResponse(account) });
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/lib/password.ts
import { randomBytes as randomBytes3 } from "node:crypto";
import argon2 from "argon2";
var ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  // KiB
  timeCost: 2,
  parallelism: 1
};
function hashPassword(plaintext) {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}
function verifyPassword(plaintext, hash) {
  return argon2.verify(hash, plaintext);
}
var TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
var TEMP_PASSWORD_LENGTH = 24;
function generateTemporaryPassword() {
  const bytes = randomBytes3(TEMP_PASSWORD_LENGTH);
  let result = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
    result += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  }
  return result;
}
var dummyHashPromise;
function getDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(randomBytes3(32).toString("hex"));
  }
  return dummyHashPromise;
}

// src/modules/auth/staffLogin.service.ts
function genericFailure() {
  return new AppError("Invalid email or password", 401, "invalid_credentials");
}
function createStaffLoginService(repository) {
  return {
    async login(email, password) {
      const staff = await repository.findByEmail(email);
      const hashToVerify = staff?.passwordHash ?? await getDummyHash();
      const passwordMatches = await verifyPassword(password, hashToVerify);
      const eligible = staff?.status === "active";
      if (!eligible || !passwordMatches || !staff) {
        throw genericFailure();
      }
      return { subjectId: staff.id };
    }
  };
}

// src/modules/staff/staff.repository.ts
import { asc, eq as eq5 } from "drizzle-orm";

// src/lib/dbErrors.ts
var ER_DUP_ENTRY = 1062;
var ER_NO_REFERENCED_ROW_2 = 1452;
var ER_ROW_IS_REFERENCED_2 = 1451;
function asMySqlError(err) {
  return typeof err === "object" && err !== null ? err : {};
}
function isUniqueViolation(err) {
  return asMySqlError(err).errno === ER_DUP_ENTRY;
}
function isForeignKeyViolation(err) {
  const errno = asMySqlError(err).errno;
  return errno === ER_NO_REFERENCED_ROW_2 || errno === ER_ROW_IS_REFERENCED_2;
}
var UNIQUE_KEY_NAME_PATTERN = /for key '(?:[^.']+\.)?([^']+)'/;
var FOREIGN_KEY_NAME_PATTERN = /CONSTRAINT `([^`]+)`/;
function violatedConstraint(err) {
  const message = asMySqlError(err).sqlMessage;
  if (message === void 0) return void 0;
  return UNIQUE_KEY_NAME_PATTERN.exec(message)?.[1] ?? FOREIGN_KEY_NAME_PATTERN.exec(message)?.[1];
}
function isUniqueViolationOn(err, constraintFragment) {
  const constraint = violatedConstraint(err);
  return isUniqueViolation(err) && constraint !== void 0 && constraint.includes(constraintFragment);
}

// src/modules/staff/staff.repository.ts
var SELECT_COLUMNS = {
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  mustChangePassword: users.mustChangePassword,
  name: users.name,
  roleId: users.roleId,
  roleName: roles.name,
  status: users.status,
  createdAt: users.createdAt
};
async function insertOrTranslateDuplicate(insert) {
  try {
    return await insert();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("An account with this email already exists", 409, "email_exists");
    }
    throw err;
  }
}
function createStaffRepository(db2) {
  const baseQuery = () => db2.select(SELECT_COLUMNS).from(users).innerJoin(roles, eq5(users.roleId, roles.id));
  const findById = async (id) => {
    const [row] = await baseQuery().where(eq5(users.id, id)).limit(1);
    return row ?? null;
  };
  return {
    async findByEmail(email) {
      const [row] = await baseQuery().where(eq5(users.email, email)).limit(1);
      return row ?? null;
    },
    findById,
    async list() {
      return baseQuery().orderBy(asc(users.name));
    },
    async create(input) {
      const id = newId();
      await insertOrTranslateDuplicate(
        () => db2.insert(users).values({ id, email: input.email, name: input.name, roleId: input.roleId, passwordHash: input.passwordHash })
      );
      const created = await findById(id);
      if (!created) throw new Error("staff row missing immediately after insert");
      return created;
    },
    async setPassword(id, passwordHash) {
      await db2.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(users.id, id));
    },
    async resetPassword(id, passwordHash) {
      await db2.update(users).set({ passwordHash, mustChangePassword: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(users.id, id));
    },
    async clearPasswordChangeFlag(id) {
      await db2.update(users).set({ mustChangePassword: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(users.id, id));
    },
    async setStatus(id, status) {
      await db2.update(users).set({ status, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(users.id, id));
    },
    async setRole(id, roleId) {
      await db2.update(users).set({ roleId, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(users.id, id));
    }
  };
}

// src/middleware/rateLimit.ts
var FAILURE_STATUS_FLOOR = 400;
var buckets = /* @__PURE__ */ new Map();
var MAX_TRACKED_BUCKETS = 5e4;
function sweepExpired(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
function currentBucket(key, now, windowMs) {
  const existing = buckets.get(key);
  if (existing && existing.resetAt > now) return existing;
  const fresh = { count: 0, resetAt: now + windowMs };
  buckets.set(key, fresh);
  return fresh;
}
function rateLimit(options) {
  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    if (buckets.size > MAX_TRACKED_BUCKETS) sweepExpired(now);
    const key = `${options.name}:${options.keyGenerator(req)}`;
    const bucket = currentBucket(key, now, options.windowMs);
    bucket.count += 1;
    if (bucket.count > options.max) {
      options.onLimited(req, res, next);
      return;
    }
    if (options.failuresOnly) {
      res.on("finish", () => {
        if (res.statusCode >= FAILURE_STATUS_FLOOR) return;
        if (buckets.get(key) === bucket) bucket.count -= 1;
      });
    }
    next();
  };
}
function respondWithTooManyRequests(_req, _res, next) {
  next(new AppError("Too many requests", 429, "rate_limited"));
}
function clientIp(req) {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}
var PUBLIC_READ_RATE_LIMIT = { windowMs: 60 * 1e3, max: 120 };
function publicReadRateLimiter(name) {
  return rateLimit({
    name,
    ...PUBLIC_READ_RATE_LIMIT,
    keyGenerator: clientIp,
    onLimited: (_req, res) => {
      res.status(429).json({ success: false, error: { code: "rate_limited", message: "Too many requests" } });
    }
  });
}
var HOUR_MS = 60 * 60 * 1e3;
var ENGAGEMENT_RATE_LIMITS = {
  view: { name: "engagement-view", windowMs: HOUR_MS, max: 60 },
  like: { name: "engagement-like", windowMs: HOUR_MS, max: 60 },
  comment: { name: "engagement-comment", windowMs: HOUR_MS, max: 10 },
  // Not one of the four §9.3 originally listed (comments, likes, views, login, contact) — added
  // by `add-community-moderation` alongside the report feature itself, in its own namespace
  // rather than reused, for the same reason every entry above already has one (design.md -
  // Decision 8, `openspec/changes/add-community-moderation`).
  report: { name: "engagement-report", windowMs: HOUR_MS, max: 20 },
  // The fifth §9.3 budget, previously unimplemented — the contact form had no backend endpoint
  // until `add-contact-us-feature`. 3/hour, per docs/ARCHITECTURE.md §9.3.
  contact: { name: "engagement-contact", windowMs: HOUR_MS, max: 3 }
};
function readerKey(req) {
  return req.auth?.subjectId ?? clientIp(req);
}
function engagementLimiter(config, keyGenerator) {
  return rateLimit({
    ...config,
    keyGenerator,
    onLimited: (_req, res) => {
      res.status(429).json({ success: false, error: { code: "rate_limited", message: "Too many requests" } });
    }
  });
}
function viewRateLimiter() {
  return engagementLimiter(ENGAGEMENT_RATE_LIMITS.view, clientIp);
}
function likeRateLimiter() {
  return engagementLimiter(ENGAGEMENT_RATE_LIMITS.like, readerKey);
}
function commentRateLimiter() {
  return engagementLimiter(ENGAGEMENT_RATE_LIMITS.comment, readerKey);
}
function reportRateLimiter() {
  return engagementLimiter(ENGAGEMENT_RATE_LIMITS.report, readerKey);
}
function contactRateLimiter() {
  return engagementLimiter(ENGAGEMENT_RATE_LIMITS.contact, clientIp);
}

// src/modules/auth/auth.routes.ts
var REFRESH_RATE_LIMIT = { windowMs: 15 * 60 * 1e3, max: 30 };
var CSRF_BOOTSTRAP_RATE_LIMIT = { windowMs: 15 * 60 * 1e3, max: 30 };
var STAFF_LOGIN_PER_ACCOUNT_LIMIT = { windowMs: 15 * 60 * 1e3, max: 5 };
var STAFF_LOGIN_PER_SOURCE_LIMIT = { windowMs: 15 * 60 * 1e3, max: 30 };
function respondWithGenericFailure(_req, _res, next) {
  next(new AppError("Invalid email or password", 401, "invalid_credentials"));
}
function respondWithRefreshFailure(_req, _res, next) {
  next(new AppError("Invalid refresh token", 401, "invalid_refresh_token"));
}
function loginAccountKey(req) {
  return `${clientIp(req)}:${String(req.body?.email).toLowerCase()}`;
}
function staffLoginRateLimiters() {
  return [
    rateLimit({
      name: "staff-login-per-source",
      ...STAFF_LOGIN_PER_SOURCE_LIMIT,
      keyGenerator: clientIp,
      onLimited: respondWithGenericFailure,
      failuresOnly: true
    }),
    rateLimit({
      name: "staff-login-per-account",
      ...STAFF_LOGIN_PER_ACCOUNT_LIMIT,
      keyGenerator: loginAccountKey,
      onLimited: respondWithGenericFailure,
      failuresOnly: true
    })
  ];
}
function refreshRateLimiter() {
  return rateLimit({
    name: "auth-refresh",
    ...REFRESH_RATE_LIMIT,
    keyGenerator: clientIp,
    onLimited: respondWithRefreshFailure
  });
}
function respondWithCsrfBootstrapNoop(_req, res, _next) {
  res.status(204).end();
}
function csrfBootstrapKey(req) {
  const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (typeof raw === "string" && raw.length > 0) return `rt:${sha256Hex(raw)}`;
  return `ip:${clientIp(req)}`;
}
function csrfBootstrapRateLimiter() {
  return rateLimit({
    name: "auth-csrf-bootstrap",
    ...CSRF_BOOTSTRAP_RATE_LIMIT,
    keyGenerator: csrfBootstrapKey,
    onLimited: respondWithCsrfBootstrapNoop
  });
}
function authRoutes(db2, env) {
  const router = Router3();
  const repository = createSessionRepository(db2);
  const service = createAuthService(repository, env);
  const controller = createAuthController(service, env);
  const staffLoginService = createStaffLoginService(createStaffRepository(db2));
  router.post(
    "/refresh",
    requirePublic(),
    refreshRateLimiter(),
    controller.refresh
  );
  router.post("/logout", requirePublic(), controller.logout);
  router.get("/me", requireReader(), controller.me);
  router.get(
    "/csrf",
    requirePublic(),
    csrfBootstrapRateLimiter(),
    async (req, res, next) => {
      try {
        let sessionId = null;
        if (req.auth) {
          sessionId = req.auth.sessionId;
        } else {
          const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
          if (typeof raw === "string" && raw.length > 0) {
            sessionId = await service.resolveSessionForCsrfBootstrap(raw);
          }
        }
        if (sessionId) {
          const csrfToken = issueCsrfToken(env, sessionId);
          setCsrfCookie(res, csrfToken, { ...sharedOptions(env), maxAge: REFRESH_TOKEN_MAX_AGE_MS });
        }
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );
  router.post(
    "/sessions/revoke-all",
    requirePermission("settings.manage"),
    async (_req, res, next) => {
      try {
        await service.revokeAll();
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );
  router.post(
    "/staff/login",
    requirePublic(),
    ...staffLoginRateLimiters(),
    async (req, res, next) => {
      try {
        const body = staffSignInRequestSchema.parse(req.body);
        const { subjectId } = await staffLoginService.login(body.email, body.password);
        const issued = await service.startSession(subjectId, "staff", sessionMetaFromRequest(req, env));
        setSessionCookies(res, issued, env);
        setCsrfCookie(res, issued.csrfToken, { ...sharedOptions(env), maxAge: REFRESH_TOKEN_MAX_AGE_MS });
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );
  return router;
}

// src/modules/auth/google.routes.ts
import { Router as Router4 } from "express";

// src/lib/google.ts
import { createHash as createHash2, randomBytes as randomBytes4 } from "node:crypto";
import { createRemoteJWKSet, jwtVerify as jwtVerify2 } from "jose";
var AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
var TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
var GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
function base64url(bytes) {
  return bytes.toString("base64url");
}
function createAuthorizationRequest(env) {
  const state = base64url(randomBytes4(32));
  const nonce = base64url(randomBytes4(32));
  const codeVerifier = base64url(randomBytes4(32));
  const codeChallenge = base64url(createHash2("sha256").update(codeVerifier).digest());
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), state, codeVerifier, nonce };
}
async function exchangeAuthorizationCode(env, code, codeVerifier) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier
  });
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) {
    throw new AppError("Google authorization code exchange failed", 400, "invalid_oauth_callback");
  }
  return await response.json();
}
async function verifyGoogleIdToken(idToken, env, expectedNonce, jwks = GOOGLE_JWKS) {
  const { payload } = await jwtVerify2(idToken, jwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.GOOGLE_CLIENT_ID
  });
  if (payload.nonce !== expectedNonce) {
    throw new AppError("Google ID token nonce mismatch", 400, "invalid_oauth_callback");
  }
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new AppError("Malformed Google ID token", 400, "invalid_oauth_callback");
  }
  const avatarUrl = typeof payload.picture === "string" ? payload.picture : void 0;
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : payload.email,
    ...avatarUrl ? { avatarUrl } : {}
  };
}
function assertVerifiedIdentity(identity) {
  if (!identity.emailVerified) {
    throw new AppError("Google account email is not verified", 403, "email_not_verified");
  }
}

// src/lib/oauthState.ts
var OAUTH_STATE_COOKIE = "oauth_state";
var OAUTH_STATE_TTL_MS = 10 * 60 * 1e3;
function encodeOAuthState(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}
function decodeOAuthState(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed === "object" && parsed !== null && typeof parsed.state === "string" && typeof parsed.codeVerifier === "string" && typeof parsed.nonce === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// src/lib/redirect.ts
var DEFAULT_PATH = "/";
function resolveRedirectTarget(requested, env) {
  const defaultTarget = `${env.APP_ORIGIN}${DEFAULT_PATH}`;
  if (!requested) return defaultTarget;
  let url;
  try {
    url = new URL(requested, env.APP_ORIGIN);
  } catch {
    return defaultTarget;
  }
  const allowedOrigins = /* @__PURE__ */ new Set([env.APP_ORIGIN, env.ADMIN_ORIGIN]);
  if (!allowedOrigins.has(url.origin)) return defaultTarget;
  return url.toString();
}

// src/modules/auth/reader.repository.ts
import { eq as eq6 } from "drizzle-orm";
function createReaderRepository(db2) {
  return {
    async upsertByGoogleSub(input) {
      await db2.insert(readers).values({
        id: newId(),
        googleSub: input.googleSub,
        email: input.email,
        emailVerified: input.emailVerified,
        name: input.name,
        avatarUrl: input.avatarUrl ?? null,
        lastLoginAt: /* @__PURE__ */ new Date()
      }).onDuplicateKeyUpdate({
        set: {
          email: input.email,
          emailVerified: input.emailVerified,
          name: input.name,
          avatarUrl: input.avatarUrl ?? null,
          lastLoginAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        }
      });
      const [row] = await db2.select({ id: readers.id, googleSub: readers.googleSub, status: readers.status }).from(readers).where(eq6(readers.googleSub, input.googleSub)).limit(1);
      if (!row) throw new Error("reader missing immediately after upsert");
      return row;
    }
  };
}

// src/modules/auth/google.routes.ts
var CALLBACK_RATE_LIMIT = { windowMs: 15 * 60 * 1e3, max: 20 };
function respondWithCallbackFailure(_req, _res, next) {
  next(new AppError("Missing or expired sign-in state", 400, "invalid_oauth_state"));
}
function googleCallbackRateLimiter() {
  return rateLimit({
    name: "google-callback",
    ...CALLBACK_RATE_LIMIT,
    keyGenerator: clientIp,
    onLimited: respondWithCallbackFailure
  });
}
function googleAuthRoutes(db2, env) {
  const router = Router4();
  const readerRepository = createReaderRepository(db2);
  const authService = createAuthService(createSessionRepository(db2), env);
  router.get("/google", requirePublic(), (req, res) => {
    const request = createAuthorizationRequest(env);
    const next = typeof req.query.next === "string" ? req.query.next : void 0;
    const cookieValue = encodeOAuthState({
      state: request.state,
      codeVerifier: request.codeVerifier,
      nonce: request.nonce,
      next
    });
    res.cookie(OAUTH_STATE_COOKIE, cookieValue, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      // survives the redirect back from Google
      maxAge: OAUTH_STATE_TTL_MS,
      path: "/"
    });
    res.redirect(request.url);
  });
  router.get(
    "/google/callback",
    requirePublic(),
    googleCallbackRateLimiter(),
    async (req, res, next) => {
      try {
        const cookieValue = req.cookies?.[OAUTH_STATE_COOKIE];
        res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
        const bound = typeof cookieValue === "string" ? decodeOAuthState(cookieValue) : null;
        if (!bound) {
          throw new AppError("Missing or expired sign-in state", 400, "invalid_oauth_state");
        }
        const returnedState = typeof req.query.state === "string" ? req.query.state : void 0;
        if (!returnedState || returnedState !== bound.state) {
          throw new AppError("Sign-in state does not match", 400, "invalid_oauth_state");
        }
        const code = typeof req.query.code === "string" ? req.query.code : void 0;
        if (!code) {
          throw new AppError("Missing authorization code", 400, "invalid_oauth_callback");
        }
        const googleTokens = await exchangeAuthorizationCode(env, code, bound.codeVerifier);
        const identity = await verifyGoogleIdToken(googleTokens.id_token, env, bound.nonce);
        assertVerifiedIdentity(identity);
        const reader = await readerRepository.upsertByGoogleSub({
          googleSub: identity.sub,
          email: identity.email,
          emailVerified: identity.emailVerified,
          name: identity.name,
          avatarUrl: identity.avatarUrl
        });
        const issued = await authService.startSession(reader.id, "reader", sessionMetaFromRequest(req, env));
        setSessionCookies(res, issued, env);
        setCsrfCookie(res, issued.csrfToken, { ...sharedOptions(env), maxAge: REFRESH_TOKEN_MAX_AGE_MS });
        res.redirect(resolveRedirectTarget(bound.next, env));
      } catch (err) {
        next(err);
      }
    }
  );
  return router;
}

// src/modules/staff/staff.routes.ts
import { Router as Router5 } from "express";

// src/modules/staff/staff.service.ts
function createStaffService(db2, staffRepository, revokeSessions, revokeSessionsExcept) {
  async function assertMayActOnOwner(targetRoleId, caller, action) {
    if (targetRoleId !== await getOwnerRoleId(db2)) return;
    if (caller.isOwner) return;
    throw new AppError(`Only an Owner may ${action} an Owner account`, 403, "forbidden");
  }
  return {
    list() {
      return staffRepository.list();
    },
    async create(input, caller) {
      const existing = await staffRepository.findByEmail(input.email);
      if (existing) {
        throw new AppError("An account with this email already exists", 409, "email_exists");
      }
      if (input.roleId === await getOwnerRoleId(db2) && !caller.isOwner) {
        throw new AppError("Only an Owner may grant the Owner role", 403, "forbidden");
      }
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const account = await staffRepository.create({ ...input, passwordHash });
      return { account, temporaryPassword };
    },
    async disable(targetId, caller) {
      if (targetId === caller.subjectId) {
        throw new AppError("You cannot disable your own account", 400, "self_disable_forbidden");
      }
      const target = await staffRepository.findById(targetId);
      if (!target) {
        throw new AppError("Staff member not found", 404, "not_found");
      }
      await assertMayActOnOwner(target.roleId, caller, "disable");
      await staffRepository.setStatus(targetId, "disabled");
      await revokeSessions("staff", targetId);
    },
    async triggerReset(targetId, caller) {
      const staff = await staffRepository.findById(targetId);
      if (!staff) {
        throw new AppError("Staff member not found", 404, "not_found");
      }
      await assertMayActOnOwner(staff.roleId, caller, "reset");
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      await staffRepository.resetPassword(targetId, passwordHash);
      await revokeSessions("staff", targetId);
      return { temporaryPassword };
    },
    async changePassword(subjectId, sessionId, currentPassword, newPassword) {
      const staff = await staffRepository.findById(subjectId);
      if (!staff) {
        throw new AppError("Staff member not found", 404, "not_found");
      }
      const currentMatches = await verifyPassword(currentPassword, staff.passwordHash);
      if (!currentMatches) {
        throw new AppError("Current password is incorrect", 401, "invalid_credentials");
      }
      const passwordHash = await hashPassword(newPassword);
      await staffRepository.setPassword(subjectId, passwordHash);
      await revokeSessionsExcept("staff", subjectId, sessionId);
    }
  };
}

// src/modules/staff/staff.mapper.ts
function toStaffAccountResponse(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roleId: row.roleId,
    roleName: row.roleName,
    status: row.status,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString()
  };
}
function toStaffCreateResponse(row, temporaryPassword) {
  return { ...toStaffAccountResponse(row), temporaryPassword };
}
function toStaffResetResponse(temporaryPassword) {
  return { temporaryPassword };
}

// src/lib/requireParam.ts
var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requireParam(req, name) {
  const value = req.params[name];
  if (!value) throw new AppError(`Missing path parameter: ${name}`, 400, "bad_request");
  return value;
}
function requireUuidParam(req, name) {
  const value = requireParam(req, name);
  if (!UUID_PATTERN.test(value)) {
    throw new AppError(`Path parameter '${name}' must be a valid id`, 400, "invalid_id");
  }
  return value;
}

// src/modules/staff/staff.controller.ts
function requireCaller(req) {
  const subjectId = req.auth?.subjectId;
  if (!subjectId) throw new AppError("Not authenticated", 401, "unauthenticated");
  return { subjectId, isOwner: req.staffRole?.isOwner ?? false };
}
function requireSession(req) {
  if (!req.auth?.subjectId || !req.auth.sessionId) throw new AppError("Not authenticated", 401, "unauthenticated");
  return { subjectId: req.auth.subjectId, sessionId: req.auth.sessionId };
}
function createStaffController(service) {
  return {
    async list(_req, res, next) {
      try {
        const rows = await service.list();
        res.json({ success: true, data: rows.map(toStaffAccountResponse) });
      } catch (err) {
        next(err);
      }
    },
    async create(req, res, next) {
      try {
        const body = staffCreateRequestSchema.parse(req.body);
        const caller = requireCaller(req);
        const { account, temporaryPassword } = await service.create(body, caller);
        res.status(201).json({ success: true, data: toStaffCreateResponse(account, temporaryPassword) });
      } catch (err) {
        next(err);
      }
    },
    async disable(req, res, next) {
      try {
        const caller = requireCaller(req);
        const targetId = requireUuidParam(req, "id");
        await service.disable(targetId, caller);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
    async triggerReset(req, res, next) {
      try {
        const caller = requireCaller(req);
        const targetId = requireUuidParam(req, "id");
        const { temporaryPassword } = await service.triggerReset(targetId, caller);
        res.status(200).json({ success: true, data: toStaffResetResponse(temporaryPassword) });
      } catch (err) {
        next(err);
      }
    },
    async changePassword(req, res, next) {
      try {
        const body = staffPasswordChangeRequestSchema.parse(req.body);
        const { subjectId, sessionId } = requireSession(req);
        await service.changePassword(subjectId, sessionId, body.currentPassword, body.newPassword);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/staff/staff.routes.ts
var PASSWORD_CHANGE_RATE_LIMIT = { windowMs: 15 * 60 * 1e3, max: 10 };
function callerSubjectKey(req) {
  return req.auth?.subjectId ?? "anonymous";
}
function respondWithPasswordChangeFailure(_req, _res, next) {
  next(new AppError("Current password is incorrect", 401, "invalid_credentials"));
}
function passwordChangeRateLimiter() {
  return rateLimit({
    name: "staff-password-change",
    ...PASSWORD_CHANGE_RATE_LIMIT,
    keyGenerator: callerSubjectKey,
    onLimited: respondWithPasswordChangeFailure,
    failuresOnly: true
  });
}
function staffRoutes(db2, env) {
  const router = Router5();
  const staffRepository = createStaffRepository(db2);
  const authService = createAuthService(createSessionRepository(db2), env);
  const service = createStaffService(
    db2,
    staffRepository,
    (subjectType, subjectId) => authService.revokeAllForSubject(subjectType, subjectId),
    (subjectType, subjectId, exceptSessionId) => authService.revokeAllForSubjectExcept(subjectType, subjectId, exceptSessionId)
  );
  const controller = createStaffController(service);
  router.get("/", requireAnyPermission("user.manage", "role.manage"), controller.list);
  router.post("/", requirePermission("user.manage"), controller.create);
  router.post("/:id/disable", requirePermission("user.manage"), controller.disable);
  router.post("/:id/reset", requirePermission("user.manage"), controller.triggerReset);
  router.post(
    "/me/password",
    requireStaff({ allowPendingPasswordChange: true }),
    passwordChangeRateLimiter(),
    controller.changePassword
  );
  return router;
}

// src/modules/roles/role.routes.ts
import { Router as Router6 } from "express";

// src/modules/roles/role.repository.ts
import { count, eq as eq7, inArray } from "drizzle-orm";
function createRoleRepository(db2) {
  async function loadPermissionKeys(roleId) {
    const rows = await db2.select({ key: permissions.key }).from(rolePermissions).innerJoin(permissions, eq7(rolePermissions.permissionId, permissions.id)).where(eq7(rolePermissions.roleId, roleId));
    return rows.map((r) => r.key);
  }
  async function replacePermissions(roleId, permissionKeys, tx) {
    await tx.delete(rolePermissions).where(eq7(rolePermissions.roleId, roleId));
    if (permissionKeys.length === 0) return;
    const matched = await tx.select({ id: permissions.id }).from(permissions).where(inArray(permissions.key, permissionKeys));
    if (matched.length > 0) {
      await tx.insert(rolePermissions).values(matched.map((p) => ({ roleId, permissionId: p.id })));
    }
  }
  const findById = async (id) => {
    const [row] = await db2.select().from(roles).where(eq7(roles.id, id)).limit(1);
    if (!row) return null;
    return { ...row, permissions: await loadPermissionKeys(id) };
  };
  return {
    async findByName(name) {
      const [row] = await db2.select().from(roles).where(eq7(roles.name, name)).limit(1);
      return row ?? null;
    },
    async findBySlug(slug) {
      const [row] = await db2.select().from(roles).where(eq7(roles.slug, slug)).limit(1);
      return row ?? null;
    },
    findById,
    async listWithHolderCounts() {
      return db2.select({
        id: roles.id,
        name: roles.name,
        slug: roles.slug,
        isSystem: roles.isSystem,
        holderCount: count(users.id)
      }).from(roles).leftJoin(users, eq7(users.roleId, roles.id)).groupBy(roles.id);
    },
    async listCatalogPermissions() {
      return db2.select({ key: permissions.key, description: permissions.description }).from(permissions);
    },
    async create(input) {
      return db2.transaction(async (tx) => {
        const id = newId();
        await tx.insert(roles).values({ id, name: input.name, slug: input.slug });
        const [row] = await tx.select().from(roles).where(eq7(roles.id, id)).limit(1);
        if (!row) throw new Error("role missing immediately after insert");
        await replacePermissions(row.id, input.permissionKeys, tx);
        return { ...row, permissions: input.permissionKeys };
      });
    },
    async update(id, input) {
      await db2.transaction(async (tx) => {
        if (input.name !== void 0) {
          await tx.update(roles).set({ name: input.name, ...input.slug !== void 0 && { slug: input.slug }, updatedAt: /* @__PURE__ */ new Date() }).where(eq7(roles.id, id));
        }
        if (input.permissionKeys !== void 0) {
          await replacePermissions(id, input.permissionKeys, tx);
        }
      });
      const updated = await findById(id);
      if (!updated) throw new Error("role missing immediately after update");
      return updated;
    },
    async delete(id) {
      await db2.delete(roles).where(eq7(roles.id, id));
    },
    async countStaffWithRole(id) {
      const [row] = await db2.select({ value: count() }).from(users).where(eq7(users.roleId, id));
      return row?.value ?? 0;
    },
    async findAssignedRoleId(staffId) {
      const [row] = await db2.select({ roleId: users.roleId }).from(users).where(eq7(users.id, staffId)).limit(1);
      return row?.roleId ?? null;
    },
    async assignRole(staffId, roleId) {
      const [result] = await db2.update(users).set({ roleId, updatedAt: /* @__PURE__ */ new Date() }).where(eq7(users.id, staffId));
      return result.affectedRows > 0;
    }
  };
}

// src/modules/roles/role.service.ts
var RESERVED_OWNER_SLUG = "owner";
function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function reservedIdentityError() {
  return new AppError("This role name is reserved for the Owner role", 409, "reserved_role_identity");
}
function duplicateNameError() {
  return new AppError("A role with this name already exists", 409, "role_name_exists");
}
function createRoleService(db2, repository) {
  async function assertUsableName(name, excludeRoleId) {
    const slug = slugify(name);
    if (!slug) {
      throw new AppError("Role name must contain at least one letter or number", 400, "invalid_role_name");
    }
    if (slug === RESERVED_OWNER_SLUG) {
      throw reservedIdentityError();
    }
    const existing = await repository.findByName(name);
    if (existing && existing.id !== excludeRoleId) {
      throw duplicateNameError();
    }
    return slug;
  }
  return {
    list() {
      return repository.listWithHolderCounts();
    },
    async findDetail(id) {
      const [role, holderCount] = await Promise.all([repository.findById(id), repository.countStaffWithRole(id)]);
      if (!role) {
        throw new AppError("Role not found", 404, "not_found");
      }
      return { ...role, holderCount };
    },
    listPermissionCatalog() {
      return repository.listCatalogPermissions();
    },
    async create(input) {
      const slug = await assertUsableName(input.name);
      if (await repository.findBySlug(slug)) {
        throw duplicateNameError();
      }
      return repository.create({ name: input.name, slug, permissionKeys: input.permissions });
    },
    async update(id, input) {
      const role = await repository.findById(id);
      if (!role) {
        throw new AppError("Role not found", 404, "not_found");
      }
      let slug;
      if (input.name !== void 0) {
        slug = await assertUsableName(input.name, id);
        const slugHolder = await repository.findBySlug(slug);
        if (slugHolder && slugHolder.id !== id) {
          throw duplicateNameError();
        }
      }
      if (role.isSystem && input.permissions !== void 0 && !input.permissions.includes("role.manage")) {
        throw new AppError("Cannot remove role management from the Owner role", 403, "owner_role_protected");
      }
      return repository.update(id, { name: input.name, slug, permissionKeys: input.permissions });
    },
    async delete(id) {
      const role = await repository.findById(id);
      if (!role) {
        throw new AppError("Role not found", 404, "not_found");
      }
      if (role.isSystem) {
        throw new AppError("The Owner role cannot be deleted", 403, "owner_role_protected");
      }
      const staffCount = await repository.countStaffWithRole(id);
      if (staffCount > 0) {
        throw new AppError("Role is still assigned to staff members", 409, "role_in_use");
      }
      await repository.delete(id);
    },
    async assign(targetStaffId, roleId, caller) {
      if (targetStaffId === caller.subjectId) {
        throw new AppError("You cannot change the role assigned to your own account", 400, "self_reassignment_forbidden");
      }
      const currentRoleId = await repository.findAssignedRoleId(targetStaffId);
      if (currentRoleId === null) {
        throw new AppError("Staff member not found", 404, "not_found");
      }
      const ownerRoleId = await getOwnerRoleId(db2);
      if (roleId === ownerRoleId && !caller.isOwner) {
        throw new AppError("Only an Owner may assign the Owner role", 403, "forbidden");
      }
      if (currentRoleId === ownerRoleId && !caller.isOwner) {
        throw new AppError("Only an Owner may change the role assigned to an Owner", 403, "forbidden");
      }
      const assigned = await repository.assignRole(targetStaffId, roleId);
      if (!assigned) {
        throw new AppError("Staff member not found", 404, "not_found");
      }
    }
  };
}

// src/modules/roles/role.mapper.ts
function toRoleResponse(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isSystem: row.isSystem,
    permissions: row.permissions
  };
}
function toRoleSummaryResponse(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isSystem: row.isSystem,
    holderCount: row.holderCount
  };
}
function toRoleDetailResponse(row) {
  return { ...toRoleResponse(row), holderCount: row.holderCount };
}

// src/modules/roles/role.controller.ts
function requireCaller2(req) {
  const subjectId = req.auth?.subjectId;
  if (!subjectId) throw new AppError("Not authenticated", 401, "unauthenticated");
  return { subjectId, isOwner: req.staffRole?.isOwner ?? false };
}
function createRoleController(service) {
  return {
    async list(_req, res, next) {
      try {
        const roles2 = await service.list();
        res.json({ success: true, data: roles2.map(toRoleSummaryResponse) });
      } catch (err) {
        next(err);
      }
    },
    async detail(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const role = await service.findDetail(id);
        res.json({ success: true, data: toRoleDetailResponse(role) });
      } catch (err) {
        next(err);
      }
    },
    async listPermissionCatalog(_req, res, next) {
      try {
        const catalog = await service.listPermissionCatalog();
        res.json({ success: true, data: catalog });
      } catch (err) {
        next(err);
      }
    },
    async create(req, res, next) {
      try {
        const body = roleCreateRequestSchema.parse(req.body);
        const role = await service.create(body);
        res.status(201).json({ success: true, data: toRoleResponse(role) });
      } catch (err) {
        next(err);
      }
    },
    async update(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = roleUpdateRequestSchema.parse(req.body);
        const role = await service.update(id, body);
        res.json({ success: true, data: toRoleResponse(role) });
      } catch (err) {
        next(err);
      }
    },
    async delete(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        await service.delete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
    async assign(req, res, next) {
      try {
        const targetStaffId = requireUuidParam(req, "staffId");
        const body = roleAssignmentRequestSchema.parse(req.body);
        const caller = requireCaller2(req);
        await service.assign(targetStaffId, body.roleId, caller);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/roles/role.routes.ts
function roleRoutes(db2) {
  const router = Router6();
  const service = createRoleService(db2, createRoleRepository(db2));
  const controller = createRoleController(service);
  router.get("/permissions", requirePermission("role.manage"), controller.listPermissionCatalog);
  router.get("/", requireAnyPermission("user.manage", "role.manage"), controller.list);
  router.get("/:id", requirePermission("role.manage"), controller.detail);
  router.post("/", requirePermission("role.manage"), controller.create);
  router.patch("/:id", requirePermission("role.manage"), controller.update);
  router.delete("/:id", requirePermission("role.manage"), controller.delete);
  router.post("/assign/:staffId", requirePermission("role.manage"), controller.assign);
  return router;
}

// src/modules/media/media.routes.ts
import express, { Router as Router7 } from "express";
import multer from "multer";

// src/modules/media/media.repository.ts
import { eq as eq8 } from "drizzle-orm";

// src/lib/stripUndefined.ts
function stripUndefined(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== void 0) result[key] = value;
  }
  return result;
}

// src/modules/media/media.repository.ts
function createMediaRepository(db2) {
  return {
    async create(input) {
      const id = newId();
      await db2.insert(media).values({ ...input, id });
      const [row] = await db2.select().from(media).where(eq8(media.id, id)).limit(1);
      if (!row) throw new Error("media missing immediately after insert");
      return row;
    },
    async findById(id) {
      const [row] = await db2.select().from(media).where(eq8(media.id, id)).limit(1);
      return row ?? null;
    },
    async update(id, input) {
      await db2.update(media).set(stripUndefined(input)).where(eq8(media.id, id));
      const [row] = await db2.select().from(media).where(eq8(media.id, id)).limit(1);
      if (!row) throw new Error("media missing immediately after update");
      return row;
    },
    async delete(id) {
      await db2.delete(media).where(eq8(media.id, id));
    }
  };
}

// src/modules/media/media.service.ts
function createMediaService(env, repository) {
  return {
    async upload(input) {
      const stored = await storeUpload(env, {
        tempPath: input.tempPath,
        sizeBytes: input.sizeBytes,
        declaredMime: input.declaredMime
      });
      try {
        return await repository.create({
          storagePath: stored.storagePath,
          mime: stored.mime,
          sizeBytes: stored.sizeBytes,
          originalFilename: input.originalFilename,
          alt: input.alt ?? null,
          caption: input.caption ?? null,
          uploadedBy: input.uploadedBy
        });
      } catch (err) {
        await deleteStoredFile(env, stored.storagePath).catch(() => {
        });
        throw err;
      }
    },
    async get(id) {
      const row = await repository.findById(id);
      if (!row) throw new AppError("Media not found", 404, "not_found");
      return row;
    },
    async update(id, input) {
      const existing = await repository.findById(id);
      if (!existing) throw new AppError("Media not found", 404, "not_found");
      return repository.update(id, input);
    },
    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw new AppError("Media not found", 404, "not_found");
      await repository.delete(id);
      await deleteStoredFile(env, existing.storagePath);
    }
  };
}

// src/modules/media/media.mapper.ts
function toMediaResponse(env, row) {
  return {
    id: row.id,
    url: publicUrlFor(env, row.storagePath),
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    originalFilename: row.originalFilename,
    alt: row.alt,
    caption: row.caption,
    createdAt: row.createdAt.toISOString()
  };
}

// src/modules/media/media.controller.ts
function requireCaller3(req) {
  const subjectId = req.auth?.subjectId;
  if (!subjectId) throw new AppError("Not authenticated", 401, "unauthenticated");
  return { subjectId };
}
function createMediaController(service, env) {
  return {
    async upload(req, res, next) {
      try {
        if (!req.file) {
          throw new AppError("A file is required", 400, "file_required");
        }
        const metadata = mediaUploadMetadataSchema.parse(req.body);
        const caller = requireCaller3(req);
        const row = await service.upload({
          tempPath: req.file.path,
          sizeBytes: req.file.size,
          declaredMime: req.file.mimetype,
          originalFilename: req.file.originalname,
          alt: metadata.alt,
          caption: metadata.caption,
          uploadedBy: caller.subjectId
        });
        res.status(201).json({ success: true, data: toMediaResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },
    async get(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const row = await service.get(id);
        res.json({ success: true, data: toMediaResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },
    async update(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = mediaUpdateRequestSchema.parse(req.body);
        const row = await service.update(id, body);
        res.json({ success: true, data: toMediaResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },
    async remove(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        await service.delete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/media/media.routes.ts
var MEDIA_UPLOAD_RATE_LIMIT = { windowMs: 15 * 60 * 1e3, max: 30 };
function uploaderKey(req) {
  return req.auth?.subjectId ?? clientIp(req);
}
function mediaUploadRateLimiter() {
  return rateLimit({
    name: "media-upload",
    ...MEDIA_UPLOAD_RATE_LIMIT,
    keyGenerator: uploaderKey,
    onLimited: respondWithTooManyRequests
  });
}
function createUploadMiddleware(env) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, `${env.MEDIA_STORAGE_PATH}/${MEDIA_TEMP_SUBDIR}`),
    // The generated name is never trusted as the final stored name — `storeUpload` renames from
    // here using its own server-generated identifier and sniffed extension. This name only needs
    // to be collision-free within the temp directory for the lifetime of one request.
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  });
  return multer({
    storage,
    limits: { fileSize: Math.max(env.MEDIA_MAX_IMAGE_BYTES, env.MEDIA_MAX_VIDEO_BYTES) }
  });
}
function mediaRoutes(db2, env) {
  const router = Router7();
  const service = createMediaService(env, createMediaRepository(db2));
  const controller = createMediaController(service, env);
  const upload = createUploadMiddleware(env);
  router.post(
    "/",
    requirePermission("media.manage"),
    mediaUploadRateLimiter(),
    upload.single("file"),
    controller.upload
  );
  router.get("/:id", requirePermission("media.manage"), controller.get);
  router.patch("/:id", requirePermission("media.manage"), controller.update);
  router.delete("/:id", requirePermission("media.manage"), controller.remove);
  return router;
}
express.static.mime.define({ "image/avif": ["avif"] });
function mediaFileRoutes(env) {
  const router = Router7();
  router.use(requirePublic());
  router.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  router.use(express.static(env.MEDIA_STORAGE_PATH));
  return router;
}

// src/modules/articles/article.routes.ts
import { Router as Router8 } from "express";

// src/modules/articles/article.repository.ts
import { and as and3, desc, eq as eq9, gte, inArray as inArray2, isNotNull, lte, notInArray, or, sql as sql15 } from "drizzle-orm";
var SLUG_CONSTRAINT = "articles_slug_unique";
var FEATURED_MEDIA_CONSTRAINT = "featured_media_id";
var ANAK_USAHA_CONSTRAINT = "anak_usaha_id";
function invalidTaxonomyError() {
  return new AppError("One or more category ids do not exist", 400, "invalid_taxonomy_reference");
}
function invalidFeaturedMediaError() {
  return new AppError("The referenced featured media item does not exist", 400, "invalid_media_reference");
}
function invalidAnakUsahaError() {
  return new AppError("The referenced anak usaha entry does not exist", 400, "invalid_anak_usaha_reference");
}
function slugConflictError() {
  return new AppError("That slug is already in use by another article", 409, "slug_conflict");
}
function translateArticleWriteError(err) {
  if (isUniqueViolationOn(err, SLUG_CONSTRAINT)) return slugConflictError();
  if (isForeignKeyViolation(err)) {
    const constraint = violatedConstraint(err);
    if (constraint?.includes(FEATURED_MEDIA_CONSTRAINT)) return invalidFeaturedMediaError();
    if (constraint?.includes(ANAK_USAHA_CONSTRAINT)) return invalidAnakUsahaError();
    return invalidTaxonomyError();
  }
  return null;
}
function publiclyVisible(now) {
  return or(
    // `published` requires a timestamp too: without this, a row whose publishedAt is somehow
    // null would reach the mapper, which cannot build a public DTO for it and throws — turning
    // one bad row into a 500 for the whole listing instead of simply omitting it.
    and3(eq9(articles.status, "published"), isNotNull(articles.publishedAt)),
    and3(eq9(articles.status, "scheduled"), lte(articles.publishedAt, now))
  );
}
function isPubliclyVisible(row, now) {
  if (row.status === "published") return row.publishedAt !== null;
  if (row.status === "scheduled") return row.publishedAt !== null && row.publishedAt.getTime() <= now.getTime();
  return false;
}
async function replaceTaxonomy(tx, articleId, input) {
  if (input.categoryIds !== void 0) {
    const categoryIds = [...new Set(input.categoryIds)];
    await tx.delete(articleCategories).where(eq9(articleCategories.articleId, articleId));
    if (categoryIds.length > 0) {
      await tx.insert(articleCategories).values(categoryIds.map((categoryId) => ({ articleId, categoryId })));
    }
  }
}
function groupByArticleId(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const list = map.get(row.articleId);
    if (list) list.push(row);
    else map.set(row.articleId, [row]);
  }
  return map;
}
async function attachRelations(db2, rows) {
  if (rows.length === 0) return [];
  const articleIds = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const mediaIds = [...new Set(rows.map((r) => r.featuredMediaId).filter((id) => id !== null))];
  const anakUsahaIds = [...new Set(rows.map((r) => r.anakUsahaId).filter((id) => id !== null))];
  const [categoryLinks, authors, mediaRows, anakUsahaRows] = await Promise.all([
    db2.select({ articleId: articleCategories.articleId, id: categories.id, name: categories.name, slug: categories.slug }).from(articleCategories).innerJoin(categories, eq9(categories.id, articleCategories.categoryId)).where(inArray2(articleCategories.articleId, articleIds)),
    authorIds.length > 0 ? db2.select({ id: users.id, name: users.name }).from(users).where(inArray2(users.id, authorIds)) : Promise.resolve([]),
    mediaIds.length > 0 ? db2.select({ id: media.id, storagePath: media.storagePath }).from(media).where(inArray2(media.id, mediaIds)) : Promise.resolve([]),
    anakUsahaIds.length > 0 ? db2.select({ id: anakUsaha.id, name: anakUsaha.name, slug: anakUsaha.slug }).from(anakUsaha).where(inArray2(anakUsaha.id, anakUsahaIds)) : Promise.resolve([])
  ]);
  const categoriesByArticle = groupByArticleId(categoryLinks);
  const authorNameById = new Map(authors.map((a) => [a.id, a.name]));
  const mediaPathById = new Map(mediaRows.map((m) => [m.id, m.storagePath]));
  const anakUsahaById = new Map(anakUsahaRows.map((a) => [a.id, a]));
  return rows.map((row) => ({
    ...row,
    authorName: authorNameById.get(row.authorId) ?? "Unknown",
    featuredMediaStoragePath: row.featuredMediaId ? mediaPathById.get(row.featuredMediaId) ?? null : null,
    categories: (categoriesByArticle.get(row.id) ?? []).map(({ id, name, slug }) => ({ id, name, slug })),
    anakUsaha: row.anakUsahaId ? anakUsahaById.get(row.anakUsahaId) ?? null : null
  }));
}
function createArticleRepository(db2) {
  async function findRowById(id) {
    const [row] = await db2.select().from(articles).where(eq9(articles.id, id)).limit(1);
    return row ?? null;
  }
  return {
    async create(input) {
      try {
        const id = await db2.transaction(async (tx) => {
          const newRowId = newId();
          await tx.insert(articles).values({
            id: newRowId,
            title: input.title,
            slug: input.slug,
            bodyJson: input.bodyJson,
            bodyHtml: input.bodyHtml,
            excerpt: input.excerpt,
            authorId: input.authorId,
            featuredMediaId: input.featuredMediaId,
            anakUsahaId: input.anakUsahaId,
            seoTitle: input.seoTitle,
            seoDescription: input.seoDescription
          });
          await replaceTaxonomy(tx, newRowId, { categoryIds: input.categoryIds });
          return newRowId;
        });
        const row = await findRowById(id);
        if (!row) throw new Error("article missing immediately after create");
        const [withRelations] = await attachRelations(db2, [row]);
        if (!withRelations) throw new Error("article missing immediately after create");
        return withRelations;
      } catch (err) {
        const translated = translateArticleWriteError(err);
        if (translated) throw translated;
        throw err;
      }
    },
    async update(id, input) {
      try {
        await db2.transaction(async (tx) => {
          const { categoryIds, ...fields } = input;
          const definedFields = stripUndefined(fields);
          if (Object.keys(definedFields).length > 0 || categoryIds !== void 0) {
            await tx.update(articles).set({ ...definedFields, updatedAt: /* @__PURE__ */ new Date() }).where(eq9(articles.id, id));
          }
          await replaceTaxonomy(tx, id, { categoryIds });
        });
      } catch (err) {
        const translated = translateArticleWriteError(err);
        if (translated) throw translated;
        throw err;
      }
      const row = await findRowById(id);
      if (!row) throw new Error("article missing immediately after update");
      const [withRelations] = await attachRelations(db2, [row]);
      if (!withRelations) throw new Error("article missing immediately after update");
      return withRelations;
    },
    async updateStatus(id, status, publishedAt) {
      await db2.update(articles).set({ status, publishedAt, updatedAt: /* @__PURE__ */ new Date() }).where(eq9(articles.id, id));
      const row = await findRowById(id);
      if (!row) throw new Error("article missing immediately after status update");
      const [withRelations] = await attachRelations(db2, [row]);
      if (!withRelations) throw new Error("article missing immediately after status update");
      return withRelations;
    },
    async promoteScheduled(id, now) {
      const [result] = await db2.update(articles).set({ status: "published", updatedAt: /* @__PURE__ */ new Date() }).where(
        and3(eq9(articles.id, id), eq9(articles.status, "scheduled"), lte(articles.publishedAt, now))
      );
      return result.affectedRows > 0;
    },
    async findById(id) {
      const row = await findRowById(id);
      if (!row) return null;
      const [withRelations] = await attachRelations(db2, [row]);
      return withRelations ?? null;
    },
    async listAdmin(status) {
      const rows = await db2.select().from(articles).where(status ? eq9(articles.status, status) : void 0).orderBy(desc(articles.updatedAt));
      return attachRelations(db2, rows);
    },
    async delete(id) {
      await db2.delete(articles).where(eq9(articles.id, id));
    },
    async slugExists(slug, excludeId) {
      const condition = excludeId ? and3(eq9(articles.slug, slug), sql15`${articles.id} != ${excludeId}`) : eq9(articles.slug, slug);
      const [row] = await db2.select({ id: articles.id }).from(articles).where(condition).limit(1);
      return row !== void 0;
    },
    async listPublished(filter) {
      const conditions = [publiclyVisible(filter.now)];
      if (filter.categorySlugs && filter.categorySlugs.length > 0) {
        conditions.push(
          inArray2(
            articles.id,
            db2.select({ id: articleCategories.articleId }).from(articleCategories).innerJoin(categories, eq9(categories.id, articleCategories.categoryId)).where(inArray2(categories.slug, filter.categorySlugs))
          )
        );
      }
      if (filter.anakUsahaSlugs && filter.anakUsahaSlugs.length > 0) {
        conditions.push(
          inArray2(
            articles.anakUsahaId,
            db2.select({ id: anakUsaha.id }).from(anakUsaha).where(inArray2(anakUsaha.slug, filter.anakUsahaSlugs))
          )
        );
      }
      if (filter.publishedAfter) {
        conditions.push(gte(articles.publishedAt, filter.publishedAfter));
      }
      if (filter.publishedBefore) {
        conditions.push(lte(articles.publishedAt, filter.publishedBefore));
      }
      if (filter.excludeIds && filter.excludeIds.length > 0) {
        conditions.push(notInArray(articles.id, filter.excludeIds));
      }
      const rows = await db2.select().from(articles).where(and3(...conditions)).orderBy(desc(articles.publishedAt), desc(articles.id)).limit(filter.limit).offset(filter.offset);
      return attachRelations(db2, rows);
    },
    async findManyPubliclyVisible(ids, now) {
      if (ids.length === 0) return [];
      const rows = await db2.select().from(articles).where(and3(inArray2(articles.id, ids), publiclyVisible(now)));
      return attachRelations(db2, rows);
    },
    async findPublishedBySlug(slug, now) {
      const [row] = await db2.select().from(articles).where(and3(eq9(articles.slug, slug), publiclyVisible(now))).limit(1);
      if (!row) return null;
      const [withRelations] = await attachRelations(db2, [row]);
      return withRelations ?? null;
    },
    async findDueScheduled(now) {
      const rows = await db2.select({ id: articles.id, slug: articles.slug, publishedAt: articles.publishedAt }).from(articles).where(and3(eq9(articles.status, "scheduled"), lte(articles.publishedAt, now)));
      return rows.filter((r) => r.publishedAt !== null);
    }
  };
}

// src/lib/sanitizeHtml.ts
var HEADING_TAGS = { 1: "h1", 2: "h2", 3: "h3" };
var LANGUAGE_PATTERN = /^[a-zA-Z0-9_+-]{1,32}$/;
var ALIGN_VALUES = /* @__PURE__ */ new Set(["left", "center", "right"]);
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
function sanitizeUrl(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    return null;
  } catch {
    return null;
  }
}
function sanitizePositiveInt(value, max) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) return null;
  return value;
}
function nodeArray(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((n) => typeof n === "object" && n !== null);
}
function markArray(marks) {
  if (!Array.isArray(marks)) return [];
  return marks.filter((m) => typeof m === "object" && m !== null);
}
function renderMarks(innerHtml, marks) {
  return marks.reduce((html, mark) => {
    switch (mark.type) {
      case "bold":
        return `<strong>${html}</strong>`;
      case "italic":
        return `<em>${html}</em>`;
      case "underline":
        return `<u>${html}</u>`;
      case "strike":
        return `<s>${html}</s>`;
      case "link": {
        const href = sanitizeUrl(mark.attrs?.href);
        if (!href) return html;
        return `<a href="${escapeAttr(href)}" rel="noopener noreferrer nofollow" target="_blank">${html}</a>`;
      }
      default:
        return html;
    }
  }, innerHtml);
}
function renderText(node) {
  if (typeof node.text !== "string" || node.text.length === 0) return "";
  return renderMarks(escapeHtml(node.text), markArray(node.marks));
}
function renderCodeText(nodes) {
  return nodes.map((n) => n.type === "text" && typeof n.text === "string" ? escapeHtml(n.text) : "").join("");
}
function renderChildren(node) {
  return nodeArray(node.content).map(renderNode).join("");
}
function renderImage(node) {
  const attrs = node.attrs ?? {};
  const src = sanitizeUrl(attrs.src);
  if (!src) return "";
  const alt = typeof attrs.alt === "string" ? escapeAttr(attrs.alt) : "";
  const width = sanitizePositiveInt(attrs.width, 4e3);
  const align = typeof attrs.align === "string" && ALIGN_VALUES.has(attrs.align) ? attrs.align : "center";
  const caption = typeof attrs.caption === "string" && attrs.caption.length > 0 ? attrs.caption : null;
  const widthAttr = width !== null ? ` width="${width}"` : "";
  const img = `<img src="${escapeAttr(src)}" alt="${alt}"${widthAttr}>`;
  const figcaption = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";
  return `<figure class="align-${align}">${img}${figcaption}</figure>`;
}
function renderVideo(node) {
  const src = sanitizeUrl(node.attrs?.src);
  if (!src) return "";
  return `<figure class="video-embed"><a href="${escapeAttr(src)}" rel="noopener noreferrer nofollow" target="_blank">${escapeHtml(src)}</a></figure>`;
}
function renderTableCell(node, tag) {
  const colspan = sanitizePositiveInt(node.attrs?.colspan, 1e3);
  const rowspan = sanitizePositiveInt(node.attrs?.rowspan, 1e3);
  const colspanAttr = colspan && colspan > 1 ? ` colspan="${colspan}"` : "";
  const rowspanAttr = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : "";
  return `<${tag}${colspanAttr}${rowspanAttr}>${renderChildren(node)}</${tag}>`;
}
function renderNode(node) {
  switch (node.type) {
    case "doc":
      return renderChildren(node);
    case "text":
      return renderText(node);
    case "paragraph":
      return `<p>${renderChildren(node)}</p>`;
    case "heading": {
      const level = sanitizePositiveInt(node.attrs?.level, 3);
      const tag = level !== null ? HEADING_TAGS[level] : void 0;
      if (!tag) return `<p>${renderChildren(node)}</p>`;
      return `<${tag}>${renderChildren(node)}</${tag}>`;
    }
    case "blockquote":
      return `<blockquote>${renderChildren(node)}</blockquote>`;
    case "codeBlock": {
      const language = typeof node.attrs?.language === "string" && LANGUAGE_PATTERN.test(node.attrs.language) ? node.attrs.language : null;
      const classAttr = language ? ` class="language-${escapeAttr(language)}"` : "";
      return `<pre><code${classAttr}>${renderCodeText(nodeArray(node.content))}</code></pre>`;
    }
    case "bulletList":
      return `<ul>${renderChildren(node)}</ul>`;
    case "orderedList": {
      const start = sanitizePositiveInt(node.attrs?.start, 1e5);
      const startAttr = start && start !== 1 ? ` start="${start}"` : "";
      return `<ol${startAttr}>${renderChildren(node)}</ol>`;
    }
    case "listItem":
      return `<li>${renderChildren(node)}</li>`;
    case "taskList":
      return `<ul class="task-list">${renderChildren(node)}</ul>`;
    case "taskItem": {
      const checked = node.attrs?.checked === true;
      const checkedAttr = checked ? " checked" : "";
      return `<li class="task-item" data-checked="${checked}"><input type="checkbox" disabled${checkedAttr}>${renderChildren(node)}</li>`;
    }
    case "table":
      return `<table><tbody>${renderChildren(node)}</tbody></table>`;
    case "tableRow":
      return `<tr>${renderChildren(node)}</tr>`;
    case "tableCell":
      return renderTableCell(node, "td");
    case "tableHeader":
      return renderTableCell(node, "th");
    case "image":
      return renderImage(node);
    case "horizontalRule":
      return "<hr>";
    case "video":
      return renderVideo(node);
    default:
      return "";
  }
}
function sanitizeHtml(bodyJson) {
  if (typeof bodyJson !== "object" || bodyJson === null) return { html: "" };
  return { html: renderNode(bodyJson) };
}

// src/lib/slugify.ts
var COMBINING_DIACRITICS = /[̀-ͯ]/g;
function slugify2(value) {
  return value.normalize("NFKD").replace(COMBINING_DIACRITICS, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function slugifyRequired(value, subject) {
  const slug = slugify2(value);
  if (!slug) {
    throw new AppError(`${subject} must contain at least one letter or number`, 400, "invalid_slug");
  }
  return slug;
}

// src/lib/revalidate.ts
async function triggerRebuild(env, logger) {
  if (!env.DEPLOY_TRIGGER_URL) {
    return;
  }
  try {
    const res = await fetch(env.DEPLOY_TRIGGER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...env.DEPLOY_TRIGGER_TOKEN ? { authorization: `Bearer ${env.DEPLOY_TRIGGER_TOKEN}` } : {}
      },
      body: JSON.stringify({ event_type: "content-published" })
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "rebuild trigger request rejected");
    }
  } catch (err) {
    logger.warn({ err }, "rebuild trigger request failed");
  }
}
async function revalidateArticlePaths(env, logger, ..._slugs) {
  await triggerRebuild(env, logger);
}
async function revalidateHomePath(env, logger) {
  await triggerRebuild(env, logger);
}

// src/modules/articles/article.service.ts
var EMPTY_DOCUMENT = { type: "doc", content: [] };
function slugConflictError2() {
  return new AppError("That slug is already in use by another article", 409, "slug_conflict");
}
function notFoundError() {
  return new AppError("Article not found", 404, "not_found");
}
function invalidTransitionError(message) {
  return new AppError(message, 409, "invalid_status_transition");
}
function createArticleService(repository, revalidateEnv, logger) {
  async function resolveSlug(desired, title, excludeId) {
    const candidate = desired && desired.length > 0 ? desired : slugifyRequired(title, "Title");
    if (await repository.slugExists(candidate, excludeId)) {
      throw slugConflictError2();
    }
    return candidate;
  }
  function toRepositoryFields(input) {
    const fields = {};
    if (input.title !== void 0) fields.title = input.title;
    if (input.bodyJson !== void 0) {
      fields.bodyJson = input.bodyJson;
      fields.bodyHtml = sanitizeHtml(input.bodyJson).html;
    }
    if (input.excerpt !== void 0) fields.excerpt = input.excerpt;
    if (input.featuredMediaId !== void 0) fields.featuredMediaId = input.featuredMediaId;
    if (input.anakUsahaId !== void 0) fields.anakUsahaId = input.anakUsahaId;
    if (input.seoTitle !== void 0) fields.seoTitle = input.seoTitle;
    if (input.seoDescription !== void 0) fields.seoDescription = input.seoDescription;
    return fields;
  }
  return {
    async create(input, authorId) {
      const slug = await resolveSlug(input.slug, input.title);
      const bodyJson = input.bodyJson ?? EMPTY_DOCUMENT;
      const created = {
        title: input.title,
        slug,
        bodyJson,
        bodyHtml: sanitizeHtml(bodyJson).html,
        excerpt: input.excerpt ?? null,
        authorId,
        featuredMediaId: input.featuredMediaId ?? null,
        anakUsahaId: input.anakUsahaId ?? null,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        categoryIds: input.categoryIds ?? []
      };
      return repository.create(created);
    },
    async update(id, input) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      let slug;
      if (input.slug !== void 0 && input.slug !== existing.slug) {
        slug = await resolveSlug(input.slug, input.title ?? existing.title, id);
      }
      const updated = await repository.update(id, {
        ...toRepositoryFields(input),
        ...slug !== void 0 && { slug },
        ...input.categoryIds !== void 0 && { categoryIds: input.categoryIds }
      });
      if (isPubliclyVisible(existing, /* @__PURE__ */ new Date())) {
        const movedFrom = updated.slug === existing.slug ? [] : [existing.slug];
        await revalidateArticlePaths(revalidateEnv, logger, updated.slug, ...movedFrom);
      }
      return updated;
    },
    /**
     * Structurally narrower than `update`: `ArticleAutosaveRequest` has no `slug` field, so
     * there is nothing here that could regenerate or move it, and status is never touched
     * (specs/article-management/spec.md - "Autosave never alters the slug").
     */
    async autosave(id, input) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      const updated = await repository.update(id, {
        ...toRepositoryFields(input),
        ...input.categoryIds !== void 0 && { categoryIds: input.categoryIds }
      });
      if (isPubliclyVisible(existing, /* @__PURE__ */ new Date())) {
        await revalidateArticlePaths(revalidateEnv, logger, updated.slug);
      }
      return updated;
    },
    async get(id) {
      const row = await repository.findById(id);
      if (!row) throw notFoundError();
      return row;
    },
    list(status) {
      return repository.listAdmin(status);
    },
    async preview(id) {
      const row = await repository.findById(id);
      if (!row) throw notFoundError();
      return row;
    },
    async publish(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      if (existing.status !== "draft" && existing.status !== "scheduled") {
        throw invalidTransitionError("Only a draft or scheduled article can be published");
      }
      const updated = await repository.updateStatus(id, "published", /* @__PURE__ */ new Date());
      await revalidateArticlePaths(revalidateEnv, logger, updated.slug);
      return updated;
    },
    async unpublish(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      if (existing.status !== "published") {
        throw invalidTransitionError("Only a published article can be unpublished");
      }
      const updated = await repository.updateStatus(id, "draft", null);
      await revalidateArticlePaths(revalidateEnv, logger, updated.slug);
      return updated;
    },
    async schedule(id, publishedAt) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      if (existing.status !== "draft" && existing.status !== "scheduled") {
        throw invalidTransitionError("Only a draft or scheduled article can be (re)scheduled");
      }
      if (publishedAt.getTime() <= Date.now()) {
        throw new AppError("Scheduled time must be in the future", 400, "invalid_schedule_time");
      }
      const updated = await repository.updateStatus(id, "scheduled", publishedAt);
      if (isPubliclyVisible(existing, /* @__PURE__ */ new Date())) {
        await revalidateArticlePaths(revalidateEnv, logger, updated.slug);
      }
      return updated;
    },
    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError();
      await repository.delete(id);
      if (isPubliclyVisible(existing, /* @__PURE__ */ new Date())) {
        await revalidateArticlePaths(revalidateEnv, logger, existing.slug);
      }
    }
  };
}

// src/lib/htmlExcerpt.ts
var TAG_PATTERN = /<[^>]*>/g;
var WHITESPACE_PATTERN = /\s+/g;
var ELLIPSIS = "\u2026";
var ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"'
};
function decodeEntities(text12) {
  return text12.replace(/&amp;|&lt;|&gt;|&quot;/g, (entity) => ENTITIES[entity] ?? entity);
}
function excerptFromHtml(html, maxLength) {
  const text12 = decodeEntities(html.replace(TAG_PATTERN, " ")).replace(WHITESPACE_PATTERN, " ").trim();
  if (text12.length <= maxLength) return text12;
  const truncated = text12.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const boundary = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${boundary}${ELLIPSIS}`;
}

// src/modules/articles/article.mapper.ts
var CARD_EXCERPT_LENGTH = 160;
function toTaxonomyResponse(refs) {
  return refs.map(({ id, name, slug }) => ({ id, name, slug }));
}
function featuredImageUrl(env, article) {
  return article.featuredMediaStoragePath ? publicUrlFor(env, article.featuredMediaStoragePath) : null;
}
function cardExcerpt(article) {
  if (article.excerpt && article.excerpt.trim().length > 0) return article.excerpt;
  const fallback = excerptFromHtml(article.bodyHtml, CARD_EXCERPT_LENGTH);
  return fallback.length > 0 ? fallback : null;
}
function toPublicCard(env, article) {
  if (!article.publishedAt) {
    throw new Error(`article ${article.id} has no publishedAt but was mapped as publicly visible`);
  }
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: cardExcerpt(article),
    featuredImageUrl: featuredImageUrl(env, article),
    categories: toTaxonomyResponse(article.categories),
    anakUsaha: article.anakUsaha,
    authorName: article.authorName,
    publishedAt: article.publishedAt.toISOString()
  };
}
function toPublicDetail(env, article) {
  return {
    ...toPublicCard(env, article),
    bodyHtml: article.bodyHtml,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription
  };
}
function toAdminResponse(env, article) {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    bodyJson: article.bodyJson,
    bodyHtml: article.bodyHtml,
    excerpt: article.excerpt,
    status: article.status,
    authorId: article.authorId,
    authorName: article.authorName,
    featuredMediaId: article.featuredMediaId,
    featuredImageUrl: featuredImageUrl(env, article),
    categories: toTaxonomyResponse(article.categories),
    anakUsaha: article.anakUsaha,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString()
  };
}
function toPreviewResponse(env, article) {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: cardExcerpt(article),
    featuredImageUrl: featuredImageUrl(env, article),
    categories: toTaxonomyResponse(article.categories),
    anakUsaha: article.anakUsaha,
    authorName: article.authorName,
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : (/* @__PURE__ */ new Date(0)).toISOString(),
    bodyHtml: article.bodyHtml,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription
  };
}

// src/modules/articles/article.controller.ts
function requireCaller4(req) {
  const subjectId = req.auth?.subjectId;
  if (!subjectId) throw new AppError("Not authenticated", 401, "unauthenticated");
  return { subjectId };
}
function createArticleController(service, env) {
  return {
    async create(req, res, next) {
      try {
        const body = articleCreateRequestSchema.parse(req.body);
        const caller = requireCaller4(req);
        const article = await service.create(body, caller.subjectId);
        res.status(201).json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },
    async get(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const article = await service.get(id);
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },
    async list(req, res, next) {
      try {
        const status = req.query.status !== void 0 ? articleStatusSchema.parse(req.query.status) : void 0;
        const articles2 = await service.list(status);
        res.json({ success: true, data: articles2.map((article) => toAdminResponse(env, article)) });
      } catch (err) {
        next(err);
      }
    },
    async update(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = articleUpdateRequestSchema.parse(req.body);
        const article = await service.update(id, body);
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },
    async autosave(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = articleAutosaveRequestSchema.parse(req.body);
        const article = await service.autosave(id, body);
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },
    async remove(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        await service.delete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
    async publish(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const article = await service.publish(id);
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },
    async unpublish(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const article = await service.unpublish(id);
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },
    async schedule(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = articleScheduleRequestSchema.parse(req.body);
        const article = await service.schedule(id, new Date(body.publishedAt));
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },
    async preview(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const article = await service.preview(id);
        res.json({ success: true, data: toPreviewResponse(env, article) });
      } catch (err) {
        next(err);
      }
    }
  };
}
function createPublicArticleController(repository, env) {
  return {
    async list(req, res, next) {
      try {
        const query = articlePublicListQuerySchema.parse(req.query);
        const articles2 = await repository.listPublished({ ...query, now: /* @__PURE__ */ new Date() });
        res.json({ success: true, data: articles2.map((article) => toPublicCard(env, article)) });
      } catch (err) {
        next(err);
      }
    },
    async getBySlug(req, res, next) {
      try {
        const slug = requireParam(req, "slug");
        const article = await repository.findPublishedBySlug(slug, /* @__PURE__ */ new Date());
        if (!article) throw new AppError("Article not found", 404, "not_found");
        res.json({ success: true, data: toPublicDetail(env, article) });
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/articles/article.routes.ts
function articleRoutes(db2, env) {
  const router = Router8();
  const repository = createArticleRepository(db2);
  const service = createArticleService(repository, env, createLogger(env));
  const controller = createArticleController(service, env);
  router.post("/", requirePermission("news.manage"), controller.create);
  router.get("/", requirePermission("news.manage"), controller.list);
  router.get("/:id", requirePermission("news.manage"), controller.get);
  router.patch("/:id", requirePermission("news.manage"), controller.update);
  router.patch("/:id/autosave", requirePermission("news.manage"), controller.autosave);
  router.delete("/:id", requirePermission("news.manage"), controller.remove);
  router.post("/:id/publish", requirePermission("news.manage"), controller.publish);
  router.post("/:id/unpublish", requirePermission("news.manage"), controller.unpublish);
  router.post("/:id/schedule", requirePermission("news.manage"), controller.schedule);
  router.get("/:id/preview", requirePermission("news.manage"), controller.preview);
  return router;
}
function publicArticleRoutes(db2, env) {
  const router = Router8();
  const repository = createArticleRepository(db2);
  const controller = createPublicArticleController(repository, env);
  router.get("/", requirePublic(), publicReadRateLimiter("public-article-read"), controller.list);
  router.get("/:slug", requirePublic(), publicReadRateLimiter("public-article-read"), controller.getBySlug);
  return router;
}

// src/modules/articles/scheduledPublishWorker.ts
function createScheduledPublishJob(repository, env, logger) {
  return async function scheduledPublishJob() {
    const now = /* @__PURE__ */ new Date();
    const due = await repository.findDueScheduled(now);
    for (const article of due) {
      try {
        const promoted = await repository.promoteScheduled(article.id, now);
        if (!promoted) {
          logger.info(
            { articleId: article.id, slug: article.slug },
            "scheduled article changed before promotion; skipped"
          );
          continue;
        }
        await revalidateArticlePaths(env, logger, article.slug);
        logger.info({ articleId: article.id, slug: article.slug }, "scheduled article promoted to published");
      } catch (err) {
        logger.error({ err, articleId: article.id, slug: article.slug }, "failed to promote scheduled article");
      }
    }
  };
}

// src/modules/categories/category.routes.ts
import { Router as Router9 } from "express";

// src/modules/categories/category.repository.ts
import { and as and4, eq as eq10, sql as sql16 } from "drizzle-orm";
function slugConflictError3() {
  return new AppError("That slug is already in use by another category", 409, "slug_conflict");
}
function createCategoryRepository(db2) {
  return {
    async create(input) {
      try {
        const id = newId();
        await db2.insert(categories).values({ ...input, id });
        return { id, ...input };
      } catch (err) {
        if (isUniqueViolationOn(err, "categories_slug_unique")) throw slugConflictError3();
        throw err;
      }
    },
    async update(id, input) {
      try {
        await db2.update(categories).set(input).where(eq10(categories.id, id));
        const [row] = await db2.select().from(categories).where(eq10(categories.id, id)).limit(1);
        if (!row) throw new Error("category missing immediately after update");
        return row;
      } catch (err) {
        if (isUniqueViolationOn(err, "categories_slug_unique")) throw slugConflictError3();
        throw err;
      }
    },
    async findById(id) {
      const [row] = await db2.select().from(categories).where(eq10(categories.id, id)).limit(1);
      return row ?? null;
    },
    async slugExists(slug, excludeId) {
      const condition = excludeId ? and4(eq10(categories.slug, slug), sql16`${categories.id} != ${excludeId}`) : eq10(categories.slug, slug);
      const [row] = await db2.select({ id: categories.id }).from(categories).where(condition).limit(1);
      return row !== void 0;
    },
    async delete(id) {
      await db2.delete(categories).where(eq10(categories.id, id));
    },
    async list() {
      return db2.select().from(categories);
    }
  };
}

// src/modules/categories/category.service.ts
function slugConflictError4() {
  return new AppError("That slug is already in use by another category", 409, "slug_conflict");
}
function notFoundError2() {
  return new AppError("Category not found", 404, "not_found");
}
function createCategoryService(repository) {
  return {
    async create(name) {
      const slug = slugifyRequired(name, "Category name");
      if (await repository.slugExists(slug)) throw slugConflictError4();
      return repository.create({ name, slug });
    },
    async update(id, name) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError2();
      const slug = slugifyRequired(name, "Category name");
      if (slug !== existing.slug && await repository.slugExists(slug, id)) throw slugConflictError4();
      return repository.update(id, { name, slug });
    },
    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError2();
      await repository.delete(id);
    },
    list() {
      return repository.list();
    }
  };
}

// src/modules/categories/category.mapper.ts
function toCategoryResponse(row) {
  return { id: row.id, name: row.name, slug: row.slug };
}

// src/modules/categories/category.controller.ts
function createCategoryController(service) {
  return {
    async list(_req, res, next) {
      try {
        const rows = await service.list();
        res.json({ success: true, data: rows.map(toCategoryResponse) });
      } catch (err) {
        next(err);
      }
    },
    async create(req, res, next) {
      try {
        const body = categoryCreateRequestSchema.parse(req.body);
        const row = await service.create(body.name);
        res.status(201).json({ success: true, data: toCategoryResponse(row) });
      } catch (err) {
        next(err);
      }
    },
    async update(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = categoryUpdateRequestSchema.parse(req.body);
        const row = await service.update(id, body.name);
        res.json({ success: true, data: toCategoryResponse(row) });
      } catch (err) {
        next(err);
      }
    },
    async remove(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        await service.delete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/categories/category.routes.ts
function categoryRoutes(db2) {
  const router = Router9();
  const service = createCategoryService(createCategoryRepository(db2));
  const controller = createCategoryController(service);
  router.get("/", requirePublic(), controller.list);
  router.post("/", requirePermission("category.manage"), controller.create);
  router.patch("/:id", requirePermission("category.manage"), controller.update);
  router.delete("/:id", requirePermission("category.manage"), controller.remove);
  return router;
}

// src/modules/anak-usaha/anakUsaha.routes.ts
import { Router as Router10 } from "express";

// src/modules/anak-usaha/anakUsaha.repository.ts
import { and as and5, asc as asc2, eq as eq11, sql as sql19 } from "drizzle-orm";

// src/lib/replaceSortOrder.ts
import { sql as sql18 } from "drizzle-orm";

// src/lib/tableWriteLock.ts
import { sql as sql17 } from "drizzle-orm";
var LOCK_PREFIX = "siders:table-write:";
var DEFAULT_TIMEOUT_SECONDS = 10;
function lockConflictError(table) {
  return new AppError(
    `Another write to ${table} is in progress; try again`,
    409,
    "write_lock_timeout"
  );
}
function assertLockNameFits(lockName) {
  if (lockName.length > 64) {
    throw new Error(
      `Advisory lock name "${lockName}" is ${lockName.length} characters; MySQL's GET_LOCK rejects names over 64.`
    );
  }
}
async function withTableWriteLock(tx, table, fn, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS) {
  const lockName = `${LOCK_PREFIX}${table}`;
  assertLockNameFits(lockName);
  const [rows] = await tx.execute(sql17`select get_lock(${lockName}, ${timeoutSeconds}) as acquired`);
  if (rows[0]?.acquired !== 1) throw lockConflictError(table);
  try {
    return await fn();
  } finally {
    await tx.execute(sql17`select release_lock(${lockName})`);
  }
}

// src/lib/replaceSortOrder.ts
function isExactIdSet(currentIds, submittedIds) {
  if (currentIds.length !== submittedIds.length) return false;
  const current = new Set(currentIds);
  const submitted = new Set(submittedIds);
  if (current.size !== submitted.size) return false;
  for (const id of current) {
    if (!submitted.has(id)) return false;
  }
  return true;
}
async function replaceSortOrder(config) {
  const { db: db2, ids, table, updateSortOrder, selectJoined: selectJoined2, onInvalidSet } = config;
  return db2.transaction(async (tx) => {
    return withTableWriteLock(tx, table, async () => {
      const [rows] = await tx.execute(sql18`select id from ${sql18.raw(table)}`);
      const currentIds = rows.map((r) => r.id);
      if (!isExactIdSet(currentIds, ids)) throw onInvalidSet();
      for (const [index9, id] of ids.entries()) {
        await updateSortOrder(tx, id, index9);
      }
      return selectJoined2(tx);
    });
  });
}

// src/modules/anak-usaha/anakUsaha.repository.ts
function slugConflictError5() {
  return new AppError("That slug is already in use by another anak usaha entry", 409, "slug_conflict");
}
function profileAlreadyExistsError() {
  return new AppError("This anak usaha entry already has a profile", 409, "profile_conflict");
}
function unknownAnakUsahaError() {
  return new AppError("anakUsahaId does not reference an existing anak usaha entry", 400, "invalid_anak_usaha");
}
function invalidLogoMediaError() {
  return new AppError("logoMediaId does not reference an existing media item", 400, "invalid_logo_media");
}
function invalidProfileSetError() {
  return new AppError(
    "anakUsahaIds must name exactly the current set of anak usaha profiles, no more and no fewer",
    400,
    "invalid_anak_usaha_profile_set"
  );
}
var JOINED_COLUMNS = {
  id: anakUsaha.id,
  name: anakUsaha.name,
  slug: anakUsaha.slug,
  profileAnakUsahaId: anakUsahaProfile.anakUsahaId,
  logoMediaId: anakUsahaProfile.logoMediaId,
  logoStoragePath: media.storagePath,
  backgroundColor: anakUsahaProfile.backgroundColor,
  description: anakUsahaProfile.description,
  kind: anakUsahaProfile.kind,
  links: anakUsahaProfile.links,
  sortOrder: anakUsahaProfile.sortOrder,
  isActive: anakUsahaProfile.isActive
};
function toWithProfileRow(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    profile: row.profileAnakUsahaId === null ? null : {
      logoMediaId: row.logoMediaId,
      logoStoragePath: row.logoStoragePath,
      backgroundColor: row.backgroundColor,
      description: row.description,
      kind: row.kind ?? "",
      links: row.links ?? [],
      sortOrder: row.sortOrder ?? 0,
      isActive: row.isActive ?? false
    }
  };
}
async function listWithProfileJoined(executor) {
  const rows = await executor.select(JOINED_COLUMNS).from(anakUsaha).leftJoin(anakUsahaProfile, eq11(anakUsahaProfile.anakUsahaId, anakUsaha.id)).leftJoin(media, eq11(media.id, anakUsahaProfile.logoMediaId)).orderBy(asc2(anakUsahaProfile.sortOrder), asc2(anakUsaha.createdAt));
  return rows.map(toWithProfileRow);
}
async function findWithProfileJoined(executor, anakUsahaId) {
  const [row] = await executor.select(JOINED_COLUMNS).from(anakUsaha).leftJoin(anakUsahaProfile, eq11(anakUsahaProfile.anakUsahaId, anakUsaha.id)).leftJoin(media, eq11(media.id, anakUsahaProfile.logoMediaId)).where(eq11(anakUsaha.id, anakUsahaId)).limit(1);
  return row ? toWithProfileRow(row) : null;
}
async function findProfileJoined(executor, anakUsahaId) {
  const [row] = await executor.select({
    logoMediaId: anakUsahaProfile.logoMediaId,
    logoStoragePath: media.storagePath,
    backgroundColor: anakUsahaProfile.backgroundColor,
    description: anakUsahaProfile.description,
    kind: anakUsahaProfile.kind,
    links: anakUsahaProfile.links,
    sortOrder: anakUsahaProfile.sortOrder,
    isActive: anakUsahaProfile.isActive
  }).from(anakUsahaProfile).leftJoin(media, eq11(media.id, anakUsahaProfile.logoMediaId)).where(eq11(anakUsahaProfile.anakUsahaId, anakUsahaId)).limit(1);
  if (!row) return null;
  return {
    logoMediaId: row.logoMediaId,
    logoStoragePath: row.logoStoragePath,
    backgroundColor: row.backgroundColor,
    description: row.description,
    kind: row.kind,
    links: row.links ?? [],
    sortOrder: row.sortOrder,
    isActive: row.isActive
  };
}
function createAnakUsahaRepository(db2) {
  return {
    async create(input) {
      try {
        const id = newId();
        await db2.insert(anakUsaha).values({ ...input, id });
        const [row] = await db2.select().from(anakUsaha).where(eq11(anakUsaha.id, id)).limit(1);
        if (!row) throw new Error("anak usaha missing immediately after insert");
        return row;
      } catch (err) {
        if (isUniqueViolationOn(err, "anak_usaha_slug_unique")) throw slugConflictError5();
        throw err;
      }
    },
    async update(id, input) {
      try {
        await db2.update(anakUsaha).set(input).where(eq11(anakUsaha.id, id));
        const [row] = await db2.select().from(anakUsaha).where(eq11(anakUsaha.id, id)).limit(1);
        if (!row) throw new Error("anak usaha missing immediately after update");
        return row;
      } catch (err) {
        if (isUniqueViolationOn(err, "anak_usaha_slug_unique")) throw slugConflictError5();
        throw err;
      }
    },
    async findById(id) {
      const [row] = await db2.select().from(anakUsaha).where(eq11(anakUsaha.id, id)).limit(1);
      return row ?? null;
    },
    async slugExists(slug, excludeId) {
      const condition = excludeId ? and5(eq11(anakUsaha.slug, slug), sql19`${anakUsaha.id} != ${excludeId}`) : eq11(anakUsaha.slug, slug);
      const [row] = await db2.select({ id: anakUsaha.id }).from(anakUsaha).where(condition).limit(1);
      return row !== void 0;
    },
    async delete(id) {
      await db2.delete(anakUsaha).where(eq11(anakUsaha.id, id));
    },
    async list() {
      return db2.select().from(anakUsaha);
    },
    listWithProfile() {
      return listWithProfileJoined(db2);
    },
    findWithProfile(anakUsahaId) {
      return findWithProfileJoined(db2, anakUsahaId);
    },
    findProfile(anakUsahaId) {
      return findProfileJoined(db2, anakUsahaId);
    },
    async createProfile(input) {
      try {
        await db2.transaction(async (tx) => {
          await withTableWriteLock(tx, "anak_usaha_profile", async () => {
            const [maxRow] = await tx.select({ nextSortOrder: sql19`coalesce(max(${anakUsahaProfile.sortOrder}), -1) + 1` }).from(anakUsahaProfile);
            if (!maxRow) throw new Error("sortOrder aggregate returned no row");
            await tx.insert(anakUsahaProfile).values({
              anakUsahaId: input.anakUsahaId,
              logoMediaId: input.logoMediaId ?? null,
              backgroundColor: input.backgroundColor ?? null,
              description: input.description ?? null,
              kind: input.kind,
              links: input.links ?? [],
              sortOrder: maxRow.nextSortOrder
            });
          });
        });
      } catch (err) {
        if (isUniqueViolationOn(err, "PRIMARY")) throw profileAlreadyExistsError();
        if (isForeignKeyViolation(err)) {
          const constraint = violatedConstraint(err) ?? "";
          if (constraint.includes("logo_media_id")) throw invalidLogoMediaError();
          if (constraint.includes("anak_usaha_id")) throw unknownAnakUsahaError();
        }
        throw err;
      }
      const profile = await findProfileJoined(db2, input.anakUsahaId);
      if (!profile) throw new Error("anak usaha profile missing immediately after insert");
      return profile;
    },
    async updateProfile(anakUsahaId, input) {
      try {
        await db2.update(anakUsahaProfile).set({ ...stripUndefined(input), updatedAt: /* @__PURE__ */ new Date() }).where(eq11(anakUsahaProfile.anakUsahaId, anakUsahaId));
      } catch (err) {
        if (isForeignKeyViolation(err) && violatedConstraint(err)?.includes("logo_media_id")) {
          throw invalidLogoMediaError();
        }
        throw err;
      }
      const profile = await findProfileJoined(db2, anakUsahaId);
      if (!profile) throw new Error("anak usaha profile missing immediately after update");
      return profile;
    },
    async deleteProfile(anakUsahaId) {
      await db2.delete(anakUsahaProfile).where(eq11(anakUsahaProfile.anakUsahaId, anakUsahaId));
    },
    reorderProfiles(anakUsahaIds) {
      return db2.transaction(async (tx) => {
        return withTableWriteLock(tx, "anak_usaha_profile", async () => {
          const [rows] = await tx.execute(sql19`select anak_usaha_id as id from anak_usaha_profile`);
          const currentIds = rows.map((r) => r.id);
          if (!isExactIdSet(currentIds, anakUsahaIds)) throw invalidProfileSetError();
          for (const [index9, id] of anakUsahaIds.entries()) {
            await tx.update(anakUsahaProfile).set({ sortOrder: index9, updatedAt: /* @__PURE__ */ new Date() }).where(eq11(anakUsahaProfile.anakUsahaId, id));
          }
          return listWithProfileJoined(tx);
        });
      });
    }
  };
}

// src/modules/anak-usaha/anakUsaha.service.ts
function slugConflictError6() {
  return new AppError("That slug is already in use by another anak usaha entry", 409, "slug_conflict");
}
function notFoundError3() {
  return new AppError("Anak usaha not found", 404, "not_found");
}
function profileNotFoundError() {
  return new AppError("This anak usaha entry has no profile", 404, "profile_not_found");
}
function createAnakUsahaService(repository) {
  return {
    async create(name) {
      const slug = slugifyRequired(name, "Anak usaha name");
      if (await repository.slugExists(slug)) throw slugConflictError6();
      return repository.create({ name, slug });
    },
    async update(id, name) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError3();
      const slug = slugifyRequired(name, "Anak usaha name");
      if (slug !== existing.slug && await repository.slugExists(slug, id)) throw slugConflictError6();
      return repository.update(id, { name, slug });
    },
    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw notFoundError3();
      await repository.delete(id);
    },
    list() {
      return repository.list();
    },
    listWithProfile() {
      return repository.listWithProfile();
    },
    findWithProfile(anakUsahaId) {
      return repository.findWithProfile(anakUsahaId);
    },
    async createProfile(anakUsahaId, input) {
      return repository.createProfile({ anakUsahaId, ...input });
    },
    async updateProfile(anakUsahaId, input) {
      const existing = await repository.findProfile(anakUsahaId);
      if (!existing) throw profileNotFoundError();
      return repository.updateProfile(anakUsahaId, input);
    },
    async deleteProfile(anakUsahaId) {
      const existing = await repository.findProfile(anakUsahaId);
      if (!existing) throw profileNotFoundError();
      await repository.deleteProfile(anakUsahaId);
    },
    reorderProfiles(anakUsahaIds) {
      return repository.reorderProfiles(anakUsahaIds);
    }
  };
}

// src/modules/anak-usaha/anakUsaha.mapper.ts
function toAnakUsahaResponse(row) {
  return { id: row.id, name: row.name, slug: row.slug };
}
function toAnakUsahaAdminResponse(env, row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    profile: row.profile ? {
      logoUrl: row.profile.logoStoragePath ? publicUrlFor(env, row.profile.logoStoragePath) : null,
      backgroundColor: row.profile.backgroundColor,
      description: row.profile.description,
      kind: row.profile.kind,
      links: row.profile.links,
      sortOrder: row.profile.sortOrder,
      isActive: row.profile.isActive
    } : null
  };
}
function toPublicAnakUsaha(env, row) {
  if (!row.profile || !row.profile.isActive) {
    return { id: row.id, name: row.name, slug: row.slug };
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.profile.logoStoragePath ? publicUrlFor(env, row.profile.logoStoragePath) : null,
    backgroundColor: row.profile.backgroundColor,
    description: row.profile.description,
    kind: row.profile.kind,
    links: row.profile.links,
    sortOrder: row.profile.sortOrder
  };
}

// src/modules/anak-usaha/anakUsaha.controller.ts
function createAnakUsahaController(service, env) {
  return {
    /** Public listing — unchanged shape for entries without an active profile, so existing
     *  consumers (article tagging, the `/news` filter) are unaffected
     *  (specs/anak-usaha-presentation/spec.md - "Public anak usaha listing carries presentation
     *  fields without breaking existing consumers"). */
    async list(_req, res, next) {
      try {
        const rows = await service.listWithProfile();
        res.json({ success: true, data: rows.map((row) => toPublicAnakUsaha(env, row)) });
      } catch (err) {
        next(err);
      }
    },
    /** The admin presentation screen's listing — every entry, profile fields included even when
     *  inactive, so staff can edit a hidden profile. */
    async listAdmin(_req, res, next) {
      try {
        const rows = await service.listWithProfile();
        res.json({ success: true, data: rows.map((row) => toAnakUsahaAdminResponse(env, row)) });
      } catch (err) {
        next(err);
      }
    },
    async create(req, res, next) {
      try {
        const body = anakUsahaCreateRequestSchema.parse(req.body);
        const row = await service.create(body.name);
        res.status(201).json({ success: true, data: toAnakUsahaResponse(row) });
      } catch (err) {
        next(err);
      }
    },
    async update(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = anakUsahaUpdateRequestSchema.parse(req.body);
        const row = await service.update(id, body.name);
        res.json({ success: true, data: toAnakUsahaResponse(row) });
      } catch (err) {
        next(err);
      }
    },
    async remove(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        await service.delete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
    async createProfile(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = anakUsahaProfileCreateRequestSchema.parse(req.body);
        await service.createProfile(id, body);
        const row = await service.findWithProfile(id);
        if (!row) throw new Error("anak usaha missing immediately after profile create");
        res.status(201).json({ success: true, data: toAnakUsahaAdminResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },
    async updateProfile(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = anakUsahaProfileUpdateRequestSchema.parse(req.body);
        await service.updateProfile(id, body);
        const row = await service.findWithProfile(id);
        if (!row) throw new Error("anak usaha missing immediately after profile update");
        res.json({ success: true, data: toAnakUsahaAdminResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },
    async removeProfile(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        await service.deleteProfile(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
    async reorderProfiles(req, res, next) {
      try {
        const body = anakUsahaProfileReorderRequestSchema.parse(req.body);
        const rows = await service.reorderProfiles(body.anakUsahaIds);
        res.json({ success: true, data: rows.map((row) => toAnakUsahaAdminResponse(env, row)) });
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/anak-usaha/anakUsaha.routes.ts
function anakUsahaRoutes(db2, env) {
  const router = Router10();
  const service = createAnakUsahaService(createAnakUsahaRepository(db2));
  const controller = createAnakUsahaController(service, env);
  router.get("/", requirePublic(), controller.list);
  router.get("/admin", requirePermission("anak-usaha.manage"), controller.listAdmin);
  router.post("/", requirePermission("anak-usaha.manage"), controller.create);
  router.put("/profile/order", requirePermission("anak-usaha.manage"), controller.reorderProfiles);
  router.post("/:id/profile", requirePermission("anak-usaha.manage"), controller.createProfile);
  router.patch("/:id/profile", requirePermission("anak-usaha.manage"), controller.updateProfile);
  router.delete("/:id/profile", requirePermission("anak-usaha.manage"), controller.removeProfile);
  router.patch("/:id", requirePermission("anak-usaha.manage"), controller.update);
  router.delete("/:id", requirePermission("anak-usaha.manage"), controller.remove);
  return router;
}

// src/modules/curation/curation.routes.ts
import { Router as Router11 } from "express";

// src/modules/curation/curation.repository.ts
import { asc as asc3, eq as eq12 } from "drizzle-orm";

// src/lib/replaceOrdering.ts
import { sql as sql20 } from "drizzle-orm";
async function replaceOrdering(config) {
  const { db: db2, ids, referencedTable, orderingTable, deleteAll, insertOrdered, selectJoined: selectJoined2, onInvalidReference } = config;
  try {
    return await db2.transaction(async (tx) => {
      return withTableWriteLock(tx, orderingTable, async () => {
        if (ids.length > 0) {
          const [rows] = await tx.execute(sql20`
            select id from ${sql20.raw(referencedTable)}
            where id in (${sql20.join(
            ids.map((id) => sql20`${id}`),
            sql20`, `
          )})
          `);
          if (rows.length !== ids.length) throw onInvalidReference();
        }
        await deleteAll(tx);
        if (ids.length > 0) {
          await insertOrdered(tx, ids);
        }
        return selectJoined2(tx);
      });
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (isForeignKeyViolation(err)) throw onInvalidReference();
    throw err;
  }
}

// src/modules/curation/curation.repository.ts
function invalidArticleReferenceError() {
  return new AppError("One or more article ids do not exist", 400, "invalid_article_reference");
}
async function selectJoined(executor) {
  return executor.select({
    articleId: homeCuration.articleId,
    position: homeCuration.position,
    title: articles.title,
    slug: articles.slug,
    status: articles.status,
    publishedAt: articles.publishedAt
  }).from(homeCuration).innerJoin(articles, eq12(articles.id, homeCuration.articleId)).orderBy(asc3(homeCuration.position));
}
function createHomeCurationRepository(db2) {
  return {
    list() {
      return selectJoined(db2);
    },
    replace(articleIds) {
      return replaceOrdering({
        db: db2,
        ids: articleIds,
        referencedTable: "articles",
        orderingTable: "home_curation",
        deleteAll: (tx) => tx.delete(homeCuration),
        insertOrdered: (tx, ids) => tx.insert(homeCuration).values(ids.map((articleId, position) => ({ articleId, position }))),
        selectJoined,
        onInvalidReference: invalidArticleReferenceError
      });
    }
  };
}

// src/modules/curation/curation.mapper.ts
function toHomeCurationEntryResponse(entry, now) {
  return {
    article: { id: entry.articleId, title: entry.title, slug: entry.slug },
    status: entry.status,
    position: entry.position,
    isPubliclyVisible: isPubliclyVisible({ status: entry.status, publishedAt: entry.publishedAt }, now)
  };
}

// src/modules/curation/curation.service.ts
function createHomeCurationService(repository, revalidateEnv, logger) {
  return {
    async list() {
      const rows = await repository.list();
      const now = /* @__PURE__ */ new Date();
      return rows.map((row) => toHomeCurationEntryResponse(row, now));
    },
    async replace(articleIds) {
      const rows = await repository.replace(articleIds);
      await revalidateHomePath(revalidateEnv, logger);
      const now = /* @__PURE__ */ new Date();
      return rows.map((row) => toHomeCurationEntryResponse(row, now));
    }
  };
}

// src/modules/curation/homeFeed.service.ts
function createHomeFeedService(curationRepository, articleRepository, env) {
  return {
    async getFeed(limit) {
      const now = /* @__PURE__ */ new Date();
      const entries = await curationRepository.list();
      const visibleEntries = entries.filter((entry) => isPubliclyVisible({ status: entry.status, publishedAt: entry.publishedAt }, now)).slice(0, limit);
      const headIds = visibleEntries.map((entry) => entry.articleId);
      const headArticles = headIds.length > 0 ? await articleRepository.findManyPubliclyVisible(headIds, now) : [];
      const articleById = new Map(headArticles.map((article) => [article.id, article]));
      const orderedHead = visibleEntries.map((entry) => articleById.get(entry.articleId)).filter((article) => article !== void 0);
      const remaining = limit - orderedHead.length;
      const backfill = remaining > 0 ? await articleRepository.listPublished({
        limit: remaining,
        offset: 0,
        excludeIds: orderedHead.map((article) => article.id),
        now
      }) : [];
      return [...orderedHead, ...backfill].map((article) => toPublicCard(env, article));
    }
  };
}

// src/modules/curation/curation.controller.ts
function createHomeCurationController(service) {
  return {
    async list(_req, res, next) {
      try {
        const entries = await service.list();
        res.json({ success: true, data: entries });
      } catch (err) {
        next(err);
      }
    },
    async replace(req, res, next) {
      try {
        const body = homeCurationReplaceRequestSchema.parse(req.body);
        const entries = await service.replace(body.articleIds);
        res.json({ success: true, data: entries });
      } catch (err) {
        next(err);
      }
    }
  };
}
function createHomeFeedController(service) {
  return {
    async getFeed(req, res, next) {
      try {
        const query = homeFeedQuerySchema.parse(req.query);
        const feed = await service.getFeed(query.limit);
        res.json({ success: true, data: feed });
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/curation/curation.routes.ts
function curationRoutes(db2, env) {
  const router = Router11();
  const repository = createHomeCurationRepository(db2);
  const service = createHomeCurationService(repository, env, createLogger(env));
  const controller = createHomeCurationController(service);
  router.get("/", requirePermission("news.manage"), controller.list);
  router.put("/", requirePermission("news.manage"), controller.replace);
  return router;
}
function publicHomeRoutes(db2, env) {
  const router = Router11();
  const curationRepository = createHomeCurationRepository(db2);
  const articleRepository = createArticleRepository(db2);
  const service = createHomeFeedService(curationRepository, articleRepository, env);
  const controller = createHomeFeedController(service);
  router.get("/", requirePublic(), publicReadRateLimiter("public-home-feed"), controller.getFeed);
  return router;
}

// src/modules/partners/partner.routes.ts
import { Router as Router12 } from "express";

// src/modules/partners/partner.repository.ts
import { asc as asc4, eq as eq13, sql as sql21 } from "drizzle-orm";
function invalidPartnerSetError() {
  return new AppError(
    "partnerIds must name exactly the current set of partners, no more and no fewer",
    400,
    "invalid_partner_set"
  );
}
var SELECT_COLUMNS2 = {
  id: partners.id,
  name: partners.name,
  logoMediaId: partners.logoMediaId,
  logoStoragePath: media.storagePath,
  websiteUrl: partners.websiteUrl,
  sortOrder: partners.sortOrder,
  isActive: partners.isActive,
  createdAt: partners.createdAt,
  updatedAt: partners.updatedAt
};
function createPartnerRepository(db2) {
  async function findByIdJoined(id) {
    const [row] = await db2.select(SELECT_COLUMNS2).from(partners).innerJoin(media, eq13(media.id, partners.logoMediaId)).where(eq13(partners.id, id)).limit(1);
    return row ?? null;
  }
  async function listAllJoined() {
    return db2.select(SELECT_COLUMNS2).from(partners).innerJoin(media, eq13(media.id, partners.logoMediaId)).orderBy(asc4(partners.sortOrder), asc4(partners.createdAt));
  }
  async function listActiveJoined() {
    return db2.select(SELECT_COLUMNS2).from(partners).innerJoin(media, eq13(media.id, partners.logoMediaId)).where(eq13(partners.isActive, true)).orderBy(asc4(partners.sortOrder), asc4(partners.createdAt));
  }
  return {
    async create(input) {
      const id = await db2.transaction(async (tx) => {
        return withTableWriteLock(tx, "partners", async () => {
          const [maxRow] = await tx.select({ nextSortOrder: sql21`coalesce(max(${partners.sortOrder}), -1) + 1` }).from(partners);
          if (!maxRow) throw new Error("sortOrder aggregate returned no row");
          const newRowId = newId();
          await tx.insert(partners).values({
            id: newRowId,
            name: input.name,
            logoMediaId: input.logoMediaId,
            websiteUrl: input.websiteUrl ?? null,
            isActive: input.isActive ?? true,
            sortOrder: maxRow.nextSortOrder
          });
          return newRowId;
        });
      });
      const row = await findByIdJoined(id);
      if (!row) throw new Error("partner missing immediately after insert");
      return row;
    },
    findById: findByIdJoined,
    list() {
      return listAllJoined();
    },
    async update(id, input) {
      await db2.update(partners).set({ ...stripUndefined(input), updatedAt: /* @__PURE__ */ new Date() }).where(eq13(partners.id, id));
      const row = await findByIdJoined(id);
      if (!row) throw new Error("partner missing immediately after update");
      return row;
    },
    async delete(id) {
      await db2.delete(partners).where(eq13(partners.id, id));
    },
    reorder(partnerIds) {
      return replaceSortOrder({
        db: db2,
        ids: partnerIds,
        table: "partners",
        updateSortOrder: (tx, id, sortOrder) => tx.update(partners).set({ sortOrder, updatedAt: /* @__PURE__ */ new Date() }).where(eq13(partners.id, id)),
        selectJoined: (tx) => tx.select(SELECT_COLUMNS2).from(partners).innerJoin(media, eq13(media.id, partners.logoMediaId)).orderBy(asc4(partners.sortOrder), asc4(partners.createdAt)),
        onInvalidSet: invalidPartnerSetError
      });
    },
    listActiveOrdered() {
      return listActiveJoined();
    }
  };
}

// src/modules/partners/partner.service.ts
function invalidLogoMediaError2() {
  return new AppError("logoMediaId does not reference an existing media item", 400, "invalid_logo_media");
}
function createPartnerService(repository, revalidateEnv, logger) {
  return {
    async create(input) {
      let row;
      try {
        row = await repository.create(input);
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidLogoMediaError2();
        throw err;
      }
      await revalidateHomePath(revalidateEnv, logger);
      return row;
    },
    list() {
      return repository.list();
    },
    async update(id, input) {
      const existing = await repository.findById(id);
      if (!existing) throw new AppError("Partner not found", 404, "not_found");
      let updated;
      try {
        updated = await repository.update(id, input);
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidLogoMediaError2();
        throw err;
      }
      await revalidateHomePath(revalidateEnv, logger);
      return updated;
    },
    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw new AppError("Partner not found", 404, "not_found");
      await repository.delete(id);
      await revalidateHomePath(revalidateEnv, logger);
    },
    async reorder(partnerIds) {
      const rows = await repository.reorder(partnerIds);
      await revalidateHomePath(revalidateEnv, logger);
      return rows;
    }
  };
}
function createPublicPartnerService(repository) {
  return {
    listPublic() {
      return repository.listActiveOrdered();
    }
  };
}

// src/modules/partners/partner.mapper.ts
function toPartnerResponse(env, row) {
  return {
    id: row.id,
    name: row.name,
    logoUrl: publicUrlFor(env, row.logoStoragePath),
    websiteUrl: row.websiteUrl,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
function toPublicPartner(env, row) {
  return {
    name: row.name,
    logoUrl: publicUrlFor(env, row.logoStoragePath),
    websiteUrl: row.websiteUrl
  };
}

// src/modules/partners/partner.controller.ts
function createPartnerController(service, env) {
  return {
    async create(req, res, next) {
      try {
        const body = partnerCreateRequestSchema.parse(req.body);
        const row = await service.create(body);
        res.status(201).json({ success: true, data: toPartnerResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },
    async list(_req, res, next) {
      try {
        const rows = await service.list();
        res.json({ success: true, data: rows.map((row) => toPartnerResponse(env, row)) });
      } catch (err) {
        next(err);
      }
    },
    async update(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = partnerUpdateRequestSchema.parse(req.body);
        const row = await service.update(id, body);
        res.json({ success: true, data: toPartnerResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },
    async remove(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        await service.delete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
    async reorder(req, res, next) {
      try {
        const body = partnerReorderRequestSchema.parse(req.body);
        const rows = await service.reorder(body.partnerIds);
        res.json({ success: true, data: rows.map((row) => toPartnerResponse(env, row)) });
      } catch (err) {
        next(err);
      }
    }
  };
}
function createPublicPartnerController(service, env) {
  return {
    async list(_req, res, next) {
      try {
        const rows = await service.listPublic();
        res.json({ success: true, data: rows.map((row) => toPublicPartner(env, row)) });
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/partners/partner.routes.ts
function partnerRoutes(db2, env) {
  const router = Router12();
  const repository = createPartnerRepository(db2);
  const service = createPartnerService(repository, env, createLogger(env));
  const controller = createPartnerController(service, env);
  router.post("/", requirePermission("settings.manage"), controller.create);
  router.get("/", requirePermission("settings.manage"), controller.list);
  router.put("/order", requirePermission("settings.manage"), controller.reorder);
  router.patch("/:id", requirePermission("settings.manage"), controller.update);
  router.delete("/:id", requirePermission("settings.manage"), controller.remove);
  return router;
}
function publicPartnerRoutes(db2, env) {
  const router = Router12();
  const repository = createPartnerRepository(db2);
  const service = createPublicPartnerService(repository);
  const controller = createPublicPartnerController(service, env);
  router.get("/", requirePublic(), publicReadRateLimiter("public-partners"), controller.list);
  return router;
}

// src/modules/guidePicks/guidePick.routes.ts
import { Router as Router13 } from "express";

// src/modules/guidePicks/guidePick.repository.ts
import { asc as asc5, eq as eq14, inArray as inArray3, sql as sql22 } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
function invalidGuidePickSetError() {
  return new AppError(
    "guidePickIds must name exactly the current set of guide picks, no more and no fewer",
    400,
    "invalid_guide_pick_set"
  );
}
function photoMustBeImageError() {
  return new AppError("photoMediaId must reference an image, not a video", 400, "photo_must_be_image");
}
function videoMustBeVideoError() {
  return new AppError("videoMediaId must reference a video, not an image", 400, "video_must_be_video");
}
var videoMedia = alias(media, "video_media");
var SELECT_COLUMNS3 = {
  id: guidePicks.id,
  city: guidePicks.city,
  place: guidePicks.place,
  description: guidePicks.description,
  photoMediaId: guidePicks.photoMediaId,
  photoStoragePath: media.storagePath,
  videoMediaId: guidePicks.videoMediaId,
  videoStoragePath: videoMedia.storagePath,
  sortOrder: guidePicks.sortOrder,
  isActive: guidePicks.isActive,
  createdAt: guidePicks.createdAt,
  updatedAt: guidePicks.updatedAt
};
async function assertMediaKinds(db2, input) {
  const ids = [input.photoMediaId, input.videoMediaId].filter((id) => id !== void 0);
  if (ids.length === 0) return;
  const rows = await db2.select({ id: media.id, mime: media.mime }).from(media).where(inArray3(media.id, ids));
  const mimeById = new Map(rows.map((row) => [row.id, row.mime]));
  if (input.photoMediaId !== void 0) {
    const mime = mimeById.get(input.photoMediaId);
    if (mime !== void 0 && isVideoMimeType(mime)) throw photoMustBeImageError();
  }
  if (input.videoMediaId !== void 0) {
    const mime = mimeById.get(input.videoMediaId);
    if (mime !== void 0 && !isVideoMimeType(mime)) throw videoMustBeVideoError();
  }
}
function createGuidePickRepository(db2) {
  async function findByIdJoined(id) {
    const [row] = await db2.select(SELECT_COLUMNS3).from(guidePicks).innerJoin(media, eq14(media.id, guidePicks.photoMediaId)).innerJoin(videoMedia, eq14(videoMedia.id, guidePicks.videoMediaId)).where(eq14(guidePicks.id, id)).limit(1);
    return row ?? null;
  }
  async function listAllJoined() {
    return db2.select(SELECT_COLUMNS3).from(guidePicks).innerJoin(media, eq14(media.id, guidePicks.photoMediaId)).innerJoin(videoMedia, eq14(videoMedia.id, guidePicks.videoMediaId)).orderBy(asc5(guidePicks.sortOrder), asc5(guidePicks.createdAt));
  }
  async function listActiveJoined() {
    return db2.select(SELECT_COLUMNS3).from(guidePicks).innerJoin(media, eq14(media.id, guidePicks.photoMediaId)).innerJoin(videoMedia, eq14(videoMedia.id, guidePicks.videoMediaId)).where(eq14(guidePicks.isActive, true)).orderBy(asc5(guidePicks.sortOrder), asc5(guidePicks.createdAt));
  }
  return {
    async create(input) {
      await assertMediaKinds(db2, input);
      const id = await db2.transaction(async (tx) => {
        return withTableWriteLock(tx, "guide_picks", async () => {
          const [maxRow] = await tx.select({ nextSortOrder: sql22`coalesce(max(${guidePicks.sortOrder}), -1) + 1` }).from(guidePicks);
          if (!maxRow) throw new Error("sortOrder aggregate returned no row");
          const newRowId = newId();
          await tx.insert(guidePicks).values({
            id: newRowId,
            city: input.city,
            place: input.place,
            description: input.description,
            photoMediaId: input.photoMediaId,
            videoMediaId: input.videoMediaId,
            isActive: input.isActive ?? true,
            sortOrder: maxRow.nextSortOrder
          });
          return newRowId;
        });
      });
      const row = await findByIdJoined(id);
      if (!row) throw new Error("guide pick missing immediately after insert");
      return row;
    },
    findById: findByIdJoined,
    list() {
      return listAllJoined();
    },
    async update(id, input) {
      await assertMediaKinds(db2, input);
      await db2.update(guidePicks).set({ ...stripUndefined(input), updatedAt: /* @__PURE__ */ new Date() }).where(eq14(guidePicks.id, id));
      const row = await findByIdJoined(id);
      if (!row) throw new Error("guide pick missing immediately after update");
      return row;
    },
    async delete(id) {
      await db2.delete(guidePicks).where(eq14(guidePicks.id, id));
    },
    reorder(guidePickIds) {
      return replaceSortOrder({
        db: db2,
        ids: guidePickIds,
        table: "guide_picks",
        updateSortOrder: (tx, id, sortOrder) => tx.update(guidePicks).set({ sortOrder, updatedAt: /* @__PURE__ */ new Date() }).where(eq14(guidePicks.id, id)),
        selectJoined: (tx) => tx.select(SELECT_COLUMNS3).from(guidePicks).innerJoin(media, eq14(media.id, guidePicks.photoMediaId)).innerJoin(videoMedia, eq14(videoMedia.id, guidePicks.videoMediaId)).orderBy(asc5(guidePicks.sortOrder), asc5(guidePicks.createdAt)),
        onInvalidSet: invalidGuidePickSetError
      });
    },
    listActiveOrdered() {
      return listActiveJoined();
    }
  };
}

// src/modules/guidePicks/guidePick.service.ts
function invalidPhotoMediaError() {
  return new AppError("photoMediaId does not reference an existing media item", 400, "invalid_photo_media");
}
function invalidVideoMediaError() {
  return new AppError("videoMediaId does not reference an existing media item", 400, "invalid_video_media");
}
function invalidMediaReferenceError(err) {
  return violatedConstraint(err)?.includes("video_media_id") ? invalidVideoMediaError() : invalidPhotoMediaError();
}
function createGuidePickService(repository, revalidateEnv, logger) {
  return {
    async create(input) {
      let row;
      try {
        row = await repository.create(input);
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidMediaReferenceError(err);
        throw err;
      }
      await revalidateHomePath(revalidateEnv, logger);
      return row;
    },
    list() {
      return repository.list();
    },
    async update(id, input) {
      const existing = await repository.findById(id);
      if (!existing) throw new AppError("Guide pick not found", 404, "not_found");
      let updated;
      try {
        updated = await repository.update(id, input);
      } catch (err) {
        if (isForeignKeyViolation(err)) throw invalidMediaReferenceError(err);
        throw err;
      }
      await revalidateHomePath(revalidateEnv, logger);
      return updated;
    },
    async delete(id) {
      const existing = await repository.findById(id);
      if (!existing) throw new AppError("Guide pick not found", 404, "not_found");
      await repository.delete(id);
      await revalidateHomePath(revalidateEnv, logger);
    },
    async reorder(guidePickIds) {
      const rows = await repository.reorder(guidePickIds);
      await revalidateHomePath(revalidateEnv, logger);
      return rows;
    }
  };
}
function createPublicGuidePickService(repository) {
  return {
    listPublic() {
      return repository.listActiveOrdered();
    }
  };
}

// src/modules/guidePicks/guidePick.mapper.ts
function toGuidePickResponse(env, row) {
  return {
    id: row.id,
    city: row.city,
    place: row.place,
    description: row.description,
    photoUrl: publicUrlFor(env, row.photoStoragePath),
    videoUrl: publicUrlFor(env, row.videoStoragePath),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
function toPublicGuidePick(env, row) {
  return {
    city: row.city,
    place: row.place,
    description: row.description,
    photoUrl: publicUrlFor(env, row.photoStoragePath),
    videoUrl: publicUrlFor(env, row.videoStoragePath)
  };
}

// src/modules/guidePicks/guidePick.controller.ts
function createGuidePickController(service, env) {
  return {
    async create(req, res, next) {
      try {
        const body = guidePickCreateRequestSchema.parse(req.body);
        const row = await service.create(body);
        res.status(201).json({ success: true, data: toGuidePickResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },
    async list(_req, res, next) {
      try {
        const rows = await service.list();
        res.json({ success: true, data: rows.map((row) => toGuidePickResponse(env, row)) });
      } catch (err) {
        next(err);
      }
    },
    async update(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = guidePickUpdateRequestSchema.parse(req.body);
        const row = await service.update(id, body);
        res.json({ success: true, data: toGuidePickResponse(env, row) });
      } catch (err) {
        next(err);
      }
    },
    async remove(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        await service.delete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
    async reorder(req, res, next) {
      try {
        const body = guidePickReorderRequestSchema.parse(req.body);
        const rows = await service.reorder(body.guidePickIds);
        res.json({ success: true, data: rows.map((row) => toGuidePickResponse(env, row)) });
      } catch (err) {
        next(err);
      }
    }
  };
}
function createPublicGuidePickController(service, env) {
  return {
    async list(_req, res, next) {
      try {
        const rows = await service.listPublic();
        res.json({ success: true, data: rows.map((row) => toPublicGuidePick(env, row)) });
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/guidePicks/guidePick.routes.ts
function guidePickRoutes(db2, env) {
  const router = Router13();
  const repository = createGuidePickRepository(db2);
  const service = createGuidePickService(repository, env, createLogger(env));
  const controller = createGuidePickController(service, env);
  router.post("/", requirePermission("news.manage"), controller.create);
  router.get("/", requirePermission("news.manage"), controller.list);
  router.put("/order", requirePermission("news.manage"), controller.reorder);
  router.patch("/:id", requirePermission("news.manage"), controller.update);
  router.delete("/:id", requirePermission("news.manage"), controller.remove);
  return router;
}
function publicGuidePickRoutes(db2, env) {
  const router = Router13();
  const repository = createGuidePickRepository(db2);
  const service = createPublicGuidePickService(repository);
  const controller = createPublicGuidePickController(service, env);
  router.get("/", requirePublic(), publicReadRateLimiter("public-guide-picks"), controller.list);
  return router;
}

// src/modules/engagement/engagement.routes.ts
import { Router as Router14 } from "express";

// src/modules/engagement/engagement.repository.ts
import { and as and6, count as count2, desc as desc2, eq as eq15, sql as sql23 } from "drizzle-orm";
var COMMENT_SELECT_COLUMNS = {
  id: comments.id,
  body: comments.body,
  authorName: readers.name,
  authorAvatarUrl: readers.avatarUrl,
  createdAt: comments.createdAt
};
function visibleComments(articleId) {
  return and6(eq15(comments.articleId, articleId), eq15(comments.status, "visible"));
}
function createEngagementRepository(db2) {
  return {
    async isArticleEngageable(articleId, now) {
      const [row] = await db2.select({ status: articles.status, publishedAt: articles.publishedAt }).from(articles).where(eq15(articles.id, articleId)).limit(1);
      return row !== void 0 && isPubliclyVisible(row, now);
    },
    async recordView(articleId, visitorHash) {
      return db2.transaction(async (tx) => {
        const [seen] = await tx.execute(sql23`
          insert ignore into view_seen (article_id, visitor_hash, date)
          values (${articleId}, ${visitorHash}, curdate())
        `);
        const uniqueDelta = seen.affectedRows > 0 ? 1 : 0;
        await tx.execute(sql23`
          insert into article_views_daily (article_id, date, views, unique_views)
          values (${articleId}, curdate(), 1, ${uniqueDelta})
          on duplicate key update
            views        = views + 1,
            unique_views = unique_views + values(unique_views)
        `);
        return uniqueDelta === 1;
      });
    },
    async toggleLike(articleId, readerId) {
      const [deleted] = await db2.delete(likes).where(and6(eq15(likes.readerId, readerId), eq15(likes.articleId, articleId)));
      if (deleted.affectedRows > 0) return false;
      try {
        await db2.insert(likes).values({ id: newId(), readerId, articleId });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
      return true;
    },
    async hasLiked(articleId, readerId) {
      const [row] = await db2.select({ id: likes.id }).from(likes).where(and6(eq15(likes.readerId, readerId), eq15(likes.articleId, articleId))).limit(1);
      return row !== void 0;
    },
    async getCounts(articleId) {
      const [viewRows, likeRows, commentRows] = await Promise.all([
        db2.execute(sql23`
          select coalesce(sum(views), 0) as views
          from article_views_daily
          where article_id = ${articleId}
        `),
        db2.select({ value: count2() }).from(likes).where(eq15(likes.articleId, articleId)),
        db2.select({ value: count2() }).from(comments).where(visibleComments(articleId))
      ]);
      const [viewSumRows] = viewRows;
      return {
        // `sum()` of an `integer` column comes back as `bigint`; `supportBigNumbers` in
        // `packages/db/src/client.ts` avoids silent precision loss the same way `node-postgres`
        // returning it as a string did — `Number(...)` here rather than trusting the column type.
        viewCount: Number(viewSumRows[0]?.views ?? 0),
        likeCount: likeRows[0]?.value ?? 0,
        commentCount: commentRows[0]?.value ?? 0
      };
    },
    async createComment(articleId, readerId, body) {
      const id = newId();
      await db2.insert(comments).values({ id, articleId, readerId, body });
      const [row] = await db2.select(COMMENT_SELECT_COLUMNS).from(comments).innerJoin(readers, eq15(readers.id, comments.readerId)).where(eq15(comments.id, id)).limit(1);
      if (!row) throw new Error("comment missing immediately after insert");
      return row;
    },
    listComments(articleId, limit, offset) {
      return db2.select(COMMENT_SELECT_COLUMNS).from(comments).innerJoin(readers, eq15(readers.id, comments.readerId)).where(visibleComments(articleId)).orderBy(desc2(comments.createdAt), desc2(comments.id)).limit(limit).offset(offset);
    }
  };
}

// src/modules/engagement/engagement.mapper.ts
function toCommentResponse(row) {
  return {
    id: row.id,
    body: row.body,
    authorName: row.authorName,
    authorAvatarUrl: row.authorAvatarUrl,
    createdAt: row.createdAt.toISOString()
  };
}
function toArticleEngagement(counts, likedByReader) {
  return {
    viewCount: counts.viewCount,
    likeCount: counts.likeCount,
    commentCount: counts.commentCount,
    likedByReader
  };
}

// src/modules/engagement/engagement.service.ts
function articleNotFoundError() {
  return new AppError("Article not found", 404, "not_found");
}
function createEngagementService(repository) {
  async function assertEngageable(articleId) {
    if (!await repository.isArticleEngageable(articleId, /* @__PURE__ */ new Date())) {
      throw articleNotFoundError();
    }
  }
  return {
    async recordView(articleId, visitorHash) {
      await assertEngageable(articleId);
      await repository.recordView(articleId, visitorHash);
    },
    async toggleLike(articleId, readerId) {
      await assertEngageable(articleId);
      const liked = await repository.toggleLike(articleId, readerId);
      const { likeCount } = await repository.getCounts(articleId);
      return { liked, likeCount };
    },
    async getSummary(articleId, readerId) {
      await assertEngageable(articleId);
      const [counts, likedByReader] = await Promise.all([
        repository.getCounts(articleId),
        // An anonymous caller is not an error here — they simply have no like to report
        // (specs/article-engagement/spec.md - "An anonymous caller receives counts").
        readerId === void 0 ? Promise.resolve(false) : repository.hasLiked(articleId, readerId)
      ]);
      return toArticleEngagement(counts, likedByReader);
    },
    async listComments(articleId, limit, offset) {
      await assertEngageable(articleId);
      const rows = await repository.listComments(articleId, limit, offset);
      return rows.map(toCommentResponse);
    },
    async createComment(articleId, readerId, body) {
      await assertEngageable(articleId);
      const row = await repository.createComment(articleId, readerId, body);
      return toCommentResponse(row);
    }
  };
}

// src/modules/engagement/engagement.controller.ts
function requireReaderId(req) {
  const subjectId = req.auth?.subjectType === "reader" ? req.auth.subjectId : void 0;
  if (!subjectId) throw new AppError("Reader session required", 401, "unauthenticated");
  return subjectId;
}
function optionalReaderId(req) {
  return req.auth?.subjectType === "reader" ? req.auth.subjectId : void 0;
}
function createEngagementController(service, env) {
  return {
    async recordView(req, res, next) {
      try {
        const articleId = requireUuidParam(req, "id");
        const visitorHash = hmacSha256Hex(clientIp(req), env.SESSION_SECRET);
        await service.recordView(articleId, visitorHash);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
    async getSummary(req, res, next) {
      try {
        const articleId = requireUuidParam(req, "id");
        const data = await service.getSummary(articleId, optionalReaderId(req));
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
    async toggleLike(req, res, next) {
      try {
        const articleId = requireUuidParam(req, "id");
        const data = await service.toggleLike(articleId, requireReaderId(req));
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
    async listComments(req, res, next) {
      try {
        const articleId = requireUuidParam(req, "id");
        const { limit, offset } = commentListQuerySchema.parse(req.query);
        const data = await service.listComments(articleId, limit, offset);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
    async createComment(req, res, next) {
      try {
        const articleId = requireUuidParam(req, "id");
        const { body } = commentCreateRequestSchema.parse(req.body);
        const data = await service.createComment(articleId, requireReaderId(req), body);
        res.status(201).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/engagement/engagement.routes.ts
function publicEngagementRoutes(db2, env) {
  const router = Router14();
  const repository = createEngagementRepository(db2);
  const service = createEngagementService(repository);
  const controller = createEngagementController(service, env);
  router.post("/:id/view", requirePublic(), viewRateLimiter(), controller.recordView);
  router.get("/:id/engagement", requirePublic(), publicReadRateLimiter("public-engagement"), controller.getSummary);
  router.get("/:id/comments", requirePublic(), publicReadRateLimiter("public-comments"), controller.listComments);
  router.post("/:id/like", requireReader({ createsContent: false }), likeRateLimiter(), controller.toggleLike);
  router.post("/:id/comments", requireReader(), commentRateLimiter(), controller.createComment);
  return router;
}

// src/modules/moderation/moderation.routes.ts
import { Router as Router15 } from "express";

// src/modules/moderation/moderation.repository.ts
import { and as and7, asc as asc6, count as count3, desc as desc3, eq as eq16, gt, isNull as isNull2, like, or as or2, sql as sql24 } from "drizzle-orm";
function reportAggregateSubquery(db2) {
  return db2.select({
    commentId: commentReports.commentId,
    // `.mapWith(Number)` because `count(*)` is `bigint`, and the driver returns a `bigint`
    // aggregate as a string to avoid precision loss (`supportBigNumbers` in
    // `packages/db/src/client.ts`) — every other aggregate in this repo coerces the same way
    // (`analytics.repository.ts`, and `commentCount` in `readerRowSelect` below).
    openReportCount: sql24`count(*)`.mapWith(Number).as("open_report_count"),
    reportReasons: sql24`group_concat(distinct ${commentReports.reason} separator ',')`.mapWith(toReportReasons).as("report_reasons")
  }).from(commentReports).where(eq16(commentReports.isOpen, true)).groupBy(commentReports.commentId).as("report_agg");
}
function toReportReasons(raw) {
  if (raw === null || raw === "") return [];
  return raw.split(",");
}
function commentQueueSelectColumns(reportAgg) {
  return {
    id: comments.id,
    body: comments.body,
    status: comments.status,
    articleId: comments.articleId,
    articleTitle: articles.title,
    articleSlug: articles.slug,
    authorName: readers.name,
    createdAt: comments.createdAt,
    // Projected directly, not re-wrapped in a `sql` template — wrapping an already-decoded
    // column back in `sql\`${...}\`` discards the decoder (`.mapWith(Number)` above) that makes
    // it a `number` instead of the driver's raw string.
    openReportCount: reportAgg.openReportCount,
    reportReasons: reportAgg.reportReasons
  };
}
function commentQueueBaseQuery(db2, reportAgg) {
  return db2.select(commentQueueSelectColumns(reportAgg)).from(comments).innerJoin(articles, eq16(articles.id, comments.articleId)).innerJoin(readers, eq16(readers.id, comments.readerId)).leftJoin(reportAgg, eq16(reportAgg.commentId, comments.id));
}
function readerRowSelect(db2, condition) {
  const commentCountSubquery = db2.select({ readerId: comments.readerId, commentCount: count3().as("comment_count") }).from(comments).groupBy(comments.readerId).as("comment_counts");
  return db2.select({
    id: readers.id,
    name: readers.name,
    email: readers.email,
    avatarUrl: readers.avatarUrl,
    status: readers.status,
    mutedUntil: readers.mutedUntil,
    commentCount: sql24`coalesce(${commentCountSubquery.commentCount}, 0)`.mapWith(Number),
    createdAt: readers.createdAt
  }).from(readers).leftJoin(commentCountSubquery, eq16(commentCountSubquery.readerId, readers.id)).where(condition);
}
function createModerationRepository(db2) {
  async function commentQueueRow(executor, id) {
    const reportAgg = reportAggregateSubquery(executor);
    const [row] = await commentQueueBaseQuery(executor, reportAgg).where(eq16(comments.id, id)).limit(1);
    return row ?? null;
  }
  async function insertActionLog(tx, targetType, targetId, entries) {
    if (entries.length === 0) return;
    await tx.insert(moderationActions).values(
      entries.map((entry) => ({
        actorId: entry.actorId,
        targetType,
        targetId,
        action: entry.action,
        reason: entry.reason
      }))
    );
  }
  async function resolveOpenReports(tx, commentId, resolvedBy) {
    const [result] = await tx.update(commentReports).set({ resolvedAt: /* @__PURE__ */ new Date(), resolvedBy }).where(and7(eq16(commentReports.commentId, commentId), isNull2(commentReports.resolvedAt)));
    return result.affectedRows;
  }
  return {
    findCommentById: (id) => commentQueueRow(db2, id),
    async listCommentQueue(filter) {
      const reportAgg = reportAggregateSubquery(db2);
      const conditions = [];
      if (filter.status === "visible" || filter.status === "removed") {
        conditions.push(eq16(comments.status, filter.status));
      }
      if (filter.cursor) {
        conditions.push(
          sql24`(${comments.createdAt}, ${comments.id}) < (${filter.cursor.createdAt}, ${filter.cursor.id})`
        );
      }
      if (filter.status === "reported") {
        conditions.push(gt(sql24`coalesce(${reportAgg.openReportCount}, 0)`, 0));
      }
      const rows = await commentQueueBaseQuery(db2, reportAgg).where(conditions.length > 0 ? and7(...conditions) : void 0).orderBy(desc3(comments.createdAt), desc3(comments.id)).limit(filter.limit + 1);
      const hasMore = rows.length > filter.limit;
      const items = hasMore ? rows.slice(0, filter.limit) : rows;
      const last = items[items.length - 1];
      return {
        items,
        nextCursorSource: hasMore && last ? { createdAt: last.createdAt, id: last.id } : void 0
      };
    },
    async setCommentStatus(id, status, logEntry) {
      return db2.transaction(async (tx) => {
        const [updateResult] = await tx.update(comments).set({ status }).where(eq16(comments.id, id));
        if (updateResult.affectedRows === 0) throw new Error("comment missing immediately before moderation update");
        if (status === "removed") {
          await resolveOpenReports(tx, id, logEntry.actorId);
        }
        await insertActionLog(tx, "comment", id, [logEntry]);
        const row = await commentQueueRow(tx, id);
        if (!row) throw new Error("comment missing immediately after moderation update");
        return row;
      });
    },
    async dismissReports(commentId, resolvedBy, logEntry) {
      return db2.transaction(async (tx) => {
        const resolvedCount = await resolveOpenReports(tx, commentId, resolvedBy);
        if (resolvedCount === 0) return null;
        await insertActionLog(tx, "comment", commentId, [logEntry]);
        const row = await commentQueueRow(tx, commentId);
        if (!row) throw new Error("comment missing immediately after dismissing its reports");
        return row;
      });
    },
    async createReport(commentId, reporterId, reason, note) {
      const id = newId();
      await db2.insert(commentReports).values({ id, commentId, reporterId, reason, note });
      const [row] = await db2.select({
        id: commentReports.id,
        commentId: commentReports.commentId,
        reason: commentReports.reason,
        note: commentReports.note,
        createdAt: commentReports.createdAt
      }).from(commentReports).where(eq16(commentReports.id, id)).limit(1);
      if (!row) throw new Error("report missing immediately after insert");
      return row;
    },
    async findReaderById(id) {
      const [row] = await db2.select({ id: readers.id, status: readers.status, mutedUntil: readers.mutedUntil }).from(readers).where(eq16(readers.id, id)).limit(1);
      return row ?? null;
    },
    async getReaderRow(id) {
      const [row] = await readerRowSelect(db2, eq16(readers.id, id));
      return row ?? null;
    },
    listReaders(filter) {
      const conditions = [];
      if (filter.status !== "all") conditions.push(eq16(readers.status, filter.status));
      if (filter.search) {
        const escaped = filter.search.replace(/[\\%_]/g, "\\$&");
        const term = `%${escaped}%`;
        conditions.push(or2(like(readers.name, term), like(readers.email, term)));
      }
      return readerRowSelect(db2, conditions.length > 0 ? and7(...conditions) : void 0).orderBy(asc6(readers.name)).limit(filter.limit).offset(filter.offset);
    },
    async updateReader(id, patch, logEntries) {
      return db2.transaction(async (tx) => {
        const [updateResult] = await tx.update(readers).set(patch).where(eq16(readers.id, id));
        if (updateResult.affectedRows === 0) throw new Error("reader missing immediately before moderation update");
        await insertActionLog(tx, "reader", id, logEntries);
        const [row] = await readerRowSelect(tx, eq16(readers.id, id));
        if (!row) throw new Error("reader missing immediately after moderation update");
        return row;
      });
    },
    listActionsForTarget(targetType, targetId) {
      return db2.select({
        id: moderationActions.id,
        actorName: users.name,
        targetType: moderationActions.targetType,
        targetId: moderationActions.targetId,
        action: moderationActions.action,
        reason: moderationActions.reason,
        createdAt: moderationActions.createdAt
      }).from(moderationActions).innerJoin(users, eq16(users.id, moderationActions.actorId)).where(and7(eq16(moderationActions.targetType, targetType), eq16(moderationActions.targetId, targetId))).orderBy(desc3(moderationActions.createdAt));
    }
  };
}

// src/modules/moderation/moderation.mapper.ts
function toCommentQueueRow(row) {
  return {
    id: row.id,
    body: row.body,
    status: row.status,
    articleId: row.articleId,
    articleTitle: row.articleTitle,
    articleSlug: row.articleSlug,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
    ...row.openReportCount && row.openReportCount > 0 ? { openReportCount: row.openReportCount } : {},
    ...row.reportReasons && row.reportReasons.length > 0 ? { reportReasons: row.reportReasons } : {}
  };
}
function toReaderQueueRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    status: row.status,
    mutedUntil: row.mutedUntil ? row.mutedUntil.toISOString() : null,
    commentCount: row.commentCount,
    createdAt: row.createdAt.toISOString()
  };
}
function toCommentReportResponse(row) {
  return {
    id: row.id,
    commentId: row.commentId,
    reason: row.reason,
    note: row.note,
    createdAt: row.createdAt.toISOString()
  };
}

// src/modules/moderation/moderation.service.ts
function commentNotFoundError() {
  return new AppError("Comment not found", 404, "not_found");
}
function readerNotFoundError() {
  return new AppError("Reader not found", 404, "not_found");
}
function noOpenReportsError() {
  return new AppError("This comment has no open reports to dismiss", 404, "not_found");
}
function alreadyReportedError() {
  return new AppError("You have already reported this comment", 409, "already_reported");
}
function encodeCursor(source) {
  return Buffer.from(JSON.stringify({ createdAt: source.createdAt.toISOString(), id: source.id })).toString(
    "base64url"
  );
}
function invalidCursorError() {
  return new AppError("Invalid cursor", 400, "invalid_cursor");
}
function decodeCursor(cursor) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalidCursorError();
  }
  if (typeof parsed !== "object" || parsed === null || typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
    throw invalidCursorError();
  }
  const { createdAt, id } = parsed;
  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime())) throw invalidCursorError();
  return { createdAt: parsedDate, id };
}
function invalidMuteDurationError() {
  return new AppError("mutedUntil must be a future point in time", 400, "invalid_mute_duration");
}
function planReaderModeration(existing, request, actorId, now) {
  const patch = {};
  const logEntries = [];
  const reason = request.reason ?? null;
  if (request.status !== void 0 && request.status !== existing.status) {
    patch.status = request.status;
    const action = request.status === "banned" ? "reader_banned" : "reader_unbanned";
    logEntries.push({ actorId, action, reason });
  }
  if (request.mutedUntil !== void 0) {
    const requested = request.mutedUntil === null ? null : new Date(request.mutedUntil);
    if (requested !== null && requested.getTime() <= now.getTime()) throw invalidMuteDurationError();
    const currentlyMuted = existing.mutedUntil !== null && existing.mutedUntil.getTime() > now.getTime();
    const willBeMuted = requested !== null;
    const changesActiveMute = willBeMuted !== currentlyMuted || willBeMuted && requested.getTime() !== existing.mutedUntil?.getTime();
    if (changesActiveMute) {
      patch.mutedUntil = requested;
      const action = willBeMuted ? "reader_muted" : "reader_unmuted";
      logEntries.push({ actorId, action, reason });
    }
  }
  return { patch, logEntries };
}
function createModerationService(repository) {
  return {
    async listCommentQueue(query) {
      const cursor = query.cursor ? decodeCursor(query.cursor) : void 0;
      const page = await repository.listCommentQueue({ status: query.status, cursor, limit: query.limit });
      return {
        items: page.items.map(toCommentQueueRow),
        nextCursor: page.nextCursorSource ? encodeCursor(page.nextCursorSource) : null
      };
    },
    async moderateComment(id, request, actorId) {
      const existing = await repository.findCommentById(id);
      if (!existing) throw commentNotFoundError();
      const action = request.status === "removed" ? "comment_removed" : "comment_restored";
      const updated = await repository.setCommentStatus(id, request.status, {
        actorId,
        action,
        reason: request.reason ?? null
      });
      return toCommentQueueRow(updated);
    },
    async dismissCommentReports(id, reason, actorId) {
      const existing = await repository.findCommentById(id);
      if (!existing) throw commentNotFoundError();
      const updated = await repository.dismissReports(id, actorId, {
        actorId,
        action: "comment_reports_dismissed",
        reason: reason ?? null
      });
      if (!updated) throw noOpenReportsError();
      return toCommentQueueRow(updated);
    },
    async fileReport(commentId, reporterId, reason, note) {
      const existing = await repository.findCommentById(commentId);
      if (!existing) throw commentNotFoundError();
      try {
        const created = await repository.createReport(commentId, reporterId, reason, note ?? null);
        return toCommentReportResponse(created);
      } catch (err) {
        if (isUniqueViolation(err)) throw alreadyReportedError();
        throw err;
      }
    },
    async listReaders(query) {
      const rows = await repository.listReaders({
        search: query.search,
        status: query.status,
        limit: query.limit,
        offset: query.offset
      });
      return rows.map(toReaderQueueRow);
    },
    async moderateReader(id, request, actorId, now) {
      const existing = await repository.findReaderById(id);
      if (!existing) throw readerNotFoundError();
      const { patch, logEntries } = planReaderModeration(existing, request, actorId, now);
      if (logEntries.length === 0) {
        const row = await repository.getReaderRow(id);
        if (!row) throw readerNotFoundError();
        return toReaderQueueRow(row);
      }
      const updated = await repository.updateReader(id, patch, logEntries);
      return toReaderQueueRow(updated);
    }
  };
}

// src/modules/moderation/moderation.controller.ts
function requireActorId(req) {
  const subjectId = req.auth?.subjectType === "staff" ? req.auth.subjectId : void 0;
  if (!subjectId) throw new AppError("Staff session required", 403, "forbidden");
  return subjectId;
}
function requireReporterId(req) {
  const subjectId = req.auth?.subjectType === "reader" ? req.auth.subjectId : void 0;
  if (!subjectId) throw new AppError("Reader session required", 401, "unauthenticated");
  return subjectId;
}
function createModerationController(service) {
  return {
    async listCommentQueue(req, res, next) {
      try {
        const query = commentQueueQuerySchema.parse(req.query);
        const data = await service.listCommentQueue(query);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
    async moderateComment(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = commentModerateRequestSchema.parse(req.body);
        const data = await service.moderateComment(id, body, requireActorId(req));
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
    async dismissCommentReports(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = commentReportsDismissRequestSchema.parse(req.body);
        const data = await service.dismissCommentReports(id, body.reason, requireActorId(req));
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
    async reportComment(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = commentReportRequestSchema.parse(req.body);
        const data = await service.fileReport(id, requireReporterId(req), body.reason, body.note);
        res.status(201).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
    async listReaders(req, res, next) {
      try {
        const query = readerQueueQuerySchema.parse(req.query);
        const data = await service.listReaders(query);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
    async moderateReader(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = readerModerateRequestSchema.parse(req.body);
        const data = await service.moderateReader(id, body, requireActorId(req), /* @__PURE__ */ new Date());
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/moderation/moderation.routes.ts
function moderationDependencies(db2) {
  const repository = createModerationRepository(db2);
  const service = createModerationService(repository);
  return createModerationController(service);
}
function commentModerationRoutes(db2) {
  const router = Router15();
  const controller = moderationDependencies(db2);
  router.get("/", requirePermission("moderation.manage"), controller.listCommentQueue);
  router.patch("/:id", requirePermission("moderation.manage"), controller.moderateComment);
  router.patch("/:id/reports/dismiss", requirePermission("moderation.manage"), controller.dismissCommentReports);
  return router;
}
function readerModerationRoutes(db2) {
  const router = Router15();
  const controller = moderationDependencies(db2);
  router.get("/", requirePermission("moderation.manage"), controller.listReaders);
  router.patch("/:id", requirePermission("moderation.manage"), controller.moderateReader);
  return router;
}
function commentReportRoutes(db2) {
  const router = Router15();
  const controller = moderationDependencies(db2);
  router.post("/:id/report", requireReader({ createsContent: false }), reportRateLimiter(), controller.reportComment);
  return router;
}

// src/modules/analytics/analytics.routes.ts
import { Router as Router16 } from "express";

// src/modules/analytics/analytics.repository.ts
import { and as and8, asc as asc7, count as count4, eq as eq17, gte as gte2, isNull as isNull3, lt, lte as lte2, notExists, or as or3, sql as sql25 } from "drizzle-orm";
var OVERDUE_GRACE_MS = 5 * 60 * 1e3;
var DUE_SOON_WINDOW_MS = 48 * 60 * 60 * 1e3;
var NEW_READER_WINDOW_MS = 7 * 24 * 60 * 60 * 1e3;
var ACTIVE_READER_WINDOW_MS = 30 * 24 * 60 * 60 * 1e3;
var JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1e3;
var DAY_MS = 24 * 60 * 60 * 1e3;
var WEEK_MS = 7 * DAY_MS;
var READERSHIP_TOTALS_DAYS = 7;
var READERSHIP_TOP_DAYS = 30;
function jakartaWeekStart(instant) {
  const shifted = new Date(instant.getTime() + JAKARTA_OFFSET_MS);
  const dayOfWeek = shifted.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const shiftedWeekStartMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - daysSinceMonday);
  return new Date(shiftedWeekStartMs - JAKARTA_OFFSET_MS);
}
function jakartaDateLabel(instant) {
  const shifted = new Date(instant.getTime() + JAKARTA_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function blankOrNull(column) {
  return or3(isNull3(column), sql25`trim(${column}) = ''`);
}
function countWhere(condition) {
  return sql25`count(case when ${condition} then 1 end)`.mapWith(Number);
}
function createAnalyticsRepository(db2) {
  return {
    async getPipelineCounts() {
      const rows = await db2.select({ status: articles.status, count: count4() }).from(articles).groupBy(articles.status);
      const counts = { draft: 0, scheduled: 0, published: 0 };
      for (const row of rows) counts[row.status] = row.count;
      return counts;
    },
    async getCadence(now) {
      const currentWeekStart = jakartaWeekStart(now);
      const cutoff = new Date(currentWeekStart.getTime() - (DASHBOARD_CADENCE_WEEKS - 1) * WEEK_MS);
      const nextWeekStart = new Date(currentWeekStart.getTime() + WEEK_MS);
      const jakartaLocal = sql25`convert_tz(${articles.publishedAt}, '+00:00', '+07:00')`;
      const bucketExpr = sql25`date_format(date_sub(date(${jakartaLocal}), interval weekday(${jakartaLocal}) day), '%Y-%m-%d')`;
      const rows = await db2.select({ weekStart: bucketExpr, count: count4() }).from(articles).where(and8(eq17(articles.status, "published"), gte2(articles.publishedAt, cutoff), lt(articles.publishedAt, nextWeekStart))).groupBy(bucketExpr);
      const countByWeek = new Map(rows.map((row) => [row.weekStart, row.count]));
      const buckets2 = [];
      for (let i = 0; i < DASHBOARD_CADENCE_WEEKS; i++) {
        const label = jakartaDateLabel(new Date(cutoff.getTime() + i * WEEK_MS));
        buckets2.push({ weekStart: label, count: countByWeek.get(label) ?? 0 });
      }
      return buckets2;
    },
    async getContentDebt() {
      const uncategorizedCondition = notExists(
        db2.select({ one: sql25`1` }).from(articleCategories).where(eq17(articleCategories.articleId, articles.id))
      );
      const [articleRow] = await db2.select({
        missingSeoDescription: countWhere(blankOrNull(articles.seoDescription)),
        missingExcerpt: countWhere(blankOrNull(articles.excerpt)),
        missingFeaturedImage: countWhere(isNull3(articles.featuredMediaId)),
        uncategorized: countWhere(uncategorizedCondition)
      }).from(articles).where(eq17(articles.status, "published"));
      return {
        missingSeoDescription: articleRow?.missingSeoDescription ?? 0,
        missingExcerpt: articleRow?.missingExcerpt ?? 0,
        missingFeaturedImage: articleRow?.missingFeaturedImage ?? 0,
        uncategorized: articleRow?.uncategorized ?? 0
      };
    },
    async getCurationIntegrity(now) {
      const homeRows = await db2.select({ status: articles.status, publishedAt: articles.publishedAt }).from(homeCuration).innerJoin(articles, eq17(articles.id, homeCuration.articleId));
      const homeVisible = homeRows.filter((row) => isPubliclyVisible(row, now)).length;
      return {
        home: { total: homeRows.length, visible: homeVisible }
      };
    },
    async getUpNext(now) {
      const dueSoonRows = await db2.select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        publishedAt: articles.publishedAt,
        // True total ahead of the LIMIT, in the same round trip (tasks.md - 2.8).
        total: sql25`count(*) over ()`.mapWith(Number)
      }).from(articles).where(
        and8(
          eq17(articles.status, "scheduled"),
          gte2(articles.publishedAt, now),
          lte2(articles.publishedAt, new Date(now.getTime() + DUE_SOON_WINDOW_MS))
        )
      ).orderBy(asc7(articles.publishedAt)).limit(DASHBOARD_DUE_SOON_LIMIT);
      const [overdueRow] = await db2.select({ count: count4() }).from(articles).where(and8(eq17(articles.status, "scheduled"), lte2(articles.publishedAt, new Date(now.getTime() - OVERDUE_GRACE_MS))));
      return {
        // `publishedAt` is never null on a `scheduled` row (design.md's lifecycle table), and the
        // WHERE clause above already filters to `scheduled` — the query cannot return a row with
        // a null `publishedAt` here, so narrowing the type is safe.
        dueWithin48h: dueSoonRows.filter((row) => row.publishedAt !== null).map((row) => ({ id: row.id, title: row.title, slug: row.slug, publishedAt: row.publishedAt })),
        dueWithin48hTotal: dueSoonRows[0]?.total ?? 0,
        overdueUnpromotedCount: overdueRow?.count ?? 0
      };
    },
    async getReaderActivity(now) {
      const newCutoff = new Date(now.getTime() - NEW_READER_WINDOW_MS);
      const activeCutoff = new Date(now.getTime() - ACTIVE_READER_WINDOW_MS);
      const [row] = await db2.select({
        // `activeLast30d` naturally excludes a reader with `lastLoginAt IS NULL`: SQL's
        // `NULL >= x` evaluates to NULL, and `case when null then 1 end` is itself `NULL` —
        // `count()` never counts it, the same "not active" outcome `filter (where ...)` gave
        // (spec.md - "Reader who never logged in is not counted as active").
        newLast7d: countWhere(gte2(readers.createdAt, newCutoff)),
        activeLast30d: countWhere(gte2(readers.lastLoginAt, activeCutoff))
      }).from(readers);
      return { newLast7d: row?.newLast7d ?? 0, activeLast30d: row?.activeLast30d ?? 0 };
    },
    async getReadership(now) {
      const sevenDayCutoff = jakartaDateLabel(new Date(now.getTime() - (READERSHIP_TOTALS_DAYS - 1) * DAY_MS));
      const thirtyDayCutoff = jakartaDateLabel(new Date(now.getTime() - (READERSHIP_TOP_DAYS - 1) * DAY_MS));
      const totalViews = sql25`coalesce(sum(${articleViewsDaily.views}), 0)`;
      const [totals, topArticles] = await Promise.all([
        db2.select({
          last7dViews: totalViews.mapWith(Number),
          last7dUniqueViews: sql25`coalesce(sum(${articleViewsDaily.uniqueViews}), 0)`.mapWith(Number)
        }).from(articleViewsDaily).where(gte2(articleViewsDaily.date, sevenDayCutoff)),
        db2.select({
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          views: totalViews.mapWith(Number)
        }).from(articleViewsDaily).innerJoin(articles, eq17(articles.id, articleViewsDaily.articleId)).where(gte2(articleViewsDaily.date, thirtyDayCutoff)).groupBy(articles.id, articles.title, articles.slug).orderBy(sql25`sum(${articleViewsDaily.views}) desc`, asc7(articles.id)).limit(DASHBOARD_TOP_ARTICLES_LIMIT)
      ]);
      return {
        last7dViews: totals[0]?.last7dViews ?? 0,
        last7dUniqueViews: totals[0]?.last7dUniqueViews ?? 0,
        topArticles
      };
    }
  };
}

// src/modules/analytics/analytics.mapper.ts
function toDashboardResponse(data) {
  return {
    pipeline: data.pipeline,
    cadence: data.cadence,
    contentDebt: data.contentDebt,
    curationIntegrity: data.curationIntegrity,
    upNext: {
      dueWithin48h: data.upNext.dueWithin48h.map((article) => ({
        id: article.id,
        title: article.title,
        slug: article.slug,
        publishedAt: article.publishedAt.toISOString()
      })),
      dueWithin48hTotal: data.upNext.dueWithin48hTotal,
      overdueUnpromotedCount: data.upNext.overdueUnpromotedCount
    },
    readers: data.readers,
    // Already contract-shaped by the time it leaves the repository — the counts are numbers and
    // the top-article rows carry no Date to format.
    readership: data.readership
  };
}

// src/modules/analytics/analytics.service.ts
function createAnalyticsService(repository) {
  return {
    async getDashboard() {
      const now = /* @__PURE__ */ new Date();
      const [pipeline, cadence, contentDebt, curationIntegrity, upNext, readers2, readership] = await Promise.all([
        repository.getPipelineCounts(),
        repository.getCadence(now),
        repository.getContentDebt(),
        repository.getCurationIntegrity(now),
        repository.getUpNext(now),
        repository.getReaderActivity(now),
        repository.getReadership(now)
      ]);
      return toDashboardResponse({ pipeline, cadence, contentDebt, curationIntegrity, upNext, readers: readers2, readership });
    }
  };
}

// src/modules/analytics/analytics.controller.ts
function createAnalyticsController(service) {
  return {
    async getDashboard(_req, res, next) {
      try {
        const data = await service.getDashboard();
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/analytics/analytics.routes.ts
function analyticsRoutes(db2) {
  const router = Router16();
  const repository = createAnalyticsRepository(db2);
  const service = createAnalyticsService(repository);
  const controller = createAnalyticsController(service);
  router.get("/", requirePermission("dashboard.view"), controller.getDashboard);
  return router;
}

// src/modules/contact/contact.routes.ts
import { Router as Router17 } from "express";

// src/modules/contact/contact.repository.ts
import { count as count5, desc as desc4, eq as eq18 } from "drizzle-orm";
function createContactMessageRepository(db2) {
  return {
    async submit(input) {
      const id = newId();
      await db2.insert(contactMessages).values({
        id,
        name: input.name,
        organisation: input.organisation ?? null,
        email: input.email,
        subject: input.subject ?? null,
        message: input.message
      });
      const [row] = await db2.select().from(contactMessages).where(eq18(contactMessages.id, id)).limit(1);
      if (!row) throw new Error("contact message missing immediately after insert");
      return row;
    },
    async list(filter) {
      const where = filter === "all" ? void 0 : eq18(contactMessages.status, filter);
      const query = db2.select().from(contactMessages).orderBy(desc4(contactMessages.createdAt));
      return where ? query.where(where) : query;
    },
    async countUnread() {
      const [row] = await db2.select({ value: count5() }).from(contactMessages).where(eq18(contactMessages.status, "new"));
      return row?.value ?? 0;
    },
    async setStatus(id, status) {
      await db2.update(contactMessages).set({ status }).where(eq18(contactMessages.id, id));
      const [row] = await db2.select().from(contactMessages).where(eq18(contactMessages.id, id)).limit(1);
      return row ?? null;
    }
  };
}

// src/modules/contact/contact.service.ts
function createPublicContactService(repository) {
  return {
    submit(input) {
      return repository.submit(input);
    }
  };
}
function createContactMessageService(repository) {
  return {
    list(filter) {
      return repository.list(filter);
    },
    countUnread() {
      return repository.countUnread();
    },
    async setStatus(id, status) {
      const updated = await repository.setStatus(id, status);
      if (!updated) throw new AppError("Contact message not found", 404, "not_found");
      return updated;
    }
  };
}

// src/modules/contact/contact.mapper.ts
function toContactMessageSubmitResponse(row) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString()
  };
}
function toContactMessageRow(row) {
  return {
    id: row.id,
    name: row.name,
    organisation: row.organisation,
    email: row.email,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt.toISOString()
  };
}

// src/modules/contact/contact.controller.ts
function createPublicContactController(service) {
  return {
    async submit(req, res, next) {
      try {
        const body = contactMessageSubmitRequestSchema.parse(req.body);
        const row = await service.submit(body);
        res.status(201).json({ success: true, data: toContactMessageSubmitResponse(row) });
      } catch (err) {
        next(err);
      }
    }
  };
}
function createContactMessageController(service) {
  return {
    async list(req, res, next) {
      try {
        const query = contactMessageQuerySchema.parse(req.query);
        const rows = await service.list(query.status);
        res.json({ success: true, data: rows.map(toContactMessageRow) });
      } catch (err) {
        next(err);
      }
    },
    async unreadCount(_req, res, next) {
      try {
        const value = await service.countUnread();
        res.json({ success: true, data: { count: value } });
      } catch (err) {
        next(err);
      }
    },
    async updateStatus(req, res, next) {
      try {
        const id = requireUuidParam(req, "id");
        const body = contactMessageUpdateRequestSchema.parse(req.body);
        const row = await service.setStatus(id, body.status);
        res.json({ success: true, data: toContactMessageRow(row) });
      } catch (err) {
        next(err);
      }
    }
  };
}

// src/modules/contact/contact.routes.ts
function publicContactRoutes(db2) {
  const router = Router17();
  const repository = createContactMessageRepository(db2);
  const service = createPublicContactService(repository);
  const controller = createPublicContactController(service);
  router.post("/", requirePublic(), contactRateLimiter(), controller.submit);
  return router;
}
function contactMessageRoutes(db2) {
  const router = Router17();
  const repository = createContactMessageRepository(db2);
  const service = createContactMessageService(repository);
  const controller = createContactMessageController(service);
  router.get("/", requirePermission("contact.manage"), controller.list);
  router.get("/unread-count", requirePermission("contact.manage"), controller.unreadCount);
  router.patch("/:id", requirePermission("contact.manage"), controller.updateStatus);
  return router;
}

// src/server.ts
function createServer() {
  const env = loadEnv();
  const logger = createLogger(env);
  const db2 = getDatabase(env);
  const app = express2();
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.use(requestId);
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: [env.APP_ORIGIN, env.ADMIN_ORIGIN], credentials: true }));
  app.use(express2.json());
  app.use(cookieParser());
  app.use(createAuthenticate(env));
  app.use(createCsrfMiddleware(env));
  app.use("/health", healthRoutes());
  app.use("/users", userRoutes(db2));
  app.use("/auth", authRoutes(db2, env));
  app.use("/auth", googleAuthRoutes(db2, env));
  app.use("/staff", staffRoutes(db2, env));
  app.use("/roles", roleRoutes(db2));
  app.use("/media", mediaRoutes(db2, env));
  app.use("/media-files", mediaFileRoutes(env));
  app.use("/admin/articles", articleRoutes(db2, env));
  app.use("/articles", publicArticleRoutes(db2, env));
  app.use("/articles", publicEngagementRoutes(db2, env));
  app.use("/categories", categoryRoutes(db2));
  app.use("/anak-usaha", anakUsahaRoutes(db2, env));
  app.use("/admin/curation", curationRoutes(db2, env));
  app.use("/home", publicHomeRoutes(db2, env));
  app.use("/admin/partners", partnerRoutes(db2, env));
  app.use("/partners", publicPartnerRoutes(db2, env));
  app.use("/admin/guide-picks", guidePickRoutes(db2, env));
  app.use("/guide-picks", publicGuidePickRoutes(db2, env));
  app.use("/admin/dashboard", analyticsRoutes(db2));
  app.use("/admin/comments", commentModerationRoutes(db2));
  app.use("/admin/readers", readerModerationRoutes(db2));
  app.use("/comments", commentReportRoutes(db2));
  app.use("/admin/contact-messages", contactMessageRoutes(db2));
  app.use("/contact-messages", publicContactRoutes(db2));
  app.use(createErrorHandler(logger));
  auditAuthorizationDeclarations(app);
  return app;
}
var isMainModule = process.argv[1] !== void 0 && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const env = loadEnv();
  const logger = createLogger(env);
  await ensureMediaStorageDir(env);
  const app = createServer();
  const scheduler = startScheduler(logger);
  scheduler.registerJob(
    "* * * * *",
    createScheduledPublishJob(createArticleRepository(getDatabase(env)), env, logger)
  );
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "api listening");
  });
}
export {
  createServer
};
