export const dynamic = "force-dynamic"

import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { getBotCommands, type BotCommandGroup } from "@/lib/commands"
import { Search, Command, Terminal, Music, Settings, Shield, Zap, HelpCircle } from "lucide-react"

const CATEGORY_ICONS: Record<string, any> = {
  Music: Music,
  Admin: Shield,
  Settings: Settings,
  Utility: Terminal,
  General: Command,
  Automation: Zap,
}

const getCategoryIcon = (category: string) => {
  const Icon = CATEGORY_ICONS[category] || CATEGORY_ICONS[Object.keys(CATEGORY_ICONS).find(k => category.includes(k)) || ""] || HelpCircle
  return Icon
}

export default async function CommandsPage() {
  const commandGroups = await getBotCommands()

  return (
    <main className="min-h-screen bg-background" suppressHydrationWarning>
      <Navigation />
      
      <section className="w-full pt-32 pb-12 px-4 border-b border-border bg-card/20">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">Command Reference</h1>
          <p className="text-xl text-foreground/70 max-w-2xl mx-auto">
            Everything you need to control VectoBeat. From high-fidelity playback to advanced server automation.
          </p>
        </div>
      </section>

      <section className="w-full py-12 px-4">
        <div className="max-w-6xl mx-auto space-y-12">
          {commandGroups.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-foreground/70">Loading commands...</p>
            </div>
          ) : (
            commandGroups.map((group) => {
              const Icon = getCategoryIcon(group.category)
              return (
                <div key={group.category} className="space-y-6">
                  <div className="flex items-center gap-3 pb-2 border-b border-border/40">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Icon className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-bold">{group.category}</h2>
                    <span className="text-sm font-medium text-foreground/40 bg-card px-2 py-1 rounded-full border border-border/50">
                      {group.commands.length}
                    </span>
                  </div>
                  
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {group.commands.map((cmd) => (
                      <div 
                        key={cmd.name}
                        className="group p-5 rounded-xl border border-border/40 bg-card/30 hover:bg-card/50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <code className="text-sm font-bold text-primary bg-primary/5 px-2 py-1 rounded border border-primary/20 group-hover:bg-primary/10 transition-colors">
                            {cmd.name}
                          </code>
                        </div>
                        <p className="text-sm text-foreground/70 leading-relaxed">
                          {cmd.description || "No description available."}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      <Footer />
    </main>
  )
}
