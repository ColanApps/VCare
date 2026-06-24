import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { logAudit } from '../utils/audit.js';

export async function authenticateUser(email, password, ip) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      designation: true,
      branch: true,
    },
  });

  if (!user || !user.isActive) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: ip },
  });

  await prisma.userSession.create({
    data: {
      userId: user.id,
      ipAddress: ip,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await logAudit({
    userId: user.id,
    action: 'LOGIN',
    module: 'AUTH',
    ipAddress: ip,
  });

  const permissions = user.role.permissions.map((rp) => rp.permission.code);
  if (user.role.code === 'SUPER_ADMIN') permissions.push('*');

  return {
    id: user.id,
    employeeId: user.employeeId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    roleId: user.roleId,
    roleCode: user.role.code,
    roleName: user.role.name,
    designation: user.designation?.name,
    branchId: user.branchId,
    branchName: user.branch?.name,
    branchCode: user.branch?.code,
    permissions,
  };
}

export async function getUserById(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      designation: true,
      branch: true,
    },
  });
  if (!user) return null;

  const permissions = user.role.permissions.map((rp) => rp.permission.code);
  if (user.role.code === 'SUPER_ADMIN') permissions.push('*');

  return {
    id: user.id,
    employeeId: user.employeeId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    roleId: user.roleId,
    roleCode: user.role.code,
    roleName: user.role.name,
    designation: user.designation?.name,
    branchId: user.branchId,
    branchName: user.branch?.name,
    permissions,
  };
}
