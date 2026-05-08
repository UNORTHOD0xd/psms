// INP-02 — Register or edit a host organisation.
//
// Single component, two modes:
//   - id === undefined → POST /organisations
//   - id is a UUID     → PATCH /organisations/:id (initial values seeded
//                        from a GET).
//
// The OpenAPI OrganisationInput maps 1:1 to this form. We send the
// values straight to the API and let server-side Zod do the strict
// validation; client-side validation here is just for UX.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import {
  Button,
  ErrorBanner,
  Field,
  FieldShell,
  LoadingState,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { Organisation, OrganisationInput } from '../../lib/api/types.js';

const FormSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['EMPLOYER', 'NGO', 'PUBLIC_SECTOR', 'ACADEMIC']),
  industry_sector: z.string().min(1).max(100),
  address: z.string().max(500).optional(),
  primary_contact_name: z.string().min(1).max(200),
  primary_contact_email: z.string().email(),
  primary_contact_phone: z.string().min(1).max(40),
  mou_on_file: z.enum(['true', 'false']).transform((v) => v === 'true'),
  mou_expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
});

type FormValues = z.input<typeof FormSchema>;

export function OrganisationForm({ id }: { id?: string }): JSX.Element {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = Boolean(id);

  const existing = useQuery<Organisation>({
    queryKey: ['coordinator', 'organisation', id],
    queryFn: () => api.get(`/organisations/${id}`),
    enabled: isEdit,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
      type: 'EMPLOYER',
      industry_sector: '',
      address: '',
      primary_contact_name: '',
      primary_contact_email: '',
      primary_contact_phone: '',
      mou_on_file: 'false',
      mou_expiry_date: '',
    },
  });

  useEffect(() => {
    if (!existing.data) return;
    const o = existing.data;
    reset({
      name: o.name,
      type: o.type,
      industry_sector: o.industry_sector,
      address: o.address ?? '',
      primary_contact_name: o.primary_contact_name ?? '',
      primary_contact_email: o.primary_contact_email ?? '',
      primary_contact_phone: o.primary_contact_phone ?? '',
      mou_on_file: o.mou_on_file ? 'true' : 'false',
      mou_expiry_date: o.mou_expiry_date ?? '',
    });
  }, [existing.data, reset]);

  const mutation = useMutation<Organisation, unknown, OrganisationInput>({
    mutationFn: (input) =>
      isEdit
        ? api.patch(`/organisations/${id}`, input)
        : api.post('/organisations', input),
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ['coordinator', 'organisations'] });
      void qc.invalidateQueries({ queryKey: ['coordinator', 'organisation', saved.organisation_id] });
      void navigate({ to: '/coordinator/organisations' });
    },
  });

  function onSubmit(values: FormValues): void {
    const parsed = FormSchema.parse(values);
    const input: OrganisationInput = {
      name: parsed.name,
      type: parsed.type,
      industry_sector: parsed.industry_sector,
      address: parsed.address && parsed.address.length > 0 ? parsed.address : null,
      primary_contact_name: parsed.primary_contact_name,
      primary_contact_email: parsed.primary_contact_email,
      primary_contact_phone: parsed.primary_contact_phone,
      mou_on_file: parsed.mou_on_file,
      mou_expiry_date:
        parsed.mou_expiry_date && parsed.mou_expiry_date.length > 0
          ? parsed.mou_expiry_date
          : null,
    };
    mutation.mutate(input);
  }

  if (isEdit && existing.isPending) return <LoadingState />;
  if (isEdit && existing.error) return <ErrorBanner error={existing.error} />;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="psms-form">
      <h1>{isEdit ? 'Edit organisation' : 'Register organisation'}</h1>
      <ErrorBanner error={mutation.error} />

      <Field label="Organisation name" error={errors.name?.message} {...register('name')} />

      <FieldShell label="Type" error={errors.type?.message}>
        <select {...register('type')}>
          <option value="EMPLOYER">Employer</option>
          <option value="NGO">NGO</option>
          <option value="PUBLIC_SECTOR">Public sector</option>
          <option value="ACADEMIC">Academic</option>
        </select>
      </FieldShell>

      <Field
        label="Industry sector"
        error={errors.industry_sector?.message}
        {...register('industry_sector')}
      />
      <Field label="Address" error={errors.address?.message} {...register('address')} />

      <Field
        label="Primary contact — name"
        error={errors.primary_contact_name?.message}
        {...register('primary_contact_name')}
      />
      <Field
        label="Primary contact — email"
        type="email"
        error={errors.primary_contact_email?.message}
        {...register('primary_contact_email')}
      />
      <Field
        label="Primary contact — phone"
        error={errors.primary_contact_phone?.message}
        {...register('primary_contact_phone')}
      />

      <FieldShell label="MOU on file?" error={errors.mou_on_file?.message}>
        <select {...register('mou_on_file')}>
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      </FieldShell>

      <Field
        label="MOU expiry (YYYY-MM-DD, optional)"
        error={errors.mou_expiry_date?.message}
        {...register('mou_expiry_date')}
      />

      <div className="psms-form__row">
        <Button type="submit" loading={mutation.isPending}>
          {isEdit ? 'Save changes' : 'Register organisation'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void navigate({ to: '/coordinator/organisations' })}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
