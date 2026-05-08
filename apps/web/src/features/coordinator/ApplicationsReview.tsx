// INP-04 — Coordinator review of student applications.
//
// Lists applications with their PRC-02 score snapshot, lets the
// coordinator approve or decline. Approve is one click (the API
// auto-creates the placement and dispatches an onboarding magic-link to
// the supervisor — see applications/router.ts:299). Decline requires
// a reason (server-side rule).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Pagination,
  TextAreaField,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type {
  Application,
  ApplicationStatus,
  Page,
} from '../../lib/api/types.js';

type StatusFilter = '' | ApplicationStatus;

export function ApplicationsReview(): JSX.Element {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('SUBMITTED');

  const query = useQuery<Page<Application>>({
    queryKey: ['coordinator', 'applications', { page, status }],
    queryFn: () =>
      api.get('/applications', {
        query: { page, pageSize: 25, ...(status ? { status } : {}) },
      }),
  });

  return (
    <section>
      <h1>Applications</h1>

      <form
        className="psms-form psms-form--inline psms-form__row"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="psms-field__label-text" htmlFor="app-status">
          Status
        </label>
        <select
          id="app-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            setPage(1);
          }}
        >
          <option value="">All</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="UNDER_REVIEW">Under review</option>
          <option value="APPROVED">Approved</option>
          <option value="DECLINED">Declined</option>
          <option value="WITHDRAWN">Withdrawn</option>
        </select>
      </form>

      {query.isPending ? <LoadingState /> : null}
      <ErrorBanner error={query.error} />
      {query.data && query.data.data.length === 0 ? (
        <EmptyState title="No applications match" />
      ) : null}

      <ul className="psms-list">
        {query.data?.data.map((a) => (
          <ApplicationRow key={a.application_id} application={a} />
        ))}
      </ul>

      {query.data ? (
        <Pagination
          page={query.data.page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onChange={setPage}
        />
      ) : null}
    </section>
  );
}

function ApplicationRow({ application }: { application: Application }): JSX.Element {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'idle' | 'declining'>('idle');
  const [reason, setReason] = useState('');

  const decide = useMutation<
    Application,
    unknown,
    { decision: 'APPROVE' | 'DECLINE'; decline_reason?: string }
  >({
    mutationFn: (body) =>
      api.post(`/applications/${application.application_id}/decision`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coordinator', 'applications'] });
      void qc.invalidateQueries({ queryKey: ['coordinator', 'dashboard'] });
    },
  });

  const isPending = application.status === 'SUBMITTED' || application.status === 'UNDER_REVIEW';

  return (
    <li className="psms-list__row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <strong>{application.opportunity_title ?? 'Opportunity'}</strong>
        <p className="psms-list__meta">
          {application.organisation_name ?? '—'} · Submitted{' '}
          {new Date(application.submitted_at).toLocaleDateString()}
          {application.score != null ? (
            <span className="psms-score"> · Score {application.score.toFixed(2)}</span>
          ) : null}
          <span style={{ marginLeft: '0.5rem' }}>
            <span className={`psms-status psms-status--${application.status.toLowerCase()}`}>
              {application.status}
            </span>
          </span>
        </p>
        {application.motivation ? (
          <details>
            <summary>Motivation</summary>
            <p style={{ whiteSpace: 'pre-wrap' }}>{application.motivation}</p>
          </details>
        ) : null}
        {application.cv_url ? (
          <p className="psms-list__meta">
            <a href={application.cv_url} target="_blank" rel="noreferrer">
              View CV
            </a>
          </p>
        ) : null}
        {application.decline_reason ? (
          <p className="psms-list__meta">
            <strong>Decline reason:</strong> {application.decline_reason}
          </p>
        ) : null}
        <ErrorBanner error={decide.error} />
      </div>

      <div className="psms-form__row" style={{ alignSelf: 'flex-end' }}>
        {isPending && mode === 'idle' ? (
          <>
            <Button
              variant="primary"
              loading={decide.isPending}
              onClick={() => {
                if (
                  confirm(
                    'Approve this application? This creates a placement and emails an onboarding link to the supervisor.',
                  )
                ) {
                  decide.mutate({ decision: 'APPROVE' });
                }
              }}
            >
              Approve
            </Button>
            <Button variant="danger" onClick={() => setMode('declining')}>
              Decline…
            </Button>
          </>
        ) : null}
        {isPending && mode === 'declining' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length < 5) return;
              decide.mutate(
                { decision: 'DECLINE', decline_reason: reason.trim() },
                { onSuccess: () => setMode('idle') },
              );
            }}
            className="psms-form psms-form--inline"
          >
            <TextAreaField
              label="Decline reason (visible to student)"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
            <div className="psms-form__row">
              <Button
                type="submit"
                variant="danger"
                loading={decide.isPending}
                disabled={reason.trim().length < 5}
              >
                Send decline
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMode('idle');
                  setReason('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </li>
  );
}
