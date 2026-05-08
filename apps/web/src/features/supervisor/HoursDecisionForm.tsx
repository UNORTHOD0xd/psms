// PRC-04 — supervisor approves or rejects a single hours-log entry.
//
// Two-mode UI: a row of two buttons (Approve / Reject) until the
// supervisor clicks Reject, at which point a comment textarea appears
// and the second click sends the rejection. APPROVE is one click.
//
// Mounted inline inside the inbox so the supervisor never leaves the
// page; on success the inbox re-queries pending hours and the row
// drops out.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, ErrorBanner, TextAreaField } from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { HoursLogEntry } from '../../lib/api/types.js';

interface Props {
  placementId: string;
  log: HoursLogEntry;
}

interface DecisionPayload {
  decision: 'APPROVE' | 'REJECT';
  rejection_comment?: string;
}

export function HoursDecisionForm({ placementId, log }: Props): JSX.Element {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<unknown>(null);

  const decide = useMutation({
    mutationFn: (body: DecisionPayload) =>
      api.post(`/placements/${placementId}/hours/${log.log_id}/decision`, body),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['supervisor', 'placement', placementId, 'hours', 'PENDING'],
      });
      // Also invalidate the student's view if the supervisor happens to
      // share the cache (defensive — they don't in practice).
      void qc.invalidateQueries({ queryKey: ['placement', placementId, 'hours'] });
    },
    onError: (err) => setError(err),
  });

  if (mode === 'rejecting') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (comment.trim().length < 5) {
            setError(new Error('Add a short reason so the student can revise.'));
            return;
          }
          decide.mutate({ decision: 'REJECT', rejection_comment: comment });
        }}
        className="psms-form psms-form--inline"
        noValidate
      >
        <ErrorBanner error={error} />
        <TextAreaField
          label="Reason for rejection"
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          hint="The student sees this verbatim."
        />
        <div className="psms-form__row">
          <Button type="submit" variant="danger" loading={decide.isPending}>
            Send rejection
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setMode('idle');
              setComment('');
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="psms-form__row">
      <ErrorBanner error={error} />
      <Button
        type="button"
        variant="primary"
        loading={decide.isPending}
        onClick={() => decide.mutate({ decision: 'APPROVE' })}
      >
        Approve
      </Button>
      <Button
        type="button"
        variant="danger"
        onClick={() => {
          setError(null);
          setMode('rejecting');
        }}
      >
        Reject
      </Button>
    </div>
  );
}
