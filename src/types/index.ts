export type Role = "STAFF" | "TEAM_LEAD" | "PM" | "ADMIN";
export type EmployeeStatus = "PENDING" | "INVITED" | "ACTIVE" | "INACTIVE";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface SessionUser {
  id: string;
  name: string;
  employeeId: string;
  role: Role;
  teamId?: string;
  position: string;
}

export interface LeaveTypeWithCount {
  id: string;
  code: string;
  name: string;
  daysPerUnit: number;
  deductFromBalance: boolean;
  approvalSteps: number;
  maxPerMonth?: number | null;
  requiresStamp: boolean;
  stampCount?: number | null;
}

export interface EmployeeWithTeam {
  id: string;
  empNo: string;
  name: string;
  position: string;
  role: Role;
  employeeType: string;
  status: EmployeeStatus;
  hireDate: Date;
  phone: string;
  team?: { id: string; name: string } | null;
}
