import type { Organisation } from '@prisma/client';

export function mapOrganisation(o: Organisation) {
  return {
    organisation_id: o.organisation_id,
    name: o.name,
    type: o.type,
    industry_sector: o.industry_sector,
    address: o.address,
    primary_contact_name: o.primary_contact_name,
    primary_contact_email: o.primary_contact_email,
    primary_contact_phone: o.primary_contact_phone,
    mou_on_file: o.mou_on_file,
    mou_expiry_date: o.mou_expiry_date ? o.mou_expiry_date.toISOString().slice(0, 10) : null,
    status: o.status,
    created_at: o.created_at.toISOString(),
    updated_at: o.updated_at.toISOString(),
  };
}
