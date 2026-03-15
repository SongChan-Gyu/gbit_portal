import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";

export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true, // 프록시·클라우드 환경에서 로그인/콜백 정상 동작
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username:    { label: "아이디" },
        password:    { label: "비밀번호", type: "password" },
        bypassToken: { label: "BypassToken" },  // 테스트용 우회 토큰
      },
      async authorize(credentials) {
        // ── 테스트 우회 로그인 (bypassToken 있으면 비밀번호 불필요)
        if (credentials?.bypassToken) {
          const bypass = await prisma.testBypass.findUnique({
            where: { token: credentials.bypassToken as string },
          });
          if (!bypass || bypass.usedAt || bypass.expiresAt < new Date()) return null;

          await prisma.testBypass.update({ where: { id: bypass.id }, data: { usedAt: new Date() } });

          const emp = await prisma.employee.findUnique({
            where: { id: bypass.employeeId },
            include: { user: true },
          });
          if (!emp?.user) return null;
          return {
            id: emp.user.id, name: emp.name, email: emp.email ?? "",
            employeeId: emp.id, role: emp.role, teamId: emp.teamId, position: emp.position,
          };
        }

        // ── 일반 로그인
        if (!credentials?.username || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { username: credentials.username as string },
          include: { employee: true },
        });
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password as string, user.passwordHash);
        if (!valid) return null;
        if (user.employee.status === "INACTIVE") return null;
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return {
          id: user.id, name: user.employee.name, email: user.employee.email ?? "",
          employeeId: user.employee.id, role: user.employee.role,
          teamId: user.employee.teamId, position: user.employee.position,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.employeeId = (user as any).employeeId;
        token.role       = (user as any).role;
        token.teamId     = (user as any).teamId;
        token.position   = (user as any).position;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).employeeId = token.employeeId;
        (session.user as any).role       = token.role;
        (session.user as any).teamId     = token.teamId;
        (session.user as any).position   = token.position;
      }
      return session;
    },
  },
});
