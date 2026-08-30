import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  getListAttendeesQueryKey,
  getListCirclesQueryKey,
  getListHubRegistrationsQueryKey,
  type Attendee,
  useCreateAttendee,
  useDeleteAttendee,
  useImportAttendees,
  useListAttendees,
  useListHubRegistrations,
  useDeleteHubRegistration,
} from "@workspace/api-client-react";
import { useActiveCircle } from "@/contexts/CircleContext";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, Users, Target, ClipboardList, Plus } from "lucide-react";

const MAX_CSV_BYTES = 1_000_000;
const MAX_IMPORT_ROWS = 1_000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const attendeeTemplateCsv = [
  "name,email,company",
  "Alex Morgan,alex.morgan@example.com,Example Company",
].join("\n");

type PreviewStatus = "valid" | "invalid" | "duplicate_file" | "duplicate_existing";

interface PreviewRow {
  rowNumber: number;
  name: string;
  email: string;
  company: string;
  status: PreviewStatus;
  errors: string[];
}

interface ImportSummary {
  createdCount: number;
  skippedCount: number;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (inQuotes) {
      if (character === '"' && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        currentValue += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      currentRow.push(currentValue);
      currentValue = "";
    } else if (character === "\n") {
      currentRow.push(currentValue);
      if (currentRow.some((value) => value.trim() !== "")) rows.push(currentRow);
      currentRow = [];
      currentValue = "";
    } else if (character !== "\r") {
      currentValue += character;
    }
  }

  if (currentValue !== "" || currentRow.length > 0) {
    currentRow.push(currentValue);
    if (currentRow.some((value) => value.trim() !== "")) rows.push(currentRow);
  }

  return rows;
}

function getStatusLabel(status: PreviewStatus): string {
  if (status === "valid") return "Ready";
  if (status === "invalid") return "Needs attention";
  if (status === "duplicate_file") return "Duplicate in file";
  return "Already registered";
}

function getStatusVariant(status: PreviewStatus): "default" | "secondary" | "destructive" {
  if (status === "valid") return "default";
  if (status === "invalid") return "destructive";
  return "secondary";
}

function downloadAttendeeTemplate() {
  const blob = new Blob([`${attendeeTemplateCsv}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "attendee-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function AdminAttendees() {
  const queryClient = useQueryClient();
  const { activeCircleId, activeCircle } = useActiveCircle();
  const params = activeCircleId !== null ? { circleId: activeCircleId } : undefined;
  const { data: attendees = [], isLoading } = useListAttendees(params, {
    query: { enabled: activeCircleId !== null, queryKey: getListAttendeesQueryKey(params) },
  });
  const createAttendee = useCreateAttendee();
  const deleteAttendee = useDeleteAttendee();
  const importAttendees = useImportAttendees();
  const deleteRegistration = useDeleteHubRegistration();

  const isRecurring = activeCircle?.cadence !== "one-off";
  const { data: registrations = [], isLoading: isLoadingRegistrations } = useListHubRegistrations(
    activeCircleId ?? 0,
    {
      query: {
        enabled: activeCircleId !== null && isRecurring,
        queryKey: getListHubRegistrationsQueryKey(activeCircleId ?? 0),
      },
    }
  );

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<PreviewRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Attendee | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteRegistrationTarget, setDeleteRegistrationTarget] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingEmails = useMemo(
    () => new Set(attendees.map((attendee) => attendee.email.trim().toLowerCase())),
    [attendees],
  );
  const validImportRows = importRows.filter((row) => row.status === "valid");
  const skippedImportRows = importRows.length - validImportRows.length;
  const canImport = activeCircleId !== null && activeCircle?.status === "active";

  const invalidateAttendeeQueries = () => {
    queryClient.invalidateQueries({ queryKey: getListAttendeesQueryKey(params) });
    queryClient.invalidateQueries({ queryKey: getListAttendeesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCirclesQueryKey() });
    if (activeCircleId !== null) {
      queryClient.invalidateQueries({ queryKey: getListHubRegistrationsQueryKey(activeCircleId) });
    }
    queryClient.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        query.queryKey[0].startsWith("/api/meetings/") &&
        query.queryKey[0].endsWith("/invitees"),
    });
  };

  const addImportedAttendeesToCache = (created: Attendee[]) => {
    const imported = created.map((attendee) => ({
      ...attendee,
      lastActivityAt: null,
      goalCount: 0,
      surveyResponseCount: 0,
    }));
    const mergeAttendees = (current: typeof attendees | undefined) => {
      const byId = new Map((current ?? []).map((attendee) => [attendee.id, attendee]));
      for (const attendee of imported) byId.set(attendee.id, attendee);
      return [...byId.values()].sort((first, second) => first.name.localeCompare(second.name));
    };

    queryClient.setQueryData<typeof attendees>(getListAttendeesQueryKey(params), mergeAttendees);
    queryClient.setQueryData<typeof attendees>(getListAttendeesQueryKey(), mergeAttendees);
  };

  const resetImport = () => {
    setImportFileName(null);
    setImportRows([]);
    setImportError(null);
    setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeCircleId === null) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const company = (formData.get("company") as string).trim();
    setCreateError(null);

    createAttendee.mutate(
      {
        data: {
          name: (formData.get("name") as string).trim(),
          email: (formData.get("email") as string).trim(),
          company: company || undefined,
          circleId: activeCircleId,
        },
      },
      {
        onSuccess: () => {
          invalidateAttendeeQueries();
          form.reset();
          setIsAddOpen(false);
        },
        onError: (error) => setCreateError(error.message || "Unable to add attendee."),
      },
    );
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportRows([]);
    setImportSummary(null);
    setImportError(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError("Choose a CSV file.");
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setImportError("CSV files must be smaller than 1 MB.");
      return;
    }
    if (isLoading) {
      setImportError("Current attendees are still loading. Please choose the file again in a moment.");
      return;
    }

    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) {
        setImportError("The CSV must include a header row and at least one contact.");
        return;
      }
      if (rows.length - 1 > MAX_IMPORT_ROWS) {
        setImportError(`CSV files can contain up to ${MAX_IMPORT_ROWS.toLocaleString()} contacts.`);
        return;
      }

      const headers = rows[0].map((header, index) =>
        header.trim().replace(index === 0 ? /^\uFEFF/ : /^/, "").toLowerCase(),
      );
      const nameColumn = headers.indexOf("name");
      const emailColumn = headers.indexOf("email");
      const companyColumn = headers.indexOf("company");

      if (nameColumn === -1 || emailColumn === -1) {
        setImportError('The CSV must have "name" and "email" columns. "company" is optional.');
        return;
      }

      const seenEmails = new Set<string>();
      const previewRows = rows.slice(1).map((values, index): PreviewRow => {
        const rowNumber = index + 2;
        const name = values[nameColumn]?.trim() ?? "";
        const email = values[emailColumn]?.trim().toLowerCase() ?? "";
        const company = companyColumn >= 0 ? values[companyColumn]?.trim() ?? "" : "";
        const errors: string[] = [];

        if (!name) errors.push("Name is required");
        if (!email) errors.push("Email is required");
        else if (!emailPattern.test(email)) errors.push("Email is not valid");

        let status: PreviewStatus = errors.length > 0 ? "invalid" : "valid";
        if (status === "valid") {
          if (existingEmails.has(email)) status = "duplicate_existing";
          else if (seenEmails.has(email)) status = "duplicate_file";
          else seenEmails.add(email);
        }

        return { rowNumber, name, email, company, status, errors };
      });
      setImportRows(previewRows);
    } catch {
      setImportError("Unable to read this file. Please choose a valid CSV.");
    }
  };

  const handleImport = () => {
    if (!canImport || validImportRows.length === 0) return;
    setImportError(null);

    importAttendees.mutate(
      {
        data: {
          circleId: activeCircleId,
          attendees: validImportRows.map(({ name, email, company }) => ({
            name,
            email,
            company: company || undefined,
          })),
        },
      },
      {
        onSuccess: (result) => {
          addImportedAttendeesToCache(result.created);
          invalidateAttendeeQueries();
          setImportSummary({
            createdCount: result.createdCount,
            skippedCount: skippedImportRows + result.skippedCount,
          });
        },
        onError: (error) => setImportError(error.message || "Unable to import attendees."),
      },
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    deleteAttendee.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          invalidateAttendeeQueries();
          setDeleteTarget(null);
        },
        onError: (error) => setDeleteError(error.message || "Unable to delete attendee."),
      },
    );
  };

  const handleDeleteRegistration = () => {
    if (deleteRegistrationTarget === null || activeCircleId === null) return;
    deleteRegistration.mutate(
      { id: activeCircleId, registrationId: deleteRegistrationTarget },
      {
        onSuccess: () => {
          invalidateAttendeeQueries();
          setDeleteRegistrationTarget(null);
        },
      }
    );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendees</h1>
          <p className="text-muted-foreground mt-2" data-testid="text-attendee-count">
            {attendees.length} member{attendees.length !== 1 ? "s" : ""} in the hub.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={downloadAttendeeTemplate}
            data-testid="button-download-attendee-template"
          >
            <Download className="mr-2 h-4 w-4" />
            Download CSV template
          </Button>
          <Dialog
            open={isImportOpen}
            onOpenChange={(open) => {
              setIsImportOpen(open);
              if (!open) resetImport();
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!canImport} data-testid="button-open-attendee-import">
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{importSummary ? "Import complete" : "Import attendees from CSV"}</DialogTitle>
                <DialogDescription>
                  {importSummary
                    ? "Your Hub roster has been updated."
                    : activeCircle
                      ? `Add contacts to ${activeCircle.name}. Use a CSV with name, email, and optional company columns.`
                      : "Select a Hub before importing attendees."}
                </DialogDescription>
              </DialogHeader>

              {importSummary ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold" data-testid="text-import-created-count">
                        {importSummary.createdCount} attendee{importSummary.createdCount !== 1 ? "s" : ""} added
                      </p>
                      {importSummary.skippedCount > 0 && (
                        <p className="mt-1 text-sm">
                          {importSummary.skippedCount} row{importSummary.skippedCount !== 1 ? "s" : ""} skipped because
                          they were invalid or already registered.
                        </p>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => setIsImportOpen(false)}
                      data-testid="button-close-import-summary"
                    >
                      Done
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <>
                  {!importFileName && (
                    <div className="rounded-lg border border-dashed p-8 text-center">
                      <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground" />
                      <p className="mt-3 font-medium">Choose a CSV contact list</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Required columns: name and email. Optional column: company.
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Imports are added to the active Hub. The template includes an example row you can replace.
                      </p>
                      <input
                        ref={fileInputRef}
                        id="attendee-csv-file"
                        type="file"
                        accept=".csv,text/csv"
                        className="sr-only"
                        onChange={handleFileChange}
                        data-testid="input-attendee-csv-file"
                      />
                      <Button
                        type="button"
                        className="mt-5"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="button-choose-attendee-csv"
                      >
                        Choose CSV file
                      </Button>
                    </div>
                  )}

                  {importFileName && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium" data-testid="text-import-file-name">
                            {importFileName}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          data-testid="button-replace-attendee-csv"
                        >
                          Choose different file
                        </Button>
                      </div>

                      {importRows.length > 0 && (
                        <>
                          <div className="flex flex-wrap gap-2 text-sm" data-testid="text-import-preview-summary">
                            <Badge>{validImportRows.length} ready to import</Badge>
                            {skippedImportRows > 0 && (
                              <Badge variant="secondary">{skippedImportRows} will be skipped</Badge>
                            )}
                          </div>
                          <ScrollArea className="h-72 rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Row</TableHead>
                                  <TableHead>Name</TableHead>
                                  <TableHead>Email</TableHead>
                                  <TableHead>Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {importRows.map((row) => (
                                  <TableRow key={row.rowNumber} data-testid={`row-import-preview-${row.rowNumber}`}>
                                    <TableCell className="text-muted-foreground">{row.rowNumber}</TableCell>
                                    <TableCell className="max-w-40 truncate">{row.name || "—"}</TableCell>
                                    <TableCell className="max-w-56 truncate">{row.email || "—"}</TableCell>
                                    <TableCell>
                                      <div className="space-y-1">
                                        <Badge
                                          variant={getStatusVariant(row.status)}
                                          data-testid={`status-import-row-${row.rowNumber}`}
                                        >
                                          {getStatusLabel(row.status)}
                                        </Badge>
                                        {row.errors.map((error) => (
                                          <p key={error} className="text-xs text-destructive">{error}</p>
                                        ))}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </>
                      )}
                    </div>
                  )}

                  {importError && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive" data-testid="alert-import-error">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{importError}</span>
                    </div>
                  )}

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsImportOpen(false)}
                      data-testid="button-cancel-attendee-import"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleImport}
                      disabled={validImportRows.length === 0 || importAttendees.isPending}
                      data-testid="button-confirm-attendee-import"
                    >
                      {importAttendees.isPending
                        ? "Importing..."
                        : `Import ${validImportRows.length} attendee${validImportRows.length !== 1 ? "s" : ""}`}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>

          <Dialog
            open={isAddOpen}
            onOpenChange={(open) => {
              setIsAddOpen(open);
              if (!open) setCreateError(null);
            }}
          >
            <DialogTrigger asChild>
              <Button disabled={activeCircleId === null} data-testid="button-open-add-attendee">
                <Plus className="mr-2 h-4 w-4" />
                Add Attendee
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Attendee</DialogTitle>
                <DialogDescription>
                  {activeCircle
                    ? `This attendee will be added to ${activeCircle.name}.`
                    : "Select a Hub before adding an attendee."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="attendee-name">Name</Label>
                  <Input id="attendee-name" name="name" required autoComplete="name" data-testid="input-attendee-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="attendee-email">Email</Label>
                  <Input id="attendee-email" name="email" type="email" required autoComplete="email" data-testid="input-attendee-email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="attendee-company">Company <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="attendee-company" name="company" autoComplete="organization" data-testid="input-attendee-company" />
                </div>
                {createError && (
                  <p role="alert" className="text-sm text-destructive" data-testid="alert-create-attendee-error">{createError}</p>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} data-testid="button-cancel-add-attendee">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createAttendee.isPending} data-testid="button-submit-add-attendee">
                    {createAttendee.isPending ? "Adding..." : "Add Attendee"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : attendees.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-gray-50/50">
          <Users className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-500">No attendees yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {attendees.map((a) => (
            <Card key={a.id} data-testid={`card-attendee-${a.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate" data-testid={`text-attendee-name-${a.id}`}>{a.name}</p>
                      {a.role === "admin" && (
                        <Badge variant="secondary" className="shrink-0">Admin</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate" data-testid={`text-attendee-email-${a.id}`}>{a.email}</p>
                  </div>
                </div>

                {a.company && (
                  <p className="text-xs text-muted-foreground truncate">{a.company}</p>
                )}

                <div className="flex items-center justify-between border-t pt-3 text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Target className="h-3.5 w-3.5" />
                    <span className="font-semibold text-foreground">{(a as any).goalCount ?? 0}</span> Goals
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ClipboardList className="h-3.5 w-3.5" />
                    <span className="font-semibold text-foreground">{(a as any).surveyResponseCount ?? 0}</span> Surveys
                  </span>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Joined {format(new Date(a.createdAt), "MMM d, yyyy")}
                </p>
                {a.role !== "admin" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(a);
                    }}
                    data-testid={`button-delete-attendee-${a.id}`}
                  >
                    Delete attendee
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Registrations Section */}
      {isRecurring && activeCircleId !== null && (
        <div className="pt-8 border-t space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Public Registrations</h2>
            <p className="text-muted-foreground text-sm max-w-3xl">
              Pending registrations automatically become attendees when a new meeting is created. You can then select invitees from the meeting screen. No automated emails are sent to pending registrants.
            </p>
          </div>

          {isLoadingRegistrations ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : registrations.length === 0 ? (
            <div className="text-center py-10 border rounded-lg bg-gray-50/50">
              <ClipboardList className="mx-auto h-8 w-8 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No public registrations.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {registrations.map((r) => {
                const isPromoted = r.promotedAt !== null;
                return (
                  <Card key={r.id} data-testid={`card-registration-${r.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate" data-testid={`text-registration-name-${r.id}`}>{r.name}</p>
                          <p className="text-xs text-muted-foreground truncate" data-testid={`text-registration-email-${r.id}`}>{r.email}</p>
                        </div>
                        <Badge variant={isPromoted ? "secondary" : "default"} className="shrink-0 text-[10px]">
                          {isPromoted ? "Added" : "Pending"}
                        </Badge>
                      </div>
                      {r.company && <p className="text-xs text-muted-foreground truncate">{r.company}</p>}
                      <div className="flex items-center justify-between border-t pt-3 mt-2">
                        <p className="text-[11px] text-muted-foreground">
                          {format(new Date(r.createdAt), "MMM d, yyyy")}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-destructive hover:bg-destructive/10 hover:text-destructive px-2 text-xs"
                          onClick={() => setDeleteRegistrationTarget(r.id)}
                          data-testid={`button-delete-registration-${r.id}`}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteAttendee.isPending) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete attendee?</DialogTitle>
            <DialogDescription>
              This permanently removes {deleteTarget?.name ?? "this attendee"} from {activeCircle?.name ?? "this Hub"}{" "}
              and deletes their Hub activity, including goals, survey responses, invitations, and meeting RSVP records.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive" data-testid="alert-delete-attendee-error">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteAttendee.isPending}
              data-testid="button-cancel-delete-attendee"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteAttendee.isPending}
              data-testid="button-confirm-delete-attendee"
            >
              {deleteAttendee.isPending ? "Deleting..." : "Delete attendee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleteRegistrationTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteRegistration.isPending) {
            setDeleteRegistrationTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete registration?</DialogTitle>
            <DialogDescription>
              This removes the public registration record. If the user has already been promoted to an attendee, their attendee record is unaffected. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteRegistrationTarget(null)}
              disabled={deleteRegistration.isPending}
              data-testid="button-cancel-delete-registration"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteRegistration}
              disabled={deleteRegistration.isPending}
              data-testid="button-confirm-delete-registration"
            >
              {deleteRegistration.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}