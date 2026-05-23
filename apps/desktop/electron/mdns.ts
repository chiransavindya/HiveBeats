import { Bonjour } from 'bonjour-service'

export interface MdnsSessionAnnouncement {
  name: string
  host?: string
  port: number
  addresses: string[]
  sessionCode?: string
}

type BonjourService = {
  name: string
  host?: string
  port: number
  addresses?: string[]
  txt?: {
    code?: string
  }
}

const bonjour = new Bonjour()

export function advertiseSession(sessionCode: string, port: number) {
  const service = bonjour.publish({
    name: `HiveBeats-${sessionCode}`,
    type: 'hivebeats',
    port,
    txt: { code: sessionCode },
  })

  return service
}

export function startDiscovery(
  onUp: (service: MdnsSessionAnnouncement) => void,
  onDown: (service: MdnsSessionAnnouncement) => void,
) {
  const browser = bonjour.find({ type: 'hivebeats' })

  const toAnnouncement = (service: BonjourService): MdnsSessionAnnouncement => ({
    name: service.name,
    host: service.host,
    port: service.port,
    addresses: service.addresses ?? [],
    sessionCode: service.txt?.code,
  })

  browser.on('up', (service: BonjourService) => onUp(toAnnouncement(service)))
  browser.on('down', (service: BonjourService) => onDown(toAnnouncement(service)))

  return () => {
    try {
      browser.stop()
    } finally {
      browser.removeAllListeners()
    }
  }
}

export function destroyBonjour() {
  bonjour.destroy()
}
