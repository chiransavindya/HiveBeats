// IndexedDB abstraction for HiveBeats playlists & queue persistence

const DB_NAME = 'hivebeats-db'
const DB_VERSION = 1
const STORE_PLAYLISTS = 'playlists'

export type PlaylistTrack = {
  id: string
  filePath: string
  fileName: string
  mimeType: string
}

export type Playlist = {
  id: string
  name: string
  tracks: PlaylistTrack[]
  createdAt: number
  updatedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
        db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'id' })
      }
    }

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result)
    }

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error)
    }
  })
}

export async function getAllPlaylists(): Promise<Playlist[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLAYLISTS, 'readonly')
    const store = tx.objectStore(STORE_PLAYLISTS)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result as Playlist[])
    request.onerror = () => reject(request.error)
  })
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLAYLISTS, 'readwrite')
    const store = tx.objectStore(STORE_PLAYLISTS)
    const request = store.put(playlist)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function deletePlaylist(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLAYLISTS, 'readwrite')
    const store = tx.objectStore(STORE_PLAYLISTS)
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
