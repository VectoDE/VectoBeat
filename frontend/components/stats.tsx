"use client"

const stats = [
  {
    number: "10K+",
    label: "Active Users",
  },
  {
    number: "500+",
    label: "Servers",
  },
  {
    number: "1M+",
    label: "Songs Played",
  },
  {
    number: "24/7",
    label: "Uptime",
  },
]

export default function Stats() {
  return (
    <section id="stats" className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-linear-to-r from-primary to-secondary mb-2">
                {stat.number}
              </div>
              <p className="text-foreground/70 text-sm md:text-base">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
