"use client";

import Link from "next/link";
import type { AudienceCode } from "@/lib/audienceAccess";
import { AUDIENCE_OPTIONS } from "@/lib/audienceAccess";

export type EmployeeGroupOption = { id: string; name: string };

type Props = {
  audience: AudienceCode;
  employeeGroupId: string | null;
  groups: EmployeeGroupOption[];
  onAudienceChange: (audience: AudienceCode) => void;
  onGroupChange: (groupId: string | null) => void;
  groupsHref?: string;
  className?: string;
};

export default function AudienceSelector({
  audience,
  employeeGroupId,
  groups,
  onAudienceChange,
  onGroupChange,
  groupsHref = "/admin/groups",
  className = "",
}: Props) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className="label">노출 대상</label>
        <select
          className="input w-full max-w-md"
          value={audience}
          onChange={(e) => onAudienceChange(e.target.value as AudienceCode)}
        >
          {AUDIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {audience === "GROUP" && (
        <div>
          <label className="label">그룹 선택</label>
          <select
            className="input w-full max-w-md"
            value={employeeGroupId ?? ""}
            onChange={(e) => onGroupChange(e.target.value || null)}
          >
            <option value="">— 그룹 선택 —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {groups.length === 0 && (
            <p className="text-xs text-amber-700 mt-1.5">
              등록된 그룹이 없습니다.{" "}
              <Link href={groupsHref} className="underline hover:text-amber-900">
                그룹 설정
              </Link>
              에서 먼저 만드세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
