// Import your icons (example using lucide-react)
import {
  ArrowLeft, ArrowRight,
  BookCheck,
  Calculator,
  Check,
  Edit3,
  ExternalLink,
  FileText, Play,
  Plus,
  Save,
  ScanLine,
  Trash2,
  Undo2,
  Upload,
  X
} from 'lucide-react';

// 1. Define the button types (keys) as an Enum
enum ButtonType {
  Cancel = 'Cancel',
  Save = 'Save',
  Previous = 'Previous',
  Next = 'Next',
  Back = 'Back',
  Create = 'Create',
  UseCases = 'UseCases',
  RequestAppraisal = 'RequestAppraisal',
  Start = 'Start',
  ImportFromPortal = 'ImportFromPortal',
  ScanExpose = 'ScanExpose',
  EnterManually = 'EnterManually',
  Calculate = 'Calculate',
  TakeOver = 'TakeOver',
  Discard = 'Discard',
  AddProperty = 'AddProperty',
  AddQuickCheck = 'AddQuickCheck',
  Delete = 'Delete',
  Open = 'Open',
  Edit = 'Edit',
  OpenResult = 'OpenResult',
  StartDetailCheck = 'StartDetailCheck',
  OpenDetailCheck = 'OpenDetailCheck',
  AddDetailCheck = 'AddDetailCheck',
}

// 2. Define the structure for your button properties
export interface ButtonConfig {
  label: string;
  icon: React.ElementType; // Use 'string' if you use image paths instead of component references
}

// 3. Create the mapping object that combines the label and the icon
export const BUTTON_DETAILS: Record<ButtonType, ButtonConfig> = {
  [ButtonType.Cancel]:           { label: 'Abbrechen',               icon: X },
  [ButtonType.Save]:             { label: 'Speichern',               icon: Save },
  [ButtonType.Previous]:         { label: 'Vorheriges',              icon: ArrowLeft },
  [ButtonType.Next]:             { label: 'Nächstes',                icon: ArrowRight },
  [ButtonType.Back]:             { label: 'Zurück',                  icon: ArrowLeft },
  [ButtonType.Create]:           { label: 'Erstellen',               icon: Plus },
  [ButtonType.UseCases]:         { label: 'Bearbeiten',              icon: Edit3 },
  [ButtonType.RequestAppraisal]: { label: 'Gutachten anfordern',     icon: FileText },
  [ButtonType.Start]:            { label: 'Starten',                 icon: Play },
  [ButtonType.ImportFromPortal]: { label: 'Aus Portal importieren',  icon: Upload },
  [ButtonType.ScanExpose]:       { label: 'Expose scannen',          icon: ScanLine },
  [ButtonType.EnterManually]:    { label: 'Manuell eingeben',        icon: Edit3 },
  [ButtonType.Calculate]:        { label: 'Berechnen',               icon: Calculator },
  [ButtonType.TakeOver]:         { label: 'Übernehmen',              icon: Check },
  [ButtonType.Discard]:          { label: 'Verwerfen',               icon: Undo2 },
  [ButtonType.AddProperty]:      { label: 'Objekt hinzufügen',       icon: Plus },
  [ButtonType.AddQuickCheck]:    { label: 'Neue Ersteinschätzung',   icon: Plus },
  [ButtonType.Delete]:           { label: 'Löschen',                 icon: Trash2 },
  [ButtonType.Open]:             { label: 'Öffnen',                  icon: ExternalLink },
  [ButtonType.Edit]:             { label: 'Bearbeiten',              icon: Edit3 },
  [ButtonType.OpenResult]:       { label: 'Ergebnis öffnen',         icon: ExternalLink },
  [ButtonType.StartDetailCheck]: { label: 'Detailbewertung starten', icon: BookCheck },
  [ButtonType.OpenDetailCheck]:  { label: 'Detailbewertung öffnen',  icon: ExternalLink },
  [ButtonType.AddDetailCheck]:   { label: 'Neue Detailbewertung',    icon: Plus },
};