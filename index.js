import axios from 'axios';
import express from "express";
import { WebSocketServer } from 'ws';
import { v4 as uuid } from "uuid";
import fs from "fs";
import https from "https";


const useHttps = fs.existsSync("/opt/gateway/localhost-key.pem") && fs.existsSync("/opt/gateway/localhost.pem");
console.log(`Using HTTPS: ${useHttps}`);

const server = useHttps ? https.createServer({
  key: fs.readFileSync("/opt/gateway/localhost-key.pem"),
  cert: fs.readFileSync("/opt/gateway/localhost.pem")
}) : undefined;

if (server) {
  // server.addListener('upgrade', (req, res, head) => console.log('UPGRADE:', req.url));
  server.on('error', (err) => console.error(err));
  server.listen(process.env.WS_SERVER_PORT || 3006, () => console.log(`Https running on port ${process.env.WS_SERVER_PORT || 3006}`));
}

const wss = new WebSocketServer({
  port: server ? undefined : process.env.WS_SERVER_PORT || 3006,
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024 // Size (in bytes) below which messages
    // should not be compressed if context takeover is disabled.
  }
});

wss.on("connection", async (socket, request) => {
  socket.uniqueId = uuid();
  console.log(`${socket.uniqueId} connected`);

  socket.on("message", async (data) => {
    console.log(`${socket.uniqueId} message received`);
    if (process.env.DEFAULT_URL) {
      try {
        const response = await axios.post(process.env.DEFAULT_URL, { connectionId: socket.uniqueId, body: JSON.parse(data), query: {} });
        socket.send(JSON.stringify(response.data));
      } catch (err) {
        console.error("Error sending connect response", err);
      }
    }
  });

  socket.on("close", async () => {
    // send message to server
    console.log(`${socket.uniqueId} closed`);
    if (process.env.DISCONNECT_URL) {
      try {
        const response = await axios.post(process.env.DISCONNECT_URL, { connectionId: socket.uniqueId, body: {}, query: {} });
        // socket.send(JSON.stringify(response.data));
      } catch (err) {
        console.error("Error sending disconnect response", err);
      }
    }
  });
  
  if (process.env.CONNECT_URL) {
    
    try {
      const response = await axios.post(process.env.CONNECT_URL, { connectionId: socket.uniqueId, body: {}, query: {} });
      console.log(response.data)
      // socket.send(JSON.stringify(response.data));
    } catch (err) {
      console.error("Error sending disconnect response", err);
    }
  }
});

const app = express();
const port = process.env.SERVER_PORT || 3005;

const parseBinaryBody = (req, res, next) => {
  if(req.body === undefined) {
    const buffer = [];
    req.on('data', (chunk) => {
      buffer.push(chunk)
    });

    req.once('end', () => {
      const concated = Buffer.concat(buffer);
      req.body = concated.toString('utf8'); // change it to meet your needs (gzip, json, etc)
      next();
    });
  } else {
    next();
  }
}

app.use(parseBinaryBody);

app.post('/@connections/:connectionId', (req, res) => {
  const { connectionId } = req.params;
  
  console.log("Sending message back", { connectionId });
  
  wss.clients.forEach((ws) => {
    if (ws.uniqueId === connectionId) {
      ws.send(req.body);
    }
  });

  res.json({ success: true });
});

app.delete('/@connections/:connectionId', (req, res) => {
  const { connectionId } = req.params;

  wss.clients.forEach((ws) => {
    if (ws.uniqueId === connectionId) {
      ws.close();
    }
  });

  res.json({ success: true });
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});

// const test = new WebSocket("ws://localhost:3006");

// test.on("open", () => {
//   test.send(JSON.stringify({ test: "123" }));
// });
