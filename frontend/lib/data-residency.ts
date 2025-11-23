export type ResidencyProof = {
  id: string
  region: string
  dataCenters: string[]
  provider: string
  replication: string
  controls: string[]
  lastAudit: string
  statement: string
}

export const DATA_RESIDENCY_PROOFS: ResidencyProof[] = [
  {
    id: "eu-central",
    region: "EU (Frankfurt + Dublin)",
    dataCenters: ["AWS eu-central-1 (Frankfurt)", "AWS eu-west-1 (Dublin)"],
    provider: "AWS (dedicated VPC + KMS)",
    replication: "Cross-region async replication with daily encrypted snapshots (AES-256, CMK)",
    controls: ["GDPR Art. 28", "ISO/IEC 27001 Annex A.11", "SOC 2 Type II - Security & Availability"],
    lastAudit: "2025-01-15T12:00:00.000Z",
    statement:
      "VectoBeat stores customer content originating from EU billing entities exclusively within EU sovereign clusters. Backup copies remain encrypted with EU-managed CMKs. Operational access is restricted to EU-cleared SREs with Privileged Access Workflows logged to our compliance vault.",
  },
  {
    id: "us-primary",
    region: "US (Virginia + Oregon)",
    dataCenters: ["AWS us-east-1 (N. Virginia)", "AWS us-west-2 (Oregon)"],
    provider: "AWS (GovCloud controls applied)",
    replication: "Multi-region active/standby with hourly PITR (Point-in-time recovery) logs",
    controls: ["FedRAMP Moderate mapping", "HIPAA BAA controls", "SOC 2 Type II - Security & Confidentiality"],
    lastAudit: "2025-02-02T09:30:00.000Z",
    statement:
      "Enterprise workloads designated for US residency remain within contiguous US facilities with envelope encryption tied to HSM-backed keys. Audit scopes include ingress egress logging and dedicated incident response with 24/7 pager coverage.",
  },
]
