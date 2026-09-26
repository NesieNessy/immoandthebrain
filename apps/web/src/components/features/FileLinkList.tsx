import { Icons } from '@/components/ui';

export interface FileLink {
  key: string;
  name: string;
  isImage: boolean;
  /** Still uploading — shown, but not openable yet. */
  pending?: boolean;
}

/**
 * Belege as file links (icon + name) instead of previews — opened on click.
 * `onRemove` adds a remove button per file.
 */
export function FileLinkList({
  files,
  onOpen,
  onRemove,
  emptyText = '–',
}: {
  files: FileLink[];
  onOpen: (file: FileLink) => void;
  onRemove?: (file: FileLink) => void;
  emptyText?: string | null;
}) {
  if (files.length === 0) return emptyText ? <span className="text-muted-foreground">{emptyText}</span> : null;
  return (
    <ul className="flex flex-col gap-1">
      {files.map((file) => {
        const FileIcon = file.isImage ? Icons.Image : Icons.FileText;
        return (
          <li key={file.key} className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onOpen(file)}
              disabled={file.pending}
              title={file.pending ? `${file.name} (wird hochgeladen)` : `${file.name} öffnen`}
              className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-left text-sm text-primary hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
            >
              <FileIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{file.name}</span>
            </button>
            {onRemove && !file.pending && (
              <button
                type="button"
                onClick={() => onRemove(file)}
                aria-label={`${file.name} entfernen`}
                className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Icons.X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Whether a file name looks like an image (for the icon). */
export function isImageFileName(name: string): boolean {
  return /\.(png|jpe?g|webp|gif|heic)$/i.test(name);
}
