# 휴가 신청·결재·취소 흐름

현재 구현 기준 휴가 신청 상태, 취소 가능 조건, API 및 UI 동작을 정리한 문서입니다.

## 0. 결재라인별 신청 분리

- 휴가 유형별 **결재 단계(approvalSteps)** 가 다르면 결재라인이 다릅니다.
- 예: 오전반차(팀장→PM, 2단계)와 오후인정/스탬프(팀장 1단계)를 같은 날 같이 신청하면, **결재라인이 다르므로 서로 다른 건으로 분리**되어 각각 결재함에 올라갑니다.
- 같은 결재라인(같은 approvalSteps)인 휴가만 한 건으로 묶이고, 다르면 건별로 분리됩니다.

---

## 1. 휴가 신청 상태 (LeaveRequest.status)

| 상태 | 설명 | 사용자 화면 표시 |
|------|------|------------------|
| `PENDING` | 결재 대기 중 (아직 최종 승인 전) | 대기중 |
| `APPROVED` | 최종 결재 승인 완료 | 승인 |
| `REJECTED` | 결재 반려 | 반려 |
| `CANCELLED` | 취소 완료 (신청 철회 또는 취소 승인 완료) | 취소완료 |
| `CANCEL_REQUESTED` | 승인된 휴가에 대한 취소 신청이 접수된 상태 (취소 결재 대기) | 취소신청중 |

---

## 2. 취소 가능 조건 및 로직

### 2.1 최종 결재 승인 전 (PENDING) — 즉시 취소 가능

- **조건**: `status === "PENDING"` (아직 한 번도 최종 승인되지 않은 상태)
- **동작**:
  - 사용자가 **내 휴가 현황**에서 해당 신청 행의 **「취소」** 버튼 클릭
  - `POST /api/leave/request/[id]/cancel` 호출
  - 본인 신청(`request.employeeId === user.employeeId`)이고 `PENDING`일 때만 처리
  - 트랜잭션 내에서:
    - `LeaveRequest.status` → `CANCELLED`, `cancelledAt` 기록
    - 해당 신청에서 사용한 스탬프 쿠폰 복원 (`usedRequestId` 걸린 스탬프 전부 복원)
    - `LeaveHistory`에 `action: "CANCELLED"` 기록
  - **할당(usedDays) 차감은 PENDING 시에는 이루어지지 않으므로** 복원 처리 없음
- **UI**: `내 휴가 현황` 목록에서 상태가 **대기중**인 건에만 **취소** 버튼 노출 (`CancelButton`)

### 2.2 최종 결재 승인 후 (APPROVED) — 취소 신청 후 결재 필요

- **조건**: `status === "APPROVED"` (이미 최종 승인된 휴가)
- **동작**:
  - 사용자가 **내 휴가 현황**에서 **「취소신청」** 버튼 클릭
  - 취소 사유 입력 후 `POST /api/leave/request/[id]/cancel-request` 호출
  - `status` → `CANCEL_REQUESTED`, 기존 결재자들에게 취소 결재 생성
  - 결재자가 취소 승인 시에만 실제 `CANCELLED` 처리 + 할당/스탬프 복원
- **UI**: 상태가 **승인**인 건에만 **취소신청** 버튼 노출 (`CancelRequestButton`)

### 2.3 취소 신청 접수 후 (CANCEL_REQUESTED)

- 결재자가 취소 승인/반려할 때까지 **취소 불가**
- UI에서는 **취소심사중** 문구만 표시

---

## 3. API 정리

| API | 용도 | 취소/상태 조건 |
|-----|------|----------------|
| `POST /api/leave/request/[id]/cancel` | **신청 철회** (결재 대기 중인 건만) | `status === "PENDING"` 일 때만 성공 |
| `POST /api/leave/request/[id]/cancel-request` | **취소 신청** (이미 승인된 휴가 취소 요청) | `status === "APPROVED"` 일 때만 |
| `POST /api/leave/cancel-approve` | 결재자가 **취소 신청**에 대해 승인/반려 | `status === "CANCEL_REQUESTED"` |
| `POST /api/leave/request/[id]/admin-cancel` | **관리자 직권 취소** (ADMIN 전용) | `PENDING` 또는 `APPROVED` 가능 |

---

## 4. 요약

- **휴가 신청 상태에서 “최종 결재 승인이 되지 않았으면 취소할 수 있다”** → **PENDING일 때만 즉시 취소 가능**하도록 구현되어 있음.
- `POST /api/leave/request/[id]/cancel` 에서 `status !== "PENDING"` 이면 `400` + "대기 상태의 신청만 취소할 수 있습니다." 반환.
- 내 휴가 현황에서는 `req.status === "PENDING"` 인 경우에만 **취소** 버튼을 노출하므로, 최종 승인 전 건만 사용자가 취소할 수 있음.

---

## 5. 관련 파일

- API: `src/app/api/leave/request/[id]/cancel/route.ts`
- UI (취소 버튼): `src/app/(main)/leave/my/CancelButton.tsx`
- UI (취소 신청 버튼): `src/app/(main)/leave/my/CancelRequestButton.tsx`
- 내 휴가 현황: `src/app/(main)/leave/my/page.tsx` (상태별 버튼 분기)
