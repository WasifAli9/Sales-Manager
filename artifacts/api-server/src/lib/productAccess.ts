import type { Request } from "express";
import { and, eq, ne } from "drizzle-orm";
import { db, productAssignmentsTable, productsTable } from "@workspace/db";

/**
 * Owners can access every product. Members require a current assignment to an
 * active product before product context, sender settings, or strategy is read.
 */
export async function canAccessProduct(req: Request, productId: number): Promise<boolean> {
  if (!req.isAuthenticated()) return false;
  if (req.user!.role === "owner") return true;

  const [assignment] = await db
    .select({ id: productAssignmentsTable.id })
    .from(productAssignmentsTable)
    .innerJoin(productsTable, eq(productAssignmentsTable.productId, productsTable.id))
    .where(and(
      eq(productAssignmentsTable.userId, req.user!.id),
      eq(productAssignmentsTable.productId, productId),
      ne(productsTable.status, "inactive"),
    ))
    .limit(1);
  return Boolean(assignment);
}