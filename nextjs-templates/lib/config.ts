'use client';

// Danh sách 2 Quản Trị Viên (Admin) chính thức duy nhất của Đạo Tâm
export const ADMIN_EMAILS: string[] = [
  'hoaamcac@gmail.com',
  'meoyeutien22@gmail.com',
];

// Kiểm tra quyền Admin theo email
export function checkIsAdmin(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return ADMIN_EMAILS.some((adminEmail) => adminEmail.toLowerCase().trim() === clean);
}

export { app, db, auth, storage } from './firebase';
