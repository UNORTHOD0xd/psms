// INP-02 — Host organisation registry. Coordinator/admin only.

import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { Problems, sendProblem } from '../../lib/problem.js';
import { PaginationQuery, buildPage, parseSort, toSkipTake } from '../../lib/pagination.js';
import { writeAudit } from '../../middleware/audit.js';
import { requireRole } from '../../middleware/require-role.js';

import { mapOrganisation } from './mapper.js';

export const orgsRouter = Router();

const OrgInputSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['EMPLOYER', 'NGO', 'PUBLIC_SECTOR', 'ACADEMIC']),
  industry_sector: z.string().min(1).max(100),
  address: z.string().max(500).nullable().optional(),
  primary_contact_name: z.string().min(1).max(200),
  primary_contact_email: z.string().email(),
  primary_contact_phone: z.string().min(1).max(40),
  mou_on_file: z.boolean(),
  mou_expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

const ListQuerySchema = PaginationQuery.extend({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']).optional(),
  q: z.string().optional(),
});

orgsRouter.get('/', requireRole('COORDINATOR_OR_ADMIN'), async (req, res, next) => {
  try {
    const params = ListQuerySchema.parse(req.query);
    const sort = parseSort(params.sort, ['created_at', 'name', 'status'], {
      field: 'created_at',
      dir: 'desc',
    });
    const where = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? { name: { contains: params.q, mode: 'insensitive' as const } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.organisation.findMany({
        where,
        ...toSkipTake(params),
        orderBy: { [sort.field]: sort.dir },
      }),
      prisma.organisation.count({ where }),
    ]);
    res.json(buildPage(params, rows.map(mapOrganisation), total));
  } catch (err) {
    next(err);
  }
});

orgsRouter.post('/', requireRole('COORDINATOR_OR_ADMIN'), async (req, res, next) => {
  try {
    const body = OrgInputSchema.parse(req.body);
    const created = await prisma.organisation.create({
      data: {
        name: body.name,
        type: body.type,
        industry_sector: body.industry_sector,
        address: body.address ?? null,
        primary_contact_name: body.primary_contact_name,
        primary_contact_email: body.primary_contact_email,
        primary_contact_phone: body.primary_contact_phone,
        mou_on_file: body.mou_on_file,
        mou_expiry_date: body.mou_expiry_date ? new Date(body.mou_expiry_date) : null,
      },
    });
    await writeAudit(req, {
      action: 'organisation.create',
      resource_type: 'Organisation',
      resource_id: created.organisation_id,
      after: created,
    });
    res.status(201).json(mapOrganisation(created));
  } catch (err) {
    next(err);
  }
});

orgsRouter.get('/:organisation_id', requireRole('COORDINATOR_OR_ADMIN'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.organisation_id);
    const row = await prisma.organisation.findUnique({ where: { organisation_id: id } });
    if (!row) return sendProblem(res, Problems.notFound());
    res.json(mapOrganisation(row));
  } catch (err) {
    next(err);
  }
});

orgsRouter.patch('/:organisation_id', requireRole('COORDINATOR_OR_ADMIN'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.organisation_id);
    const body = OrgInputSchema.partial().parse(req.body);
    const before = await prisma.organisation.findUnique({ where: { organisation_id: id } });
    if (!before) return sendProblem(res, Problems.notFound());

    const updated = await prisma.organisation.update({
      where: { organisation_id: id },
      data: {
        ...body,
        ...(body.mou_expiry_date !== undefined
          ? { mou_expiry_date: body.mou_expiry_date ? new Date(body.mou_expiry_date) : null }
          : {}),
      },
    });
    await writeAudit(req, {
      action: 'organisation.update',
      resource_type: 'Organisation',
      resource_id: id,
      before,
      after: updated,
    });
    res.json(mapOrganisation(updated));
  } catch (err) {
    next(err);
  }
});

orgsRouter.post('/:organisation_id/approve', requireRole('ADMINISTRATOR'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.organisation_id);
    const before = await prisma.organisation.findUnique({ where: { organisation_id: id } });
    if (!before) return sendProblem(res, Problems.notFound());
    if (before.status !== 'PENDING') {
      return sendProblem(
        res,
        Problems.unprocessable(`Cannot approve: status is ${before.status}`),
      );
    }
    const updated = await prisma.organisation.update({
      where: { organisation_id: id },
      data: { status: 'ACTIVE' },
    });
    await writeAudit(req, {
      action: 'organisation.approve',
      resource_type: 'Organisation',
      resource_id: id,
      before,
      after: updated,
    });
    res.json(mapOrganisation(updated));
  } catch (err) {
    next(err);
  }
});
