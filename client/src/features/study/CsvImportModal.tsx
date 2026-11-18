import { Upload } from 'lucide-react';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button, Checkbox, Modal, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { importCardsCsv } from './studyApi';

interface CsvImportModalProps {
  open: boolean;
  deckId: string;
  deckTitle: string;
  onClose: () => void;
  onImported: () => Promise<void>;
}

export function CsvImportModal({
  open,
  deckId,
  deckTitle,
  onClose,
  onImported,
}: CsvImportModalProps) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaId = useId();
  const [csvText, setCsvText] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const previewRowCount = useMemo(() => {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return 0;
    return hasHeader ? Math.max(0, lines.length - 1) : lines.length;
  }, [csvText, hasHeader]);

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      setCsvText(text);
    } catch {
      toast.show({ kind: 'error', title: 'Could not read CSV file' });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) return;
    setSubmitting(true);
    try {
      const res = await importCardsCsv(deckId, csvText, hasHeader);
      await onImported();
      toast.show({
        kind: 'success',
        title: `Imported ${res.importedCount} flashcard${res.importedCount === 1 ? '' : 's'}`,
        description:
          res.skippedRows > 0 ? `${res.skippedRows} incomplete row(s) skipped.` : undefined,
      });
      setCsvText('');
      onClose();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'CSV import failed',
        description: err instanceof ApiError ? err.message : 'Check formatting and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Import CSV into "${deckTitle}"`}
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs leading-relaxed text-muted">
          Upload a <code>.csv</code> file or paste comma-separated rows in the format{' '}
          <code>front,back[,topic]</code> (max 200 cards per batch).
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Choose CSV file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt"
            className="sr-only"
            aria-label="Upload CSV file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              void handleFileChange(file);
            }}
          />
          {previewRowCount > 0 ? (
            <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
              ~{previewRowCount} row{previewRowCount === 1 ? '' : 's'} detected
            </span>
          ) : null}
        </div>

        <div>
          <label htmlFor={textareaId} className="mb-1.5 block text-xs font-medium text-fg">
            CSV rows
          </label>
          <textarea
            id={textareaId}
            rows={7}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={
              'Front,Back,Topic\n"What is Big-O of binary search?","O(log n)",Algorithms\nStack property,LIFO,Data Structures'
            }
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-xs text-fg placeholder:text-muted/70 focus:border-primary-500 focus:outline-none"
          />
        </div>

        <Checkbox
          label="First row is a header row"
          checked={hasHeader}
          onChange={(e) => setHasHeader(e.target.checked)}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={submitting} disabled={!csvText.trim()}>
            Import flashcards
          </Button>
        </div>
      </form>
    </Modal>
  );
}
