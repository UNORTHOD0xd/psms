// INP-04 (apply) + INP-07 (CV pre-sign upload).
//
// Two-step submission:
//   1. Ask the API for a presigned PUT URL for the CV file.
//   2. PUT the bytes to that URL so they never go through the JS API
//      layer; storage handles them directly.
//   3. POST /applications with the public CV URL + motivation.
//
// All three errors surface to the same form; the form does not allow a
// partial state to leave the user wondering whether the CV uploaded.

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button, ErrorBanner, FieldShell, TextAreaField } from '../../components/index.js';
import { api } from '../../lib/api/client.js';

const ApplySchema = z.object({
  motivation: z
    .string()
    .min(40, { message: 'Tell us a little more — at least 40 characters.' })
    .max(2000),
});

type ApplyValues = z.infer<typeof ApplySchema>;

interface PresignResponse {
  put_url: string;
  cv_url: string;
  storage_key: string;
  max_bytes: number;
  expires_at: string;
}

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function ApplyForm({ opportunityId }: { opportunityId: string }): JSX.Element {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [phase, setPhase] = useState<'idle' | 'presigning' | 'uploading' | 'submitting'>('idle');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApplyValues>({ resolver: zodResolver(ApplySchema) });

  async function onSubmit(values: ApplyValues): Promise<void> {
    setSubmitError(null);
    if (!file) {
      setSubmitError(new Error('Choose a CV file (PDF or DOCX) before submitting.'));
      return;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      setSubmitError(new Error('CV must be a PDF or DOCX.'));
      return;
    }
    try {
      setPhase('presigning');
      const presign = await api.post<PresignResponse>('/uploads/cv/presign', {
        content_type: file.type,
        byte_size: file.size,
      });

      setPhase('uploading');
      const putRes = await fetch(presign.put_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
        credentials: 'include',
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
      }

      setPhase('submitting');
      await api.post('/applications', {
        opportunity_id: opportunityId,
        motivation: values.motivation,
        cv_url: presign.cv_url,
      });

      void navigate({ to: '/student/applications' });
    } catch (err) {
      setSubmitError(err);
    } finally {
      setPhase('idle');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="psms-form">
      <h1>Apply</h1>
      <ErrorBanner error={submitError} />
      <TextAreaField
        label="Why are you a strong fit?"
        rows={6}
        hint="Knox students who write about specific competencies tend to score better in matching."
        error={errors.motivation?.message}
        {...register('motivation')}
      />
      <FieldShell label="CV (PDF or DOCX, up to 5 MB)">
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
          aria-required="true"
        />
      </FieldShell>
      <Button type="submit" loading={isSubmitting || phase !== 'idle'}>
        {phase === 'uploading'
          ? 'Uploading CV…'
          : phase === 'submitting'
            ? 'Submitting…'
            : 'Submit application'}
      </Button>
    </form>
  );
}
