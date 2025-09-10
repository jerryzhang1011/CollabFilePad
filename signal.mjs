#!/usr/bin/env node
import { WebSocketServer } from 'ws'
import http from 'http'

const PORT = process.env.PORT || 4444

const server = http.createServer((req, res) => {
  res.writeHead(200)
  res.end('Y-WebRTC signaling server running')
})

const wss = new WebSocketServer({ server })

/** @type {Map<string, Set<any>>} */
const roomToClients = new Map()

const send = (ws, msg) => {
  try { ws.send(JSON.stringify(msg)) } catch {}
}

wss.on('connection', ws => {
  ws.on('message', data => {
    /** @type {{type:string,room:string,[k:string]:any}} */
    let msg
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (!msg || !msg.type) return

    if (msg.type === 'subscribe' && msg.room) {
      let clients = roomToClients.get(msg.room)
      if (!clients) {
        clients = new Set()
        roomToClients.set(msg.room, clients)
      }
      ws.room = msg.room
      clients.add(ws)
      send(ws, { type: 'subscribed', room: msg.room })
      return
    }
    const room = ws.room || msg.room
    if (!room) return
    const clients = roomToClients.get(room)
    if (!clients) return
    for (const client of clients) {
      if (client !== ws) send(client, msg)
    }
  })

  ws.on('close', () => {
    const room = ws.room
    if (!room) return
    const clients = roomToClients.get(room)
    if (!clients) return
    clients.delete(ws)
    if (clients.size === 0) roomToClients.delete(room)
  })
})

server.listen(PORT)
console.log('Signaling server running on localhost:', PORT)


