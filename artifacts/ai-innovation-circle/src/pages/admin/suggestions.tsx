import { useListSuggestions } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb } from "lucide-react";

export default function AdminSuggestions() {
  const { data: suggestions = [], isLoading } = useListSuggestions();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Suggestions</h1>
        <p className="text-muted-foreground mt-2">Ideas submitted by attendees for future sessions.</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-gray-50/50">
          <Lightbulb className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-500">No suggestions yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <p className="text-base">{s.content}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {(s as any).attendeeName && (
                        <span className="font-medium">{(s as any).attendeeName}</span>
                      )}
                      {(s as any).attendeeCompany && (
                        <><span>·</span><span>{(s as any).attendeeCompany}</span></>
                      )}
                      <span>·</span>
                      <span>{format(new Date(s.createdAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
