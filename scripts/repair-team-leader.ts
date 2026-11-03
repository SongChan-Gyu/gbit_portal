/**
 * 팀장 지정·역할·알림톡·대기 결재를 한 번에 맞춘다.
 *
 * 조회만:
 *   npx tsx scripts/repair-team-leader.ts --team 2팀 --leader 김현호
 * 반영:
 *   npx tsx scripts/repair-team-leader.ts --team 2팀 --leader 김현호 --apply
 */
import prisma from "../src/lib/db";
import { applyTeamLeaderChange, inspectTeamLeaderHealth } from "../src/lib/teamLeader";

function arg(name: string, fallback = ""): string {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  return fallback;
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 7) return phone ? "(있음)" : "(없음)";
  return `${d.slice(0, 3)}****${d.slice(-4)}`;
}

function hostFromDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(raw);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}/${(u.pathname || "").replace(/^\//, "")}`;
  } catch {
    return "(DATABASE_URL 파싱 실패)";
  }
}

async function main() {
  const teamName = arg("--team", "2팀");
  const leaderName = arg("--leader", "김현호");
  const apply = process.argv.includes("--apply");

  console.log(`DB: ${hostFromDatabaseUrl()}`);
  console.log(`팀=${teamName} 팀장=${leaderName} 모드=${apply ? "반영" : "조회"}`);

  const before = await inspectTeamLeaderHealth(prisma, teamName);
  if (!before.team) {
    console.error(`팀 '${teamName}' 을 찾지 못했습니다.`);
    process.exit(1);
  }

  const leader = await prisma.employee.findFirst({
    where: { name: leaderName, status: { not: "INACTIVE" } },
    select: { id: true, name: true, role: true, phone: true, alimtalkEnabled: true, status: true },
  });
  if (!leader) {
    console.error(`사원 '${leaderName}' 을 찾지 못했습니다.`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        team: before.team,
        currentLeader: before.leader
          ? {
              name: before.leader.name,
              role: before.leader.role,
              status: before.leader.status,
              phone: maskPhone(before.leader.phone),
              alimtalkEnabled: before.leader.alimtalkEnabled,
            }
          : null,
        extraTeamLeads: before.extraTeamLeads,
        pendingLeave: before.pendingLeave,
        pendingStamp: before.pendingStamp,
        targetLeader: {
          name: leader.name,
          role: leader.role,
          phone: maskPhone(leader.phone),
          alimtalkEnabled: leader.alimtalkEnabled,
        },
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("조회만 했습니다. 반영하려면 --apply 를 붙이세요.");
    return;
  }

  const sync = await prisma.$transaction((tx) => applyTeamLeaderChange(tx, before.team!.id, leader.id));
  const after = await inspectTeamLeaderHealth(prisma, teamName);
  console.log("sync", sync);
  console.log(
    "after",
    JSON.stringify(
      {
        currentLeader: after.leader
          ? {
              name: after.leader.name,
              role: after.leader.role,
              phone: maskPhone(after.leader.phone),
              alimtalkEnabled: after.leader.alimtalkEnabled,
            }
          : null,
        extraTeamLeads: after.extraTeamLeads,
        pendingLeave: after.pendingLeave,
        pendingStamp: after.pendingStamp,
        warning: sync.warning,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
