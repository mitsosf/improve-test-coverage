import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AiProvider } from '@coverage-improver/shared';
import * as api from '../api';

export function CoveragePage() {
  const { repoId } = useParams<{ repoId: string }>();
  const queryClient = useQueryClient();
  const [showImproveModal, setShowImproveModal] = useState<{
    fileId: string;
    filePath: string;
  } | null>(null);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['coverage', repoId],
    queryFn: () => api.getCoverage(repoId!),
    enabled: !!repoId,
    // Poll every 3 seconds when there are files being improved
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasImprovingFiles = data?.files?.some(f => f.status === 'improving');
      return hasImprovingFiles ? 3000 : false;
    },
  });

  const improveMutation = useMutation({
    mutationFn: ({ fileId, provider }: { fileId: string; provider: AiProvider }) =>
      api.createJob(repoId!, fileId, provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage', repoId] });
      setShowImproveModal(null);
    },
  });

  function getCoverageClass(percentage: number): string {
    if (percentage >= 80) return 'coverage-high';
    if (percentage >= 50) return 'coverage-medium';
    return 'coverage-low';
  }

  if (isLoading) {
    return <div className="loading">Loading coverage report...</div>;
  }

  if (error) {
    return (
      <div>
        <div className="error">{(error as Error).message}</div>
        <Link to="/" className="btn">Back to Repositories</Link>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="empty-state card">
        <h3>No coverage data</h3>
        <p>Run analysis first to see coverage.</p>
        <Link to="/" className="btn">Back to Repositories</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/" style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            ← Back to Repositories
          </Link>
          <h2 className="page-title" style={{ marginTop: '8px' }}>
            {report.repository.name}
          </h2>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--accent-blue)' }}>
            {report.summary.totalFiles}
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>Total Files</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div
            className={`coverage-badge ${getCoverageClass(report.summary.averageCoverage)}`}
            style={{ fontSize: '32px', fontWeight: 'bold', display: 'inline-block' }}
          >
            {report.summary.averageCoverage.toFixed(1)}%
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>Average Coverage</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--accent-red)' }}>
            {report.summary.filesBelowThreshold}
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>Files Below 80%</div>
        </div>
      </div>

      {/* Files Table */}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>File</th>
              <th>Coverage</th>
              <th>Uncovered Lines</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {report.files.map(file => (
              <tr key={file.id}>
                <td>
                  <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                    {file.path}
                  </span>
                </td>
                <td>
                  <span className={`coverage-badge ${getCoverageClass(file.coveragePercentage)}`}>
                    {file.coveragePercentage.toFixed(1)}%
                  </span>
                </td>
                <td>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {file.uncoveredLines.slice(0, 5).join(', ')}
                    {file.uncoveredLines.length > 5 && '...'}
                  </span>
                </td>
                <td>
                  <span className={`badge badge-${file.status}`}>
                    {file.status}
                  </span>
                </td>
                <td>
                  {file.status === 'pending' && file.coveragePercentage < 100 && (
                    <button
                      className="btn btn-primary"
                      onClick={() => setShowImproveModal({ fileId: file.id, filePath: file.path })}
                      disabled={improveMutation.isPending}
                    >
                      Improve
                    </button>
                  )}
                  {file.status === 'improving' && (
                    <Link to="/jobs" className="btn">
                      View Job
                    </Link>
                  )}
                  {file.status === 'improved' && (
                    <span style={{ color: 'var(--accent-green)' }}>Done</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Improve Modal */}
      {showImproveModal && (
        <div className="modal-overlay" onClick={() => setShowImproveModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Improve Coverage</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Generate tests for <code>{showImproveModal.filePath}</code>
            </p>

            {improveMutation.error && (
              <div className="error">{(improveMutation.error as Error).message}</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                className="btn btn-primary"
                style={{ justifyContent: 'center' }}
                onClick={() => improveMutation.mutate({ fileId: showImproveModal.fileId, provider: 'claude' })}
                disabled={improveMutation.isPending}
              >
                Use Claude
              </button>
              <button
                className="btn"
                style={{ justifyContent: 'center' }}
                onClick={() => improveMutation.mutate({ fileId: showImproveModal.fileId, provider: 'openai' })}
                disabled={improveMutation.isPending}
              >
                Use OpenAI
              </button>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowImproveModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
