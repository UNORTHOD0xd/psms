// Renders the /auth/me payload — combines User with role-specific profile.

import { prisma } from '../../lib/prisma.js';
import { Problems } from '../../lib/problem.js';

export interface MePayload {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  is_active: boolean;
  student_id?: string | null;
  programme_code?: string | null;
  year_of_study?: number | null;
  hours_required?: number | null;
  hours_completed?: number | null;
}

export async function renderMeFromUserId(user_id: string): Promise<MePayload> {
  const user = await prisma.user.findUnique({
    where: { user_id },
    include: {
      student_profile: { include: { programme: true } },
    },
  });
  if (!user) throw Problems.notFound('User not found');

  const me: MePayload = {
    user_id: user.user_id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    phone: user.phone,
    is_active: user.is_active,
  };

  if (user.student_profile) {
    me.student_id = user.student_profile.student_id;
    me.programme_code = user.student_profile.programme.programme_code;
    me.year_of_study = user.student_profile.year_of_study;
    me.hours_required = user.student_profile.hours_required;

    // Sum approved hours.
    const approved = await prisma.hoursLog.aggregate({
      where: { student_user_id: user.user_id, status: 'APPROVED' },
      _sum: { hours: true },
    });
    me.hours_completed = Number(approved._sum.hours ?? 0);
  }

  return me;
}
