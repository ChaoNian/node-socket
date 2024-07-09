/**
 * 一个基本的Socket.IO客户端，以便更好地理解Socket.IO协议。
 * 实现了以下功能：
 *  创建WebSocket连接
 *  管理重新连接
 *  发送事件
 *  接收事件
    手动断开
 */
class EventEmitter {
    #listeners = new Map();
  
    on(event, listener) {
      let listeners = this.#listeners.get(event);
      if (!listeners) {
        this.#listeners.set(event, (listeners = []));
      }
      listeners.push(listener);
    }
  
    emit(event, ...args) {
      const listeners = this.#listeners.get(event);
      if (listeners) {
        for (const listener of listeners) {
          listener.apply(null, args);
        }
      }
    }
  }
//   Engine.IO数据包包括：
//  type packet type 可用数据包类型
  const EIOPacketType = {
    OPEN: "0", // 在握手时使用。
    CLOSE: "1", // 用于指示可以关闭传输。
    PING: "2", // 用于心跳机制
    PONG: "3", // 用于心跳机制。
    MESSAGE: "4", // 用来向另一边发送有效载荷
    UPGRADE: '5', // 在升级过程中使用。
    NOOP: '6' // 在升级过程中使用。
  };

//  Socket.IO包 type 可用数据包类型的列表：
  const SIOPacketType = {
    CONNECT: 0, // 在连接到命名空间期间使用。
    DISCONNECT: 1, // 在从命名空间断开连接时使用。
    EVENT: 2, // 用于向另一端发送数据。
    ACK:  3, // 用于确认事件。
    CONNECT_ERROR: 4, // 在连接到命名空间期间使用。
    BINARY_EVENT: 5, // 用于向另一端发送二进制数据。
    BINARY_ACK: 6, // 用于确认事件（响应包括二进制数据）。
  };
  
  function noop() {}
  
  class Socket extends EventEmitter {
    id;
    connected = false;
  
    #uri;
    #opts;
    #ws;
    #pingTimeoutTimer;
    #pingTimeoutDelay;
    #sendBuffer = [];
    #reconnectTimer;
    #shouldReconnect = true;
  
    constructor(uri, opts) {
      super();
      this.#uri = uri;
      this.#opts = Object.assign(
        {
          path: "/socket.io/",
          reconnectionDelay: 2000,
        },
        opts
      );
      this.#open();
    }
  
    // 创建连接
    #open() {
      this.#ws = new WebSocket(this.#createUrl());
      this.#ws.onmessage = ({ data }) => this.#onMessage(data);
      // dummy handler for Node.js
      this.#ws.onerror = noop;
      this.#ws.onclose = () => this.#onClose("transport close");
    }
  
    #createUrl() {
      const uri = this.#uri.replace(/^http/, "ws");
      const queryParams = "?EIO=4&transport=websocket";
      return `${uri}${this.#opts.path}${queryParams}`;
    }
  
    #onMessage(data) {
      if (typeof data !== "string") {
        // TODO handle binary payloads
        return;
      }
  
      switch (data[0]) {
        case EIOPacketType.OPEN:
          this.#onOpen(data);
          break;
  
        case EIOPacketType.CLOSE:
          this.#onClose("transport close");
          break;
  
        case EIOPacketType.PING:
          this.#resetPingTimeout();
          this.#send(EIOPacketType.PONG);
          break;
  
        case EIOPacketType.MESSAGE:
          let packet;
          try {
            packet = decode(data);
          } catch (e) {
            return this.#onClose("parse error");
          }
          this.#onPacket(packet);
          break;
  
        default:
          this.#onClose("parse error");
          break;
      }
    }
  
    #onOpen(data) {
      let handshake;
      try {
        handshake = JSON.parse(data.substring(1));
      } catch (e) {
        return this.#onClose("parse error");
      }
      this.#pingTimeoutDelay = handshake.pingInterval + handshake.pingTimeout;
      this.#resetPingTimeout();
      this.#doConnect();
    }
  
    #onPacket(packet) {
      switch (packet.type) {
        case SIOPacketType.CONNECT:
          this.#onConnect(packet);
          break;
  
        case SIOPacketType.DISCONNECT:
          this.#shouldReconnect = false;
          this.#onClose("io server disconnect");
          break;
  
        case SIOPacketType.EVENT:
          super.emit.apply(this, packet.data);
          break;
  
        default:
          this.#onClose("parse error");
          break;
      }
    }
  
    #onConnect(packet) {
      this.id = packet.data.sid;
      this.connected = true;
  
      this.#sendBuffer.forEach((packet) => this.#sendPacket(packet));
      this.#sendBuffer.slice(0);
  
      super.emit("connect");
    }
  
    #onClose(reason) {
      if (this.#ws) {
        this.#ws.onclose = noop;
        this.#ws.close();
      }
  
      clearTimeout(this.#pingTimeoutTimer);
      clearTimeout(this.#reconnectTimer);
  
      if (this.connected) {
        this.connected = false;
        this.id = undefined;
        super.emit("disconnect", reason);
      } else {
        super.emit("connect_error", reason);
      }
  
      if (this.#shouldReconnect) {
        this.#reconnectTimer = setTimeout(
          () => this.#open(),
          this.#opts.reconnectionDelay
        );
      }
    }
  
    #resetPingTimeout() {
      clearTimeout(this.#pingTimeoutTimer);
      this.#pingTimeoutTimer = setTimeout(() => {
        this.#onClose("ping timeout");
      }, this.#pingTimeoutDelay);
    }
  
    #send(data) {
      if (this.#ws.readyState === WebSocket.OPEN) {
        this.#ws.send(data);
      }
    }
  
    #sendPacket(packet) {
      this.#send(EIOPacketType.MESSAGE + encode(packet));
    }
  
    #doConnect() {
      this.#sendPacket({ type: SIOPacketType.CONNECT });
    }
  
    emit(...args) {
      const packet = {
        type: SIOPacketType.EVENT,
        data: args,
      };
  
      if (this.connected) {
        this.#sendPacket(packet);
      } else {
        this.#sendBuffer.push(packet);
      }
    }
  
    disconnect() {
      this.#shouldReconnect = false;
      this.#onClose("io client disconnect");
    }
  }
  
  function encode(packet) {
    let output = "" + packet.type;
  
    if (packet.data) {
      output += JSON.stringify(packet.data);
    }
  
    return output;
  }
  
  function decode(data) {
    let i = 1; // skip "4" prefix
  
    const packet = {
      type: parseInt(data.charAt(i++), 10),
    };
  
    if (data.charAt(i)) {
      packet.data = JSON.parse(data.substring(i));
    }
  
    if (!isPacketValid(packet)) {
      throw new Error("invalid format");
    }
  
    return packet;
  }
  
  function isPacketValid(packet) {
    switch (packet.type) {
      case SIOPacketType.CONNECT:
        return typeof packet.data === "object";
      case SIOPacketType.DISCONNECT:
        return packet.data === undefined;
      case SIOPacketType.EVENT: {
        const args = packet.data;
        return (
          Array.isArray(args) && args.length > 0 && typeof args[0] === "string"
        );
      }
      default:
        return false;
    }
  }
  
  export function io(uri, opts) {
    if (typeof uri !== "string") {
      opts = uri;
      uri = location.origin;
    }
    return new Socket(uri, opts);
  }

// ----------
//  class EventEmitter {
//   #listeners = new Map();

//   on(event, listener) {
//     let listeners = this.#listeners.get(event);
//     if (!listeners) {
//       this.#listeners.set(event, (listeners = []));
//     }
//     listeners.push(listener);
//   }

//   emit(event, ...args) {
//     const listeners = this.#listeners.get(event);
//     if (listeners) {
//       for (const listener of listeners) {
//         listener.apply(null, args);
//       }
//     }
//   }
// }

// //  处理webSocket 消息
// const EIOPacketType = {
//   OPEN: "0",
//   CLOSE: "1",
//   PING: "2",
//   PONG: "3",
//   MESSAGE: "4",
// };

// function noop() {}

// // 连接 客户端必须在Socket.IO会话开始时发送一个RECT数据包：
// const SIOPacketType = {
//   CONNECT: 0, // 在连接到命名空间期间使用
//   DISCONNECT: 1, // 在从命名空间断开连接时使用
//   EVENT: 2, // 用于向另一端发送数据。
// };
// class Socket extends EventEmitter {
//   // 实现心跳机制以确保服务器和客户端之间的连接是健康的。
//   #pingTimeoutTimer;
//   #pingTimeoutDelay;

//   // 创建到服务器的WebSocket连接：
//   #uri;
//   #opts;
//   #ws;

//   // 如果连接被允许，那么服务器将发送回一个EQUECT数据包：
//   id;

//   // 发送事件,让我们发送一些数据到服务器。我们需要跟踪底层连接的状态，并缓冲数据包，直到连接就绪：
//   connected = false; // 踪底层连接的状态
//   #sendBuffer = []; // 并缓冲数据包，直到连接就绪

//    // 手动断开
//    #reconnectTimer;
//    #shouldReconnect = true;

//   constructor(uri, opts) {
//     super();
//     this.#uri = uri;
//     this.#opts = Object.assign(
//       {
//         path: "/socket.io/",
//         //  重联 官方的Socket.IO客户端使用了一个带有随机性的指数延迟，以防止当许多客户端同时重新连接时出现负载峰值，但我们在这里将保持简单并使用一个常量值。
//         reconnectionDelay: 2000,
//       },
//       opts
//     );
//     this.#open();
//   }
//   // 1.打开到服务器的WebSocket连接
//   #open() {
//     this.#ws = new WebSocket(this.#createUrl());
//     //   处理WebSocket消息：
//     this.#ws.onmessage = ({ data }) => this.#onMessage(data);
//     this.#ws.onclose = () => this.#onClose("transport close");

//     //   连接
//     this.#doConnect();
//   }
//   #doConnect() {
//     this.#sendPacket({ type: SIOPacketType.CONNECT });
//   }
//   //   连接
//   #sendPacket(packet) {
//     this.#send(EIOPacketType.MESSAGE + encode(packet));
//   }

//   #createUrl() {
//     // 一个WebSocket URL以 ws:// 或 wss:// 开头，所以我们在 replace() 调用中处理它

//     const uri = this.#uri.replace(/^http/, "ws");
//     /**
//      * 有两个强制查询参数：
//      *  EIO=4: the version of the Engine.IO protocol
//         EIO=4 ：Engine.IO协议的版本,协议第4版（因此是上面的 EIO=4 ）中的不同数据包类型：
//         transport=websocket: the transport used
//      */
//     const queryParams = "?EIO=4&transport=websocket";
//     //   一个Socket.IO URL总是包含一个特定的请求路径，默认为 /socket.io/
//     return `${uri}${this.#opts.path}${queryParams}`;
//   }

//   #onMessage(data) {
//     if (typeof data !== "string") {
//       // TODO handle binary payloads
//       return;
//     }

//     switch (data[0]) {
//       // 心跳机制
//       case EIOPacketType.OPEN:
//         this.#onOpen(data);
//         break;
//       case EIOPacketType.CLOSE:
//         this.#onClose("transport close");
//         break;

//       // 心跳机制 2. 荣誉机制通过响应PING数据包
//       case EIOPacketType.PING:
//         this.#resetPingTimeout();
//         this.#send(EIOPacketType.PONG);
//         break;

//       case EIOPacketType.MESSAGE:
//         // 如果连接被允许，那么服务器将发送回一个EQUECT数据包：
//         let packet;
//         try {
//           packet = decode(data);
//         } catch (e) {
//           return this.#onClose("parse error");
//         }
//         this.#onPacket(packet);
//         break;

//       default:
//         this.#onClose("parse error");
//         break;
//     }
//   }
//   // 如果连接被允许，那么服务器将发送回一个EQUECT数据包：
//   #onPacket(packet) {
//     switch (packet.type) {
//       case SIOPacketType.CONNECT:
//         this.#onConnect(packet);
//         break;

//       // 接收事件 相反，让我们处理服务器发送的EVENT数据包：
//       case SIOPacketType.EVENT:
//         super.emit.apply(this, packet.data);
//         break;

//        case SIOPacketType.DISCONNECT:
//        this.#shouldReconnect = false;
//        this.#onClose("io server disconnect");
//        break;
//     }
//   }
//   // 如果连接被允许，那么服务器将发送回一个EQUECT数据包：
//   #onConnect(packet) {
//     this.id = packet.data.sid;

//     this.connected = true; // 踪底层连接的状态

//     //    发送事件 发送一些数据到服务器
//     this.#sendBuffer.forEach((packet) => this.#sendPacket(packet));
//     this.#sendBuffer.slice(0);

//     // 我们使用 super.emit(...) ，以便稍后能够覆盖 emit() 方法来发送事件。
//     super.emit("connect");
//   }

//   // 心跳机制
//   #onOpen(data) {
//     let handshake;
//     try {
//       handshake = JSON.parse(data.substring(1));
//     } catch (e) {
//       return this.#onClose("parse error");
//     }
//     this.#pingTimeoutDelay = handshake.pingInterval + handshake.pingTimeout;
//     this.#resetPingTimeout();
//   }

  // 心跳机制 故障时自动重新连接
  /**
   * 实现心跳机制以确保服务器和客户端之间的连接是健康的。
   * 服务器在初始握手期间发送两个值： pingInterval 和 pingTimeout
   * 然后，它将每隔 pingInterval ms发送一个PING数据包，并期望从客户端返回一个PONG数据包。
   */
//   #resetPingTimeout() {
//     clearTimeout(this.#pingTimeoutTimer);
//     this.#pingTimeoutTimer = setTimeout(() => {
//       this.#onClose("ping timeout");
//     }, this.#pingTimeoutDelay);
//   }

//   // 心跳机制
//   #send(data) {
//     if (this.#ws.readyState === WebSocket.OPEN) {
//       this.#ws.send(data);
//     }
//   }

//   #onClose(reason) {
//     if (this.#ws) {
//       this.#ws.onclose = noop;
//       this.#ws.close();
//     }
//     // 心跳机制
//     clearTimeout(this.#pingTimeoutTimer);

//     clearTimeout(this.#reconnectTimer);  
//     if (this.#shouldReconnect) {
//       this.#reconnectTimer = setTimeout(
//         () => this.#open(),
//         this.#opts.reconnectionDelay // 注释下面253行代码
//       );
//     }
//     // 重联
//     // setTimeout(() => this.#open(), this.#opts.reconnectionDelay);
//   }
//   disconnect() {
//      this.#shouldReconnect = false;
//      this.#onClose("io client disconnect");
//    }

//   // 让我们发送一些数据到服务器。我们需要跟踪底层连接的状态，并缓冲数据包，直到连接就绪：
//   emit(...args) {
//     const packet = {
//       type: SIOPacketType.EVENT,
//       data: args,
//     };

//     if (this.connected) {
//       this.#sendPacket(packet);
//     } else {
//       this.#sendBuffer.push(packet);
//     }
//   }
// }
//   连接
// function encode(packet) {
//   let output = "" + packet.type;

//   if (packet.data) {
//     output += JSON.stringify(packet.data);
//   }

//   return output;
// }
// 如果连接被允许，那么服务器将发送回一个EQUECT数据包：
// function decode(data) {
//   let i = 1; // skip "4" prefix

//   const packet = {
//     type: parseInt(data.charAt(i++), 10),
//   };
//   // 让我们处理服务器发送的EVENT数据包：
//   if (data.charAt(i)) {
//     packet.data = JSON.parse(data.substring(i));
//   }

//   if (!isPacketValid(packet)) {
//     throw new Error("invalid format");
//   }

//   return packet;
// }
// 如果连接被允许，那么服务器将发送回一个EQUECT数据包：
// function isPacketValid(packet) {
//   switch (packet.type) {
//     case SIOPacketType.CONNECT:
//       return typeof packet.data === "object";

//     //   手动断开
//     case SIOPacketType.DISCONNECT:
//      return packet.data === undefined;

//     //   处理接收消息
//     case SIOPacketType.EVENT: {
//       const args = packet.data;
//       return (
//         Array.isArray(args) && args.length > 0 && typeof args[0] === "string"
//       );
//     }
//     default:
//       return false;
//   }
// }

// const socket = io("https://example.com");
//   const socket = io(); 或从 window.location 对象推断

// export function io(uri, opts) {
//   if (typeof uri !== "string") {
//     opts = uri;
//     uri = location.origin;
//   }
//   return new Socket(uri, opts);
// }
// 代码 https://github.com/socketio/socket.io/tree/main/examples/basic-websocket-client


   