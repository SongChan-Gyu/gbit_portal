/**
 * 2026년 지비아이티 건강검진 신청 양식 시드
 * 기준: 2026년도_지비아이티_검진대상자.xlsx (임직원명단 시트)
 * 실행: npx tsx scripts/seed-health-check-form-2026.ts
 */
import { PrismaClient } from "@prisma/client";
import { HEALTH_CHECK_FORM_SLUG } from "../src/lib/healthCheck";

const prisma = new PrismaClient();

const SLUG = HEALTH_CHECK_FORM_SLUG;

type FieldDef = {
  label: string;
  fieldType: "text" | "textarea" | "number" | "date" | "select" | "radio" | "checkbox" | "rrn7";
  options?: string[];
  required?: boolean;
};

/** 엑셀 명단 양식(6행 헤더) 기준 입력 항목 */
const FIELDS: FieldDef[] = [
  { label: "성명", fieldType: "text", required: true },
  { label: "주민번호 7자리 (성별 포함)", fieldType: "rrn7", required: true },
  { label: "전화번호", fieldType: "text", required: true },
  { label: "사원번호", fieldType: "text" },
  { label: "관계임직원 성명 (본인인 경우 공란)", fieldType: "text" },
  { label: "직원과의 관계", fieldType: "text" },
  {
    label: "검진 지원금액",
    fieldType: "select",
    required: true,
    options: ["32만원", "22만원"],
  },
];

const FORM_META = {
  title: "2026년 건강검진 신청",
  slug: SLUG,
  description: [
    "검진 대상자 명단 양식 기준으로 작성해 주세요.",
    "· 필수 항목(*)을 빠짐없이 입력해 주세요.",
    "· 주민번호는 000000-0 형식(6자리-성별1자리)으로 입력해 주세요.",
    "· 전화번호는 본인 명의 휴대폰 번호로 입력해 주세요.",
    "· 가족 검진 시 관계임직원 성명·직원과의 관계를 기재해 주세요.",
    "· 본인·가족 각각 별도로 신청해 주세요.",
  ].join("\n"),
  isActive: true,
  showInMenu: true,
  audience: "INTERNAL" as const,
};

function fieldOptionsJson(f: FieldDef): string | null {
  return f.options && ["select", "radio", "checkbox"].includes(f.fieldType)
    ? JSON.stringify(f.options)
    : null;
}

/** 기존 필드는 label 기준으로 갱신 — deleteMany 시 제출 답변이 함께 삭제됨 */
async function syncFormFields(formId: string, existingFields: { id: string; label: string }[]) {
  const keepLabels = new Set(FIELDS.map((f) => f.label));
  const byLabel = new Map(existingFields.map((f) => [f.label, f.id]));

  for (let i = 0; i < FIELDS.length; i++) {
    const f = FIELDS[i];
    const data = {
      sortOrder: i,
      label: f.label,
      fieldType: f.fieldType,
      options: fieldOptionsJson(f),
      required: !!f.required,
    };
    const existingId = byLabel.get(f.label);
    if (existingId) {
      await prisma.formField.update({ where: { id: existingId }, data });
    } else {
      await prisma.formField.create({ data: { formId, ...data } });
    }
  }

  const removeIds = existingFields.filter((f) => !keepLabels.has(f.label)).map((f) => f.id);
  if (removeIds.length) {
    await prisma.formField.deleteMany({ where: { id: { in: removeIds } } });
    console.log(`   제거된 필드: ${removeIds.length}개`);
  }
}

async function main() {
  const existing = await prisma.form.findFirst({
    where: { OR: [{ slug: SLUG }, { title: FORM_META.title }] },
    include: { fields: true },
  });

  if (existing) {
    await prisma.form.update({
      where: { id: existing.id },
      data: {
        title: FORM_META.title,
        slug: FORM_META.slug,
        description: FORM_META.description,
        isActive: FORM_META.isActive,
        showInMenu: FORM_META.showInMenu,
        audience: FORM_META.audience,
      },
    });
    await syncFormFields(existing.id, existing.fields);
    console.log(`✅ 건강검진 양식 갱신: ${FORM_META.title} (id: ${existing.id})`);
    console.log(`   메뉴: 건강검진 > 신청하기 | 공개 링크: /f/${SLUG}`);
    return;
  }

  const created = await prisma.form.create({
    data: {
      ...FORM_META,
      fields: {
        create: FIELDS.map((f, i) => ({
          sortOrder: i,
          label: f.label,
          fieldType: f.fieldType,
          options: fieldOptionsJson(f),
          required: !!f.required,
        })),
      },
    },
  });
  console.log(`✅ 건강검진 양식 생성: ${FORM_META.title} (id: ${created.id})`);
  console.log(`   메뉴: 건강검진 > 신청하기 | 공개 링크: /f/${SLUG}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
