import { PrismaClient } from "@prisma/client";
import { encryptField, decryptField } from "./fieldCrypto";

/**
 * 결과 트리를 재귀 탐색하며 phone/email 필드를 복호화.
 * prisma.leaveRequest.findMany({ include: { employee: true } }) 처럼
 * 중첩 include로 딸려오는 Employee 객체도 자동 처리됨.
 */
function decryptPIIInResult(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) decryptPIIInResult(item);
    return;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.phone === "string") obj.phone = decryptField(obj.phone);
  if (typeof obj.email === "string") obj.email = decryptField(obj.email);
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") decryptPIIInResult(v);
  }
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
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // ── Employee 쓰기: phone/email 암호화 ────────────────────
          if (model === "Employee") {
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
          }

          const result = await query(args);

          // ── 모든 읽기: phone/email 복호화 (중첩 include 포함) ───
          decryptPIIInResult(result);

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

/**
 * $extends() 이후 실제 prisma 인스턴스 타입.
 * lib 함수 파라미터에서 PrismaClient 대신 사용.
 */
export type DB = typeof prisma;

/**
 * $transaction 콜백의 tx 타입.
 * lib 함수 파라미터에서 Prisma.TransactionClient 대신 사용.
 */
export type DBTx = Omit<DB, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
