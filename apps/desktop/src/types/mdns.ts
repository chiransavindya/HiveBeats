export interface MdnsSessionAnnouncement {
  name: string
  host?: string
  port: number
  addresses: string[]
  sessionCode?: string
}
