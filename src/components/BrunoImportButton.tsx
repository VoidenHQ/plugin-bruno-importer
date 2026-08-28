import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { importBruRequest } from '../utils/converter';
import { X } from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleImport = async () => {
    try {
      setError(null);
      setIsImporting(true);

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
        setError('Bruno request file is empty');
        setIsImporting(false);
        return;
      }

      await importBruRequest(content, activeProject);

      setIsImporting(false);
      setImported(true);
      showToast?.('Imported into Voiden', 'success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to import request';
      setError(errorMessage);
      setIsImporting(false);
    }
  };

  const dismissError = () => setError(null);

  return (
    <div className="flex flex-col gap-1">
      {!error && (
        <button
          className={`px-2 py-0.5 rounded-sm text-sm transition-all duration-200 ${
            imported ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-panel hover:bg-active text-foreground'
          }`}
          onClick={handleImport}
          disabled={isImporting}
          title="Import Bruno request"
        >
          {isImporting ? 'Importing...' : imported ? 'Imported' : 'Import into Voiden'}
        </button>
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
