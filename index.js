const express = require("express");
const app = express();

app.use(express.static("./public"));

app.get("/", (req, res) => {
  res.send({ ok: 1 });
});
app.listen(3000, () => {
  console.log("http://127.0.0.1:3000");
});

// websocket 响应
const WebSocket = require("ws");
const WebSocketServer = WebSocket.WebSocketServer;
const wss = new WebSocketServer({ port: 8080 });

/**
 * ws 客户端本身的实例
 * req: 客户端传过来的参数
 */
wss.on("connection", function connection(ws, req) {
  // console.log(req, 'req');
  const myURL = new URL(req.url, "http://127.0.0.1:3000");
  // console.log(myURL.searchParams, 'myURL'); // 拿到传过来的参数
  // console.log(myURL.searchParams.get('token'), 'myURL');

  // 判断token 是否有效 第一次连接所要做的事 ；用户授权 用户绑定
  if (myURL.searchParams.get("token")) {
    ws.send(createMessage(WebSocketType.GroupChart, null, "欢迎俩到聊天室"));

    // ws.user = '用户ID‘
    // 群发
    // sendAll()
  } else {
    ws.send(createMessage(WebSocketType.GroupChart, null, "没有权限"));
  }

  // 监听客户端发送的消息
  ws.on("message", function message(data) {
    console.log(`message ${data}`);
    // 转发给其他人
    wss.clients.forEach(function each(client) {
      // 通知所有连接中的客户端（client !== ws 排除自己）
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        // 是否二进制
        client.send(data, { binary: false });
      }
    });
  });

  // 离开时
  

//   function sendAll() {
//     // 转发给其他人
//     wss.clients.forEach(function each(client) {
//         // 通知所有连接中的客户端（client !== ws 排除自己）
//         if (client !== ws && client.readyState === WebSocket.OPEN) {
//           // 是否二进制
//           client.send(data, { binary: false });
//         }
//       });
//   }
});

const WebSocketType = {
  Error: 0,
  GroupList: 1,
  GroupChart: 2,
  SingleChat: 3,
};
function createMessage(type, user, data) {
  return JSON.stringify({
    type,
    user,
    data,
  });
}
