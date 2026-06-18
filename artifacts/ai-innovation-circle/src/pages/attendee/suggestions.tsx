import { useState } from "react";
import { useListSuggestions, useCreateSuggestion } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Lightbulb, Plus } from "lucide-react";

export default function AttendeeSuggestions() {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");
  const queryClient = useQueryClient();

  const { data: suggestions = [], isLoading } = useListSuggestions();
  const createSuggestion = useCreateSuggestion();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    createSuggestion.mutate(
      { data: { content: content.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/suggestions"] });
          setContent("");
          setIsOpen(false);
        },
      }
    );
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suggestions</h1>
          <p className="text-muted-foreground mt-2">Share ideas for future sessions or topics.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Suggestion
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit a Suggestion</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="content">Your suggestion</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="e.g. I'd love a session on how to evaluate AI vendors..."
                  rows={4}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createSuggestion.isPending}>
                  {createSuggestion.isPending ? "Submitting..." : "Submit"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-gray-50/50">
          <Lightbulb className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No suggestions yet</h3>
          <p className="text-gray-500 mt-1">Be the first to share an idea.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-6">
                <p className="text-base">{s.content}</p>
                <p className="text-xs text-muted-foreground mt-3">
                  {format(new Date(s.createdAt), "MMM d, yyyy")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
