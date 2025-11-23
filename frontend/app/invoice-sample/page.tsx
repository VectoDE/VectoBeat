const invoiceData = {
  invoiceNumber: "INV-2025-0042",
  issueDate: "January 12, 2025",
  dueDate: "February 11, 2025",
  status: "paid",
  company: {
    name: "VectoBeat Limited",
    slogan: "Precision Audio Automation",
    address: ["c/o UplyTech", "Breitenburger Str. 15", "25524 Itzehoe", "Germany"],
    email: "billing@vectobeat.com",
    phone: "+49 40 1234 5678",
    vatId: "DE123456789",
  },
  customer: {
    name: "Midnight Echo Guild",
    contact: "Alex Mercer",
    address: ["221 Market Street", "Seattle, WA 98101", "United States"],
    email: "finance@midnightecho.gg",
  },
  lineItems: [
    {
      description: "VectoBeat Scale Plan (Jan 12 – Feb 11)",
      quantity: 1,
      unitPrice: 24900,
      taxRate: 0.19,
    },
    {
      description: "Premium Support Seat Add-on",
      quantity: 3,
      unitPrice: 3900,
      taxRate: 0.19,
    },
  ],
  notes: [
    "Payment has been settled via Stripe. No further action is required.",
    "Need a custom billing profile? Contact billing@vectobeat.com.",
  ],
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(value / 100)

const calculateTotals = () => {
  let subtotal = 0
  let tax = 0
  invoiceData.lineItems.forEach((item) => {
    const lineSubtotal = item.quantity * item.unitPrice
    subtotal += lineSubtotal
    tax += lineSubtotal * item.taxRate
  })
  return { subtotal, tax, total: subtotal + tax }
}

const totals = calculateTotals()

export const metadata = {
  title: "Invoice Sample | VectoBeat",
  description: "Enterprise-grade invoice template rendered with TailwindCSS",
}

export default function InvoiceSamplePage() {
  return (
    <div className="min-h-screen bg-slate-100 py-12 px-4">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl border border-slate-200 overflow-hidden">
        <header className="bg-slate-950 text-white px-10 py-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="uppercase tracking-[0.4em] text-xs text-slate-400">Vectobeat</p>
            <h1 className="text-4xl font-bold">Invoice</h1>
            <p className="text-sm text-slate-400">{invoiceData.company.slogan}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Invoice #</p>
            <p className="text-xl font-semibold text-white">{invoiceData.invoiceNumber}</p>
            <span className="inline-flex mt-3 px-4 py-1 rounded-full text-xs font-semibold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
              {invoiceData.status}
            </span>
          </div>
        </header>

        <section className="px-10 py-8 grid gap-10 lg:grid-cols-2 border-b border-slate-200">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Billed from</p>
            <h2 className="text-xl font-semibold text-slate-900">{invoiceData.company.name}</h2>
            <p className="text-sm text-slate-600">{invoiceData.company.slogan}</p>
            <div className="text-sm text-slate-500 leading-relaxed">
              {invoiceData.company.address.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <p className="text-sm text-slate-500">VAT ID: {invoiceData.company.vatId}</p>
            <p className="text-sm text-slate-500">{invoiceData.company.email} · {invoiceData.company.phone}</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Issue date</p>
                <p className="text-slate-900 font-semibold">{invoiceData.issueDate}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Due date</p>
                <p className="text-slate-900 font-semibold">{invoiceData.dueDate}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer</p>
                <p className="text-slate-900 font-semibold">{invoiceData.customer.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Contact</p>
                <p className="text-slate-900 font-semibold">{invoiceData.customer.contact}</p>
              </div>
            </div>
            <div className="text-sm text-slate-500 leading-relaxed">
              {invoiceData.customer.address.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>{invoiceData.customer.email}</p>
            </div>
          </div>
        </section>

        <section className="px-10 py-8 space-y-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-12 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <p className="col-span-6 px-4 py-3">Description</p>
              <p className="col-span-2 px-4 py-3 text-right">Qty</p>
              <p className="col-span-2 px-4 py-3 text-right">Unit price</p>
              <p className="col-span-2 px-4 py-3 text-right">Line total</p>
            </div>
            {invoiceData.lineItems.map((item, index) => {
              const lineSubtotal = item.quantity * item.unitPrice
              return (
                <div
                  key={`${item.description}-${index}`}
                  className="grid grid-cols-12 text-sm text-slate-700 border-b border-slate-100 last:border-b-0"
                >
                  <div className="col-span-6 px-4 py-4">
                    <p className="font-semibold text-slate-900">{item.description}</p>
                    <p className="text-xs text-slate-500">VAT: {(item.taxRate * 100).toFixed(0)}%</p>
                  </div>
                  <p className="col-span-2 px-4 py-4 text-right">{item.quantity}</p>
                  <p className="col-span-2 px-4 py-4 text-right">{formatCurrency(item.unitPrice)}</p>
                  <p className="col-span-2 px-4 py-4 text-right font-semibold text-slate-900">
                    {formatCurrency(lineSubtotal)}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-3">Payment summary</p>
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Tax (19%)</span>
                  <span>{formatCurrency(totals.tax)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
                  <span>Total</span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-white border border-slate-200 flex-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-3">Payment channel</p>
              <p className="text-sm text-slate-700 leading-relaxed">
                Paid via Stripe Checkout · Card ending in 8843 · Authorization code #73K22. Funds are held by Stripe Payments
                Europe under PSD2 and remitted to VectoBeat Limited.
              </p>
            </div>
          </div>
        </section>

        <section className="px-10 pb-10 pt-4 space-y-3 text-sm text-slate-600">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Notes</p>
          <ul className="list-disc pl-6 space-y-2">
            {invoiceData.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <div className="pt-4 border-t border-slate-200 text-xs text-slate-400">
            <p>VectoBeat Limited · Registered in Hamburg HRB 123456 · VAT DE123456789</p>
            <p>
              Questions? Email <span className="text-slate-900 font-medium">billing@vectobeat.com</span> or visit our Trust Center for remittance
              details.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
