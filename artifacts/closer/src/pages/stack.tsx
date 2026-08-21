import { useStackData, useStackMutations } from "@/hooks/use-stack"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Layers, BrainCircuit, RefreshCw, X, Check } from "lucide-react"

export default function StackPage() {
  const { resources } = useStackData()
  const { runAdvisor, updateResource, deleteResource } = useStackMutations()

  if (resources.isLoading) {
    return <div className="p-4 space-y-4 animate-pulse"><div className="h-64 bg-muted rounded-2xl" /></div>
  }

  const resList = resources.data || []
  
  const activeStack = resList.filter(r => ['active', 'trial'].includes(r.status))
  const suggestions = resList.filter(r => r.status === 'considering')
  
  const totalCost = activeStack.reduce((sum, r) => sum + (r.monthlyCost || 0), 0)

  const handleAdvisor = () => {
    runAdvisor.mutate()
  }

  return (
    <div className="flex-1 flex flex-col pt-4 pb-24 lg:pb-10 space-y-6 px-4">
      <div className="flex justify-between items-end gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">Stack</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1 truncate">${totalCost.toLocaleString()}/mo burn</p>
        </div>
        <Button 
          variant="ai" 
          size="sm" 
          onClick={handleAdvisor}
          disabled={runAdvisor.isPending}
          className="gap-2 shadow-sm rounded-xl min-h-[44px] shrink-0"
        >
          {runAdvisor.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
          {runAdvisor.isPending ? "Scanning..." : "Tool Advisor"}
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="bg-ai/10 border border-ai/20 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-ai-foreground flex items-center gap-2">
            <BrainCircuit className="w-4 h-4" /> Recommended Additions
          </h3>
          <div className="space-y-2">
            {suggestions.map(s => (
              <div key={s.id} className="bg-background rounded-xl p-3 flex flex-col gap-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex items-center flex-wrap gap-2">
                    <span className="font-semibold truncate">{s.name}</span>
                    <Badge variant="outline" className="text-[10px] uppercase h-5 shrink-0">{s.category}</Badge>
                  </div>
                  <span className="font-mono text-xs font-bold text-muted-foreground shrink-0">${s.monthlyCost}/mo</span>
                </div>
                {s.automates && <p className="text-xs text-muted-foreground">Automates: {s.automates}</p>}
                {s.notes && <p className="text-xs text-foreground/80 italic">"{s.notes}"</p>}
                <div className="flex gap-2 mt-1">
                  <Button size="sm" variant="default" className="flex-1 min-h-[44px] rounded-lg" onClick={() => updateResource.mutate({ id: s.id, data: { status: 'trial' } })}>
                    <Check className="w-4 h-4 mr-1" /> Accept
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 min-h-[44px] rounded-lg border-dashed" onClick={() => deleteResource.mutate({ id: s.id })}>
                    <X className="w-4 h-4 mr-1" /> Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {activeStack.map(res => (
          <Card key={res.id} className="bg-card">
            <CardContent className="p-4">
              <div className="flex justify-between items-start gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <h4 className="font-bold truncate">{res.name}</h4>
                  {res.status === 'trial' && <Badge variant="secondary" className="bg-warn/20 text-warn-foreground text-[10px] shrink-0">TRIAL</Badge>}
                </div>
                <span className="font-mono text-xs font-bold bg-muted px-2 py-1 rounded text-muted-foreground shrink-0">
                  ${res.monthlyCost}/mo
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-primary uppercase font-semibold">{res.category}</span>
                {res.automates && (
                  <>
                    <span className="text-border">•</span>
                    <span className="text-muted-foreground line-clamp-1">{res.automates}</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {activeStack.length === 0 && (
          <div className="text-center py-10">
            <Layers className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground text-sm">No active tools. Run the advisor.</p>
          </div>
        )}
      </div>
    </div>
  )
}
