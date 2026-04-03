import { PrismaClient } from "@prisma/client";
import { encryptField, decryptField } from "./fieldCrypto";

/** Employee 레코드의 phone/email을 복호화 */
function decryptEmployee(emp: Record<string, unknown>) {
  if (!emp || typeof emp !== "object") return;
  if (typeof emp.phone === "string") emp.phone = decryptField(emp.phone);
  if (typeof emp.email === "string") emp.email = decryptField(emp.email);
}

/** Employee write args의 phone/email을 암호화 */
function encryptEmployeeData(data: Record<string, unknown> | null | undefined) {
  if (!data || typeof data !== "object") return;
  if (typeof data.phone === "string") data.phone = encryptField(data.phone);
  if (typeof data.email === "string") data.email = encryptField(data.email);
}

function makeClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error"] : [],
  }).$extends({
    query: {
      employee: {
        async $allOperations({ operation, args, query }) {
          // ── 쓰기: phone/email 암호화 ──────────────────────────
          if (operation === "create" || operation === "update") {
            encryptEmployeeData((args as any).data as Record<string, unknown>);
          }
          if (operation === "upsert") {
            encryptEmployeeData((args as any).create as Record<string, unknown>);
            encryptEmployeeData((args as any).update as Record<string, unknown>);
          }
          if (operation === "createMany" || operation === "updateMany") {
            const d = (args as any).data;
            if (Array.isArray(d)) d.forEach(encryptEmployeeData);
            else encryptEmployeeData(d);
          }

          const result = await query(args);

          // ── 읽기: phone/email 복호화 ──────────────────────────
          if (result !== null && result !== undefined) {
            if (Array.isArray(result)) {
              result.forEach(decryptEmployee);
            } else if (typeof result === "object") {
              decryptEmployee(result as Record<string, unknown>);
            }
          }

          return result;
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof makeClient>;

const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrismaClient };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
