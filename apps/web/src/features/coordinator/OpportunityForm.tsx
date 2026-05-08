// INP-03 — Create or edit a placement opportunity.
//
// Like OrganisationForm, this is a single component used in two modes
// (create / edit). Server-side rule: PATCH is only allowed while status
// is DRAFT, so the edit mode bails out gracefully with a banner once the
// opportunity has been published.

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
  TextAreaField,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type {
  Opportunity,
  OpportunityInput,
  Organisation,
  Page,
} from '../../lib/api/types.js';

const FormSchema = z.object({
  organisation_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  application_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  min_hours: z.coerce.number().int().min(1),
  openings: z.coerce.number().int().min(1).max(50),
  required_competencies: z.string().optional(),
  eligible_programmes: z.string().optional(),
  supervisor_name: z.string().min(1).max(200),
  supervisor_email: z.string().email(),
  stipend_jmd: z.string().optional(),
});

type FormValues = z.input<typeof FormSchema>;

interface OpportunityInput_ extends Omit<OpportunityInput, 'organisation_id'> {
  organisation_id: string;
}

function csvToList(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export function OpportunityForm({ id }: { id?: string }): JSX.Element {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = Boolean(id);

  const orgs = useQuery<Page<Organisation>>({
    queryKey: ['coordinator', 'organisations', { all: true }],
    queryFn: () =>
      api.get('/organisations', { query: { pageSize: 100, status: 'ACTIVE' } }),
  });

  const existing = useQuery<Opportunity>({
    queryKey: ['coordinator', 'opportunity', id],
    queryFn: () => api.get(`/opportunities/${id}`),
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
      organisation_id: '',
      title: '',
      description: '',
      start_date: '',
      end_date: '',
      application_deadline: '',
      min_hours: 1 as unknown as FormValues['min_hours'],
      openings: 1 as unknown as FormValues['openings'],
      required_competencies: '',
      eligible_programmes: '',
      supervisor_name: '',
      supervisor_email: '',
      stipend_jmd: '',
    },
  });

  useEffect(() => {
    if (!existing.data) return;
    const o = existing.data;
    reset({
      organisation_id: o.organisation_id,
      title: o.title,
      description: o.description,
      start_date: o.start_date,
      end_date: o.end_date,
      application_deadline: o.application_deadline,
      min_hours: o.min_hours as unknown as FormValues['min_hours'],
      openings: o.openings as unknown as FormValues['openings'],
      required_competencies: (o.required_competencies ?? []).join(', '),
      eligible_programmes: (o.eligible_programmes ?? []).join(', '),
      supervisor_name: o.supervisor_name ?? '',
      supervisor_email: o.supervisor_email ?? '',
      stipend_jmd: o.stipend_jmd != null ? String(o.stipend_jmd) : '',
    });
  }, [existing.data, reset]);

  const mutation = useMutation<Opportunity, unknown, OpportunityInput_>({
    mutationFn: (input) =>
      isEdit
        ? api.patch(`/opportunities/${id}`, input)
        : api.post('/opportunities', input),
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ['coordinator', 'opportunities'] });
      void qc.invalidateQueries({ queryKey: ['coordinator', 'opportunity', saved.opportunity_id] });
      void navigate({
        to: '/coordinator/opportunities/$id',
        params: { id: saved.opportunity_id },
      });
    },
  });

  function onSubmit(values: FormValues): void {
    const parsed = FormSchema.parse(values);
    const input: OpportunityInput_ = {
      organisation_id: parsed.organisation_id,
      title: parsed.title,
      description: parsed.description,
      start_date: parsed.start_date,
      end_date: parsed.end_date,
      application_deadline: parsed.application_deadline,
      min_hours: parsed.min_hours,
      openings: parsed.openings,
      required_competencies: csvToList(parsed.required_competencies),
      eligible_programmes: csvToList(parsed.eligible_programmes),
      supervisor_name: parsed.supervisor_name,
      supervisor_email: parsed.supervisor_email,
      stipend_jmd:
        parsed.stipend_jmd && parsed.stipend_jmd.length > 0
          ? Number(parsed.stipend_jmd)
          : null,
    };
    mutation.mutate(input);
  }

  if (isEdit && existing.isPending) return <LoadingState />;
  if (isEdit && existing.error) return <ErrorBanner error={existing.error} />;
  if (isEdit && existing.data && existing.data.status !== 'DRAFT') {
    return (
      <ErrorBanner
        error={
          new Error(
            `Cannot edit: this opportunity is ${existing.data.status}. Only drafts are editable.`,
          )
        }
      />
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="psms-form">
      <h1>{isEdit ? 'Edit opportunity' : 'New opportunity'}</h1>
      <ErrorBanner error={mutation.error} />

      <FieldShell label="Host organisation" error={errors.organisation_id?.message}>
        <select {...register('organisation_id')}>
          <option value="">Select an active organisation…</option>
          {orgs.data?.data.map((o) => (
            <option key={o.organisation_id} value={o.organisation_id}>
              {o.name}
            </option>
          ))}
        </select>
      </FieldShell>

      <Field label="Title" error={errors.title?.message} {...register('title')} />
      <TextAreaField
        label="Description"
        rows={6}
        error={errors.description?.message}
        {...register('description')}
      />

      <div className="psms-form__row">
        <Field
          label="Start date"
          type="date"
          error={errors.start_date?.message}
          {...register('start_date')}
        />
        <Field
          label="End date"
          type="date"
          error={errors.end_date?.message}
          {...register('end_date')}
        />
      </div>
      <Field
        label="Application deadline"
        type="date"
        error={errors.application_deadline?.message}
        hint="Must be on or before the start date."
        {...register('application_deadline')}
      />

      <div className="psms-form__row">
        <Field
          label="Minimum hours"
          type="number"
          min={1}
          error={errors.min_hours?.message}
          {...register('min_hours')}
        />
        <Field
          label="Openings"
          type="number"
          min={1}
          max={50}
          error={errors.openings?.message}
          {...register('openings')}
        />
      </div>

      <Field
        label="Required competencies (comma-separated codes)"
        hint="e.g. ICT-DEV-001, ICT-NET-002"
        error={errors.required_competencies?.message}
        {...register('required_competencies')}
      />
      <Field
        label="Eligible programmes (comma-separated codes; blank = all)"
        hint="e.g. ICT-DIP, ICT-CERT"
        error={errors.eligible_programmes?.message}
        {...register('eligible_programmes')}
      />

      <Field
        label="Supervisor name"
        error={errors.supervisor_name?.message}
        {...register('supervisor_name')}
      />
      <Field
        label="Supervisor email"
        type="email"
        error={errors.supervisor_email?.message}
        {...register('supervisor_email')}
      />
      <Field
        label="Stipend (JMD, optional)"
        type="number"
        min={0}
        error={errors.stipend_jmd?.message}
        {...register('stipend_jmd')}
      />

      <div className="psms-form__row">
        <Button type="submit" loading={mutation.isPending}>
          {isEdit ? 'Save draft' : 'Create draft'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void navigate({ to: '/coordinator/opportunities' })}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
