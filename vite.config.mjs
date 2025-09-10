import { defineConfig } from 'vite'
import os from 'node:os'

const pickPrivateIpv4 = () => {
  const nets = os.networkInterfaces()
  const isPrivate = (ip) => {
    if (!ip) return false
    if (ip.startsWith('10.')) return true
    const seg = ip.split('.')
    const a = Number(seg[0]), b = Number(seg[1])
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }
  for (const key of Object.keys(nets)) {
    for (const addr of nets[key] || []) {
      if (addr && addr.family === 'IPv4' && !addr.internal && isPrivate(addr.address)) {
        return addr.address
      }
    }
  }
  // Fallback: first non-internal IPv4
  for (const key of Object.keys(nets)) {
    for (const addr of nets[key] || []) {
      if (addr && addr.family === 'IPv4' && !addr.internal) return addr.address
    }
  }
  return 'localhost'
}

const lanIpPlugin = () => ({
  name: 'lan-ip-endpoint',
  configureServer(server) {
    server.middlewares.use('/__lanip', (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end(JSON.stringify({ ip: pickPrivateIpv4() }))
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use('/__lanip', (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end(JSON.stringify({ ip: pickPrivateIpv4() }))
    })
  }
})

export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 5173 },
  plugins: [lanIpPlugin()]
})

