import { CheckCircle2Icon, DatabaseIcon, TriangleAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SourceNote } from "@/lib/data/types";
import { formatDateTime } from "@/lib/format";

const SOURCE_LABEL: Record<SourceNote["source"], string> = {
  psx: "dps.psx.com.pk",
  khistocks: "khistocks.com",
  sample: "bundled sample data",
};

/**
 * Provenance for everything on the page. Both upstreams are scraped rather than
 * consumed through an API, so being explicit about which figures came from where —
 * and which fell back to bundled data — matters more than it would with a contract.
 */
export function SourcesPanel({ notes }: { notes: SourceNote[] }) {
  if (notes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <DatabaseIcon className="size-4" />
          Data sources
        </CardTitle>
        <CardDescription>Where each block of figures on this page came from.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {notes.map((note, index) => (
          <div key={`${note.endpoint}-${index}`} className="flex items-start gap-2.5 text-sm">
            {note.ok ? (
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[var(--gain)]" />
            ) : (
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--warn)]" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{SOURCE_LABEL[note.source]}</span>
                <Badge variant={note.source === "sample" ? "warn" : "muted"} className="font-mono text-[10px]">
                  {note.endpoint}
                </Badge>
              </div>
              {note.message ? <p className="text-muted-foreground text-xs">{note.message}</p> : null}
            </div>
            <span className="text-muted-foreground hidden shrink-0 text-[11px] sm:inline">
              {formatDateTime(note.fetchedAt)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Banner shown at the top of any page running on bundled data. */
export function SampleDataBanner({ notes }: { notes: SourceNote[] }) {
  if (!notes.some((note) => note.source === "sample")) return null;

  return (
    <div className="border-[var(--warn)]/35 bg-[var(--warn)]/10 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--warn)]" />
      <p className="text-muted-foreground">
        <span className="text-foreground font-medium">Showing sample data.</span> One or more upstream sources
        could not be reached from this deployment, so parts of this page are generated placeholders — realistic in
        shape, but not real market figures. Check the data-sources panel below for which parts.
      </p>
    </div>
  );
}
