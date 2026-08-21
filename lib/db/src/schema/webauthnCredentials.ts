import { pgTable, serial, text, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const webauthnCredentialsTable = pgTable("webauthn_credentials", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(), // base64url-encoded COSE public key
  counter: integer("counter").notNull().default(0),
  deviceType: text("device_type"), // "singleDevice" | "multiDevice"
  backedUp: boolean("backed_up").default(false),
  transports: text("transports"), // JSON array of AuthenticatorTransportFuture
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
