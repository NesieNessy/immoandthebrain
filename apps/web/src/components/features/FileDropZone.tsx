"use client";

import { Button, Icons } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useRef, useState, type ReactNode } from 'react';

/**
 * Upload area with a file picker and drag & drop — Sanierung's "Bilder &
 * Unterlagen", reused by Handwerkerleistungen. Uploading itself is the
 * caller's job (`onFiles`); `children` shows what was added below the button.
 */
export function FileDropZone({
  title,
  description,
  accept,
  multiple = true,
  disabled,
  isUploading,
  error,
  onFiles,
  children,
}: {
  title: string;
  description: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  isUploading?: boolean;
  error?: string | null;
  onFiles: (files: File[]) => void;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const blocked = disabled || isUploading;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!blocked) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (!blocked) onFiles(Array.from(event.dataTransfer.files));
      }}
      className={cn(
        'rounded-lg border-2 border-dashed px-4 py-4 transition-colors',
        isDragging ? 'border-primary bg-primary/5' : 'border-border bg-background',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icons.Image className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          label="Datei auswählen"
          icon={isUploading ? <Icons.Loader2 className="animate-spin" /> : <Icons.Upload />}
          disabled={blocked}
          onClick={() => inputRef.current?.click()}
        />
        <span className="text-xs text-muted-foreground">oder hierher ziehen</span>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            onFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>
      {children && <div className="mt-3">{children}</div>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
