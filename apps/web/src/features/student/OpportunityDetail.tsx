import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { ErrorBanner, LoadingState } from '../../components/index.js';
import { api } from '../../lib/api/client.js';
import type { Opportunity } from '../../lib/api/types.js';

export function OpportunityDetail({ id }: { id: string }): JSX.Element {
  const query = useQuery<Opportunity>({
    queryKey: ['opportunity', id],
    queryFn: () => api.get(`/opportunities/${id}`),
  });

  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorBanner error={query.error} />;
  if (!query.data) return <p>Not found.</p>;

  const o = query.data;
  return (
    <article className="psms-detail">
      <header>
        <h1>{o.title}</h1>
        <p className="psms-detail__meta">
          {o.organisation_name ?? 'Organisation'} · Apply by {o.application_deadline}
        </p>
      </header>
      <section>
        <h2>What you'll do</h2>
        <p>{o.description}</p>
      </section>
      <dl className="psms-detail__facts">
        <dt>Minimum hours</dt>
        <dd>{o.min_hours}</dd>
        <dt>Start</dt>
        <dd>{o.start_date}</dd>
        <dt>End</dt>
        <dd>{o.end_date}</dd>
        <dt>Openings</dt>
        <dd>{o.openings}</dd>
        {o.required_competencies && o.required_competencies.length > 0 ? (
          <>
            <dt>Required competencies</dt>
            <dd>{o.required_competencies.join(', ')}</dd>
          </>
        ) : null}
        {o.eligible_programmes && o.eligible_programmes.length > 0 ? (
          <>
            <dt>Eligible programmes</dt>
            <dd>{o.eligible_programmes.join(', ')}</dd>
          </>
        ) : null}
      </dl>
      <Link
        to="/student/opportunities/$id/apply"
        params={{ id: o.opportunity_id }}
        className="psms-btn psms-btn--primary"
      >
        Apply for this opportunity
      </Link>
    </article>
  );
}
