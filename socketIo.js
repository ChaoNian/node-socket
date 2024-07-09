const express = require("express");
const { createServer } = require("node:http");
const { join } = require("node:path");
// const { disconnect } = require("node:process");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { availableParallelism } = require('node:os');
async function main() {
  // open the database file
  const db = await open({
    filename: "chat.db",
    driver: sqlite3.Database,
  });

  // create our ' messages' table (you can ignore the 'client_offset' column for now)
  await db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_offset TEXT UNIQUE,
          content TEXT
      );
    `);

  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    connectionStateRecovery: {},
  });

  app.get("/", (req, res) => {
    res.sendFile(join(__dirname, "index.html"));
    // res.send('<h1>yello wwords s</h1>')
  });

  io.on("connection", (socket) => {
    //   console.log("a user connected");
    //   socket.on("disconnect", () => {
    //     console.log("a user disconnect");
    //   });
  });

  io.on("connection", async (socket) => {
    socket.on("chat message", async (msg) => {
      console.log("message4444: " + msg);
      let result;
      try {
        // store the message in the database
        result = await db.run("INSERT INTO messages (content) VALUES (?)", msg);
      } catch (e) {
        // TODO handle the failure
        return;
      }

    //   io.emit("chat message", msg);
    io.emit('chat message', msg, result.lastID);
    });
    //    服务器将在（重新）连接时发送丢失的信息
    if (!socket.recovered) {
      try {
        await db.each(
          "SELECT id, content FROM message WHERE id > ?",
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit("chat message", row.content, row.id);
          }
        );
      } catch (error) {
        console.log(error);
      }
    }

    socket.onAny((eventName, ...args) => {
      console.log("onAny", eventName); // 'hello'
      console.log(args); // [ 1, '2', { 3: '4', 5: ArrayBuffer (1) [ 6 ] } ]
    });
  });

//   io.on("connection", (socket) => {
//     socket.on("hello", (arg1, arg2, arg3) => {
//       console.log(arg1); // 1
//       console.log(arg2); // '2'
//       console.log(arg3); // { 3: '4', 5: <Buffer 06> }
//     });
//   });

  //  确认了数据
  io.on("cinnection", (socket) => {
    socket.on("request", (arg1, arg2, callback) => {
      console.log(arg1, arg, "request");
      callback({
        status: "ok",
      });
    });
  });

  // 广播
  // io.emit('hello', 'world')
  // io.on('connection', (socket) => {
  //     socket.broadcast.emit('hi');
  //   });

  // 客房
//   io.on("connection", (socket) => {
//     // 1、加入房间
//     socket.join("some room");

//     // 2、通知到房间里的所有客户端
//     io.to("some room").emit("hello", "world");

//     // 3、 广播到除了房间中的客户端之外的所有连接的客户端
//     io.except("some room").emit("hello", "world");

//     // 4、离开房间
//     socket.leave("some room");
//   });

  server.listen(3000, () => {
    console.log("server running at http://localhost:3000");
  });
}
main()