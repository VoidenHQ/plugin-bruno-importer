import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { importBruRequest, importBruEnvironment } from '../utils/converter';
import { looksLikeBruEnvironmentFile } from '../utils/types';
import { importOpenCollection, looksLikeOpenCollection } from '../utils/openCollectionConverter';
import { X, XCircle } from 'lucide-react';

interface BrunoImportButtonProps {
  tab: {
    tabId: string;
    title: string;
    content: string;
    type: string;
    source?: string;
  };
  showToast?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const BrunoImportButton = ({ tab, showToast }: BrunoImportButtonProps) => {
  const [isImporting, setIsImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const cancelSignalRef = useRef<{ cancelled: boolean } | null>(null);
  const queryClient = useQueryClient();

  const handleCancel = () => {
    if (cancelSignalRef.current) cancelSignalRef.current.cancelled = true;
    setIsImporting(false);
    setProgress({ current: 0, total: 0 });
  };

  const handleImport = async () => {
    try {
      setError(null);
      setIsImporting(true);
      setProgress({ current: 0, total: 0 });

      const projects = queryClient.getQueryData<{
        projects: { path: string; name: string }[];
        activeProject: string;
      }>(['projects']);

      const activeProject = projects?.activeProject;
      if (!activeProject) {
        setError('No active project found');
        setIsImporting(false);
        return;
      }

      let content = tab.content;
      if ((!content || content.trim() === '') && tab.source) {
        content = (await (window as any).electron?.files.read(tab.source)) ?? '';
      }

      if (!content || content.trim() === '') {
        setError('Bruno file is empty');
        setIsImporting(false);
        return;
      }

      if (looksLikeOpenCollection(content)) {
        // Whole-collection import — can produce many files, so tracks
        // progress and supports cancellation, same as Postman/Insomnia.
        const signal = { cancelled: false };
        cancelSignalRef.current = signal;

        await importOpenCollection(
          content,
          activeProject,
          (current, total) => setProgress({ current, total }),
          (itemName, err) => {
            const message = err instanceof Error ? err.message : String(err);
            showToast?.(`Failed to import "${itemName}": ${message}`, 'error');
          },
          signal,
        );

        if (signal.cancelled) {
          setIsImporting(false);
          setProgress({ current: 0, total: 0 });
          return;
        }
      } else if (looksLikeBruEnvironmentFile(content)) {
        // Environment file — no request name in the content itself, so the
        // environment's name comes from its filename (Bruno's own convention).
        const envName = (tab.title || 'Bruno Environment').replace(/\.bru$/i, '');
        await importBruEnvironment(content, envName, activeProject);
      } else {
        // Single .bru request file
        await importBruRequest(content, activeProject);
      }

      setIsImporting(false);
      setImported(true);
      showToast?.('Imported into Voiden', 'success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to import';
      setError(errorMessage);
      setProgress({ current: 0, total: 0 });
      setIsImporting(false);
    }
  };

  const dismissError = () => setError(null);

  const isInProgress = isImporting && progress.total > 0 && progress.current < progress.total;

  const getButtonText = () => {
    if (isInProgress) return `Generating files... ${progress.current}/${progress.total}`;
    if (isImporting) return 'Importing...';
    if (imported) return progress.total > 0 ? `Generated ${progress.total} files` : 'Imported';
    return 'Import into Voiden';
  };

  return (
    <div className="flex flex-col gap-1">
      {!error && (
        <div className="flex items-center gap-2">
          <button
            className={`px-2 py-0.5 rounded-sm text-sm transition-all duration-200 ${
              imported ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-panel hover:bg-active text-foreground'
            }`}
            onClick={handleImport}
            disabled={isImporting}
            title="Import Bruno request or collection"
          >
            {getButtonText()}
          </button>

          {isInProgress && (
            <button onClick={handleCancel} title="Cancel" className="text-muted hover:text-red-500 transition-colors">
              <XCircle size={15} />
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between border border-red-200 rounded px-2 py-1">
          <span className="text-red-600 dark:text-red-400 text-xs">{error}</span>
          <button onClick={dismissError} className="text-red-500 hover:text-red-700 text-xs ml-2" title="Dismiss error">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
};
