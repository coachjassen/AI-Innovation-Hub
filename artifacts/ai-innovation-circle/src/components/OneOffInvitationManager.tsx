import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateMeeting,
  useRequestUploadUrl,
  useListMeetingInvitees,
  useSetMeetingInvitees,
  useSendOneOffInvitations,
  useResendOneOffInvitation,
  getListMeetingsQueryKey,
  getListMeetingInviteesQueryKey,
  Meeting,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Paperclip, Send, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export function OneOffInvitationManager({ meeting, onDone }: { meeting: Meeting; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [body, setBody] = useState(meeting.invitationBody || "");
  const [file, setFile] = useState<File | null>(null);
  
  const updateMeeting = useUpdateMeeting();
  const requestUpload = useRequestUploadUrl();

  const handleSaveMessage = async () => {
    try {
      if (!meeting.invitationAttachmentPath && !file) {
        toast({ title: "Attachment required", description: "Please upload a file attachment for the invitation.", variant: "destructive" });
        return;
      }

      let attachmentPath = meeting.invitationAttachmentPath;
      let attachmentName = meeting.invitationAttachmentName;
      let attachmentType = meeting.invitationAttachmentContentType;

      if (file) {
        if (file.size > 15 * 1024 * 1024) {
          toast({ title: "File too large", description: "Maximum size is 15MB", variant: "destructive" });
          return;
        }
        const allowedTypes = [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ];
        if (!allowedTypes.includes(file.type)) {
          toast({ title: "Invalid file type", description: "Only PDF, DOC, and DOCX are allowed", variant: "destructive" });
          return;
        }

        const { uploadURL, objectPath } = await requestUpload.mutateAsync({
          data: { name: file.name, size: file.size, contentType: file.type }
        });

        const uploadRes = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload file");
        }

        attachmentPath = objectPath;
        attachmentName = file.name;
        attachmentType = file.type;
      }

      await updateMeeting.mutateAsync({
        id: meeting.id,
        data: {
          invitationBody: body,
          invitationAttachmentPath: attachmentPath || undefined,
          invitationAttachmentName: attachmentName || undefined,
          invitationAttachmentContentType: attachmentType || undefined,
        }
      });

      queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
      toast({ title: "Message saved", description: "The invitation message and attachment were saved." });
      setFile(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save message", variant: "destructive" });
    }
  };

  const { data: invitees = [], isLoading: isLoadingInvitees } = useListMeetingInvitees(meeting.id);
  const setInvitees = useSetMeetingInvitees();
  const sendInvitations = useSendOneOffInvitations();
  const resendInvitation = useResendOneOffInvitation();

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  useEffect(() => {
    setSelectedIds(invitees.filter((i) => i.invited).map((i) => i.attendeeId));
  }, [invitees]);

  const handleSaveInvitees = async () => {
    try {
      await setInvitees.mutateAsync({ id: meeting.id, data: { attendeeIds: selectedIds } });
      queryClient.invalidateQueries({ queryKey: getListMeetingInviteesQueryKey(meeting.id) });
      queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
      toast({ title: "Invitees saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save invitees", variant: "destructive" });
    }
  };

  const handleSendToUnsent = async () => {
    try {
      const res = await sendInvitations.mutateAsync({ id: meeting.id });
      queryClient.invalidateQueries({ queryKey: getListMeetingInviteesQueryKey(meeting.id) });
      queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() });
      
      if (res.failures && res.failures.length > 0) {
        toast({ 
          title: `Sent ${res.sentCount} invitations`, 
          description: `${res.failures.length} failed to send.`,
          variant: "destructive"
        });
      } else {
        toast({ title: "Success", description: `Sent ${res.sentCount} invitations successfully.` });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send invitations", variant: "destructive" });
    }
  };

  const handleResend = async (attendeeId: number) => {
    try {
      await resendInvitation.mutateAsync({ id: meeting.id, attendeeId });
      queryClient.invalidateQueries({ queryKey: getListMeetingInviteesQueryKey(meeting.id) });
      toast({ title: "Invitation resent" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to resend", variant: "destructive" });
    }
  };

  const hasUnsavedInvitees = (() => {
    const original = invitees.filter(i => i.invited).map(i => i.attendeeId).sort().join(',');
    const current = [...selectedIds].sort().join(',');
    return original !== current;
  })();

  const unsentCount = invitees.filter(i => i.invited && !i.invitationSentAt).length;

  return (
    <div className="space-y-8">
      {/* Message Section */}
      <div className="space-y-4 rounded-md border p-4 bg-muted/20">
        <h3 className="text-sm font-semibold">1. Invitation Message</h3>
        <div className="space-y-2">
          <Label>Message Body</Label>
          <Textarea 
            value={body} 
            onChange={(e) => setBody(e.target.value)} 
            placeholder="Write the invitation details here..."
            className="min-h-[100px]"
          />
        </div>
        <div className="space-y-2">
          <Label>Attachment (PDF, DOC, DOCX up to 15MB)</Label>
          {meeting.invitationAttachmentName && !file && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded-md">
              <Paperclip className="h-4 w-4" />
              <span>Current: {meeting.invitationAttachmentName}</span>
            </div>
          )}
          <Input 
            type="file" 
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
        <Button 
          onClick={handleSaveMessage} 
          disabled={updateMeeting.isPending || requestUpload.isPending}
        >
          {updateMeeting.isPending || requestUpload.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save Message & Attachment
        </Button>
      </div>

      {/* Invitees Section */}
      <div className="space-y-4 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">2. Select Invitees & Send</h3>
          <div className="space-x-2">
            {hasUnsavedInvitees && (
              <Button size="sm" variant="secondary" onClick={handleSaveInvitees} disabled={setInvitees.isPending}>
                {setInvitees.isPending ? "Saving..." : "Save Selection"}
              </Button>
            )}
            <Button size="sm" onClick={handleSendToUnsent} disabled={sendInvitations.isPending || unsentCount === 0 || hasUnsavedInvitees}>
              <Send className="h-4 w-4 mr-2" />
              Send to {unsentCount} Unsent
            </Button>
          </div>
        </div>

        {isLoadingInvitees ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto divide-y border rounded-md">
            {invitees.length === 0 ? (
              <p className="p-4 text-sm text-center text-muted-foreground">No members in this Hub.</p>
            ) : (
              invitees.map((invitee) => {
                const isSelected = selectedIds.includes(invitee.attendeeId);
                return (
                  <div key={invitee.attendeeId} className="flex items-center justify-between p-3 hover:bg-muted/50">
                    <label htmlFor={`invitee-${invitee.attendeeId}`} className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                      <Checkbox
                        id={`invitee-${invitee.attendeeId}`}
                        checked={isSelected}
                        onCheckedChange={(c) => {
                          setSelectedIds(curr => c ? [...curr, invitee.attendeeId] : curr.filter(id => id !== invitee.attendeeId));
                        }}
                      />
                      <div className="truncate">
                        <p className="text-sm font-medium truncate">{invitee.attendeeName}</p>
                        <p className="text-xs text-muted-foreground truncate">{invitee.attendeeEmail}</p>
                      </div>
                    </label>
                    <div className="flex items-center gap-3 pl-4">
                      {invitee.invited && invitee.invitationSentAt ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="inline-flex items-center text-xs text-green-700 font-medium">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Sent {format(new Date(invitee.invitationSentAt), "MMM d")}
                          </span>
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => handleResend(invitee.attendeeId)} disabled={resendInvitation.isPending}>
                            <RefreshCw className="h-3 w-3 mr-1" /> Resend
                          </Button>
                        </div>
                      ) : invitee.invited ? (
                        <span className="inline-flex items-center text-xs text-amber-600 font-medium">
                          <AlertCircle className="h-3 w-3 mr-1" /> Unsent
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
