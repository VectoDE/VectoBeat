export interface TicketMessage {
  id: string
  ticketId: string
  authorId: string | null
  authorName: string | null
  role: string
  body: string
  attachments?: Array<{ name: string; type: string; size: number; content: string }>
  subscription?: string | null
  subscriptionTier?: string | null
  tier?: string | null
  plan?: string | null
  createdAt: string
}

export interface TicketDetail {
  id: string
  subject: string | null
  status: string
  message: string
  name?: string
  email?: string
  response?: string | null
  createdAt: string
  updatedAt: string
  messages: TicketMessage[]
}
