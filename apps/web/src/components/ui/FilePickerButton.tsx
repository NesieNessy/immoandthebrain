"use client";

import { Icons } from "@/components/common";
import { useId } from "react";

interface FilePickerButtonProps {
  file: File | null;
  onSelect: (file: File | null) => void;
  accept?: string;
  label?: string;
  placeholder?: string;
  id?: string;
}

/** Field label + hidden file input + styled "choose file" button showing
 *  the currently selected file's name — the upload-modal file field shared
 *  by every "give it a name and a file" upload flow (global Dokumente page,
 *  sale-listing Unterlagen). */
export function FilePickerButton({
  file,
  onSelect,
  accept,
  label = "Datei",
  placeholder = "Datei auswählen",
  id,
}: FilePickerButtonProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="block mb-2 text-sm text-foreground">{label}</label>
      )}
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={inputId}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-primary text-primary text-sm font-medium cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground"
      >
        <Icons.Upload className="w-4 h-4" />
        {file ? file.name : placeholder}
      </label>
    </div>
  );
}
