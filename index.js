import axios from 'axios';
import express from "express";
import { WebSocketServer } from 'ws';
import { v4 as uuid } from "uuid";

const wss = new WebSocketServer({
  port: process.env.WS_SERVER_PORT || 3006,
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
  // send message to server

  if (process.env.CONNECT_URL) {
    const response = await axios.post(process.env.CONNECT_URL, { connectionId: socket.uniqueId, body: {}, query: {} });
    console.log(response.data)
    socket.send(JSON.stringify(response.data));
  }

  socket.on("message", async (data) => {
    console.log(`${socket.uniqueId} message received`);
    if (process.env.DEFAULT_URL) {
      const response = await axios.post(process.env.DEFAULT_URL, { connectionId: socket.uniqueId, body: JSON.parse(data), query: {} });
      socket.send(JSON.stringify(response.data));
    }
  });

  socket.on("close", async () => {
    // send message to server
    console.log(`${socket.uniqueId} closed`);
    if (process.env.DISCONNECT_URL) {
      const response = await axios.post(process.env.DISCONNECT_URL, { connectionId: socket.uniqueId, body: {}, query: {} });
      socket.send(JSON.stringify(response.data));
    }
  });
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

  res.send('Hello World!')
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});

// const test = new WebSocket("ws://localhost:3006");

// test.on("open", () => {
//   test.send(JSON.stringify({ test: "123" }));
// });