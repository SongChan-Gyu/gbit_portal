import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    employeeId?: string;
    role?: string;
    teamId?: string | null;
    position?: string;
    mustChangePassword?: boolean;
  }

  interface Session {
    user: User;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    employeeId?: string;
    role?: string;
    teamId?: string | null;
    position?: string;
    mustChangePassword?: boolean;
  }
}
