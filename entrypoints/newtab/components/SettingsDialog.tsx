import { useState } from 'react';
import { Check, CheckCheck } from 'lucide-react';
import type { LayoutDensity, SettingsSnapshot, Theme } from '@/lib/settings';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { settings as settingsItems } from '../lib/use-settings';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: SettingsSnapshot;
  onMarkAllRead: () => Promise<void>;
}

const TITLE_ID = 'settings-title';

const REFRESH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 180, label: 'Every 3 hours' },
];

const THEME_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const DENSITY_OPTIONS: Array<{ value: LayoutDensity; label: string }> = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onMarkAllRead,
}: SettingsDialogProps) {
  const [markedAll, setMarkedAll] = useState(false);

  async function markAll() {
    await onMarkAllRead();
    setMarkedAll(true);
    setTimeout(() => setMarkedAll(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} labelledBy={TITLE_ID}>
      <DialogHeader>
        <DialogTitle id={TITLE_ID}>Settings</DialogTitle>
        <DialogDescription>Changes apply immediately.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-5">
        <Field label="Theme">
          <Segmented
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(v) => void settingsItems.theme.setValue(v)}
          />
        </Field>

        <Field label="Density">
          <Segmented
            options={DENSITY_OPTIONS}
            value={settings.layoutDensity}
            onChange={(v) => void settingsItems.layoutDensity.setValue(v)}
          />
        </Field>

        <Field label="Refresh feeds" htmlFor="refresh-interval">
          <select
            id="refresh-interval"
            value={settings.refreshIntervalMinutes}
            onChange={(e) =>
              void settingsItems.refreshIntervalMinutes.setValue(
                Number(e.target.value),
              )
            }
            className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          >
            {REFRESH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center justify-between gap-4">
          <Label
            htmlFor="mark-read-open"
            className="flex-col items-start gap-0.5"
          >
            <span>Mark read on open</span>
            <span className="text-muted-foreground text-xs font-normal">
              Opening an item marks it as read.
            </span>
          </Label>
          <Switch
            id="mark-read-open"
            checked={settings.markReadOnOpen}
            onCheckedChange={(v) =>
              void settingsItems.markReadOnOpen.setValue(v)
            }
          />
        </div>

        <div className="flex items-center justify-between gap-4 border-t pt-4">
          <div className="text-sm">
            <div className="font-medium">Mark all as read</div>
            <div className="text-muted-foreground text-xs">
              Clears every unread marker.
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void markAll()}>
            {markedAll ? (
              <Check className="size-4 text-orange-500" />
            ) : (
              <CheckCheck className="size-4" />
            )}
            {markedAll ? 'Done' : 'Mark all read'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="bg-muted inline-flex rounded-md p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-[5px] px-2.5 py-1 text-sm font-medium transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
