import { z } from "zod";

export const forgotPasswordSchema = z.object({
  username: z.string().trim().min(1, "아이디를 입력해 주세요.").max(100),
});

export const findIdSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(100),
  email: z.string().trim().toLowerCase().email("유효한 이메일을 입력해 주세요.").max(200),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "토큰이 필요합니다."),
  newPassword: z.string().trim().min(8, "비밀번호는 8자 이상이어야 합니다.").max(200),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type FindIdInput = z.infer<typeof findIdSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
