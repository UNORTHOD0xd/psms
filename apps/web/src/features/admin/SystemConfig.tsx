// INP-10 — System configuration.
//
// The API whitelists four keys: banner.message, banner.severity (INFO |
// WARN | URGENT), quiet_hours.start_local (HH:mm), quiet_hours.end_local.
// PATCH accepts a partial object — only changed keys are written. We
// preload the form from GET /admin/config and submit a diff.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  Button,
  ErrorBanner,
  Field,
  FieldShell,
  LoadingState,
} from '../../components/index.js';
import { api } from '../../lib/api/client.js';

type Severity = '' | 'INFO' | 'WARN' | 'URGENT';

interface ConfigShape {
  'banner.message'?: string;
  'banner.severity'?: Severity;
  'quiet_hours.start_local'?: string;
  'quiet_hours.end_local'?: string;
}

const EMPTY: ConfigShape = {
  'banner.message': '',
  'banner.severity': '',
  'quiet_hours.start_local': '',
  'quiet_hours.end_local': '',
};

export function SystemConfig(): JSX.Element {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ConfigShape>(EMPTY);

  const query = useQuery<Record<string, unknown>>({
    queryKey: ['admin', 'config'],
    queryFn: () => api.get('/admin/config'),
  });

  useEffect(() => {
    if (!query.data) return;
    setDraft({
      'banner.message': asString(query.data['banner.message']),
      'banner.severity': asSeverity(query.data['banner.severity']),
      'quiet_hours.start_local': asString(query.data['quiet_hours.start_local']),
      'quiet_hours.end_local': asString(query.data['quiet_hours.end_local']),
    });
  }, [query.data]);

  const save = useMutation<unknown, unknown, ConfigShape>({
    mutationFn: (body) => api.patch('/admin/config', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'config'] });
    },
  });

  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorBanner error={query.error} />;

  return (
    <section>
      <h1>System configuration</h1>
      <p className="psms-list__meta">
        Banner appears at the top of every authenticated page. Quiet
        hours suppress non-urgent notifications between the start and
        end times (24-hour local).
      </p>

      <ErrorBanner error={save.error} />
      {save.isSuccess ? (
        <p className="psms-field__hint" role="status">
          Configuration saved.
        </p>
      ) : null}

      <form
        className="psms-form"
        onSubmit={(e) => {
          e.preventDefault();
          // Send all whitelisted keys; the API upserts and an empty
          // string clears a banner. Severity must be one of the enum
          // when set, so omit it when empty.
          const body: Record<string, unknown> = {
            'banner.message': draft['banner.message'] ?? '',
            'quiet_hours.start_local': draft['quiet_hours.start_local'] ?? '',
            'quiet_hours.end_local': draft['quiet_hours.end_local'] ?? '',
          };
          if (draft['banner.severity']) {
            body['banner.severity'] = draft['banner.severity'];
          } else {
            body['banner.severity'] = null;
          }
          save.mutate(body as ConfigShape);
        }}
      >
        <fieldset className="psms-fieldset">
          <legend>Banner</legend>
          <Field
            label="Message"
            type="text"
            maxLength={280}
            value={draft['banner.message'] ?? ''}
            onChange={(e) =>
              setDraft((d) => ({ ...d, 'banner.message': e.target.value }))
            }
            hint="Leave empty to hide the banner."
          />
          <FieldShell label="Severity">
            <select
              value={draft['banner.severity'] ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  'banner.severity': e.target.value as Severity,
                }))
              }
            >
              <option value="">— None —</option>
              <option value="INFO">Info</option>
              <option value="WARN">Warning</option>
              <option value="URGENT">Urgent</option>
            </select>
          </FieldShell>
        </fieldset>

        <fieldset className="psms-fieldset">
          <legend>Quiet hours</legend>
          <div className="psms-form__row">
            <Field
              label="Start (HH:mm)"
              type="time"
              value={draft['quiet_hours.start_local'] ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, 'quiet_hours.start_local': e.target.value }))
              }
            />
            <Field
              label="End (HH:mm)"
              type="time"
              value={draft['quiet_hours.end_local'] ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, 'quiet_hours.end_local': e.target.value }))
              }
            />
          </div>
          <p className="psms-field__hint">
            Wrap-around (e.g. 22:00 → 06:00) is handled server-side.
          </p>
        </fieldset>

        <Button type="submit" loading={save.isPending}>
          Save configuration
        </Button>
      </form>
    </section>
  );
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asSeverity(v: unknown): Severity {
  return v === 'INFO' || v === 'WARN' || v === 'URGENT' ? v : '';
}
