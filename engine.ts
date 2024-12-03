import * as compress from "jsr:@deno-library/compress";
import docs from "./docs.d.ts";
import { encode as base64Encode } from "https://deno.land/std@0.97.0/encoding/base64.ts";
import { createHash } from "https://deno.land/std@0.97.0/hash/mod.ts";
//const {gzip}=compress

const sec={
  regex:/(?:)/
};

interface SecureID{
  regex: RegExp;
}

const TypedArray=Object.getPrototypeOf(Uint8Array.prototype).constructor;

class Engine {
  #Deno = Deno;
  deno = this.#Deno;
  #te = new TextEncoder();
  #td = new TextDecoder();

  port: number = 80;
  host: string = "0.0.0.0";
  get server() {
    return this.#Deno.listen({ port: this.port, host: this.host });
  }

  constructor() {}

  async start(tls?:object ,port?: number): Promise<void> {
    if (port) this.port = port;
    if(!tls){
      const server = this.server;
      //console.log('server created on',this.port)
      for await (const conn of server) {
        //conn.readable.pipeTo(conn.writable);
        this.#listener(conn);
      }
    } else {
      ;
    }
  }

  #on = {};
  on(eventName: string, listener: (event: object) => void|Promise<void>):void {
    if (!this.#on[eventName]) this.#on[eventName] = [];
    this.#on[eventName].push(listener);
  }
  #emit(eventName: string, obj: object) {
    if (this.#on[eventName]) this.#on[eventName].forEach((e) => e(obj));
  }

  #readSize= 1024 * 10;
  set readSize(int:any){
    this.#readSize=parseInt(int);
  }
  get readSize():number{return this.#readSize};
  
  #Socket = class HTTPSocket {
    #engine; #tcp;
    #td; #te; #data;

    #isWebsocket=false;

    

    get tcpSocket() {
      if(!this.#isWebsocket)return this.#tcp;
    }
    get tcpData() {
      if(!this.#isWebsocket)return this.#data;
    }
    get socket() { return this; }
    constructor(engine,td, te, tcp, data) {
      this.#td = td;
      this.#te = te;
      this.#tcp = tcp;
      this.#data = data;
      this.#engine = engine;

      let encodings=this.client.headers["accept-encoding"];
      //console.log("encodings",encodings,encodings&&encodings.includes("gzip"))
      if(encodings&&encodings.includes("gzip"))this.compress=true;
    }
    #client;
    get client(): Client|null {
      if (this.#client) return this.#client;
      if(this.#isWebsocket) return null;
      let c = new class Client {
        isValid: boolean = false;
        err: void | object;
        headers: Record<string, string>={};
        method: string;
        address: object;
        path: string;
        httpVersion: string;
        data: string;
        //proxied: boolean;
      }();
      c.address = this.#tcp.remoteAddr;

      try {
        let str = this.#td.decode(this.#data);
        let [h,cd] = str.split("\r\n\r\n");
        let [hd,...hs] = h.split("\r\n");

        //console.log('engine h hd hs',h,hd,hs);
        for (let i of hs) {
          let hi = i.split(": ");
          c.headers[hi[0].toLowerCase()] = hi[1];
        }

        c.method = hd.split(" ")[0];
        c.path = hd.split(" ")[1];
        c.httpVersion = hd.split(" ")[2];
        c.data = cd;

        if (c.method && c.path && c.httpVersion) c.isValid = true;
      } catch (err) {
        c.err = err;
      }

      Object.freeze(c);
      Object.seal(c);
      return this.#client = c;
    }
    status: number = 200;
    statusMessage: string = "OK";
    compress: boolean = false;
    encoding: string = "gzip";
    #headers: Record<string, string> = {
      "Content-Type": "text/html",
      "Transfer-Encoding": "chunked",
      "Connection":"keep-alive",
      "Keep-Alive":"timeout=5",
      "Server":"TI-84 Plus CE-T Python Edition",
      "Date": new Date().toString(),
    };
    #headersSent = false;
    #headersPromise: Promise<void>;
    async #sendHeaders(length:number): Promise<void> {
      if (!this.#headersSent) {
        let resolve;
        this.#headersPromise = new Promise(r=>resolve=r);
        this.#headersSent = true;

        //this.#headers["Content-Length"]=length.toString();

        let headers: string[] = [];
        for (let k in this.#headers) {
          let v = this.#headers[k];
          headers.push(`${k}: ${v}`);
        }
        await this.#tcp.write(
          this.#te.encode(
            `HTTP/1.1 ${this.status} ${this.statusMessage}\r\n${headers.join("\r\n")}\r\n\r\n`,
          ),
        );
        resolve();
      } else {
        await this.#headersPromise;
      }
    }
    setHeader(a: string, b: string): boolean {
      if(this.#isWebsocket)return false;
      if (this.#headersSent == true) return false;
      this.#headers[a] = b;
      return true;
    }
    writeHead(status?: number, statusMessage?: string, headers?: object): void {
      if(this.#isWebsocket)return;
      if (status) this.status = status;
      if (statusMessage) this.statusMessage = statusMessage;
      if (headers) { for (let i in headers) this.#headers[i] = headers[i]; }
      //return this.#sendHeaders();
    }
    async #writeChunk(buf:ArrayBuffer): Promise<void>{
      await this.#tcp.write(this.#te.encode(buf.byteLength.toString(16)+"\r\n"));
      await this.#tcp.write(buf);
      await this.#tcp.write(this.#te.encode("\r\n"));
    }
    async writeText(text: string): Promise<void> {
      if(this.#isWebsocket)return;
      let b=this.#te.encode(text);
      if(this.compress){
        this.setHeader("Content-Encoding", "gzip");
        if(this.encoding=="gzip")b=compress.gzip(b);
      }
      await this.#sendHeaders(text.length);
      await this.#writeChunk(b);
    }
    async writeBuffer(buffer: ArrayBuffer): Promise<void> {
      if(this.#isWebsocket)return;
      let b=buffer;
      if(this.compress){
        this.setHeader("Content-Encoding", "gzip");
        if(this.encoding=="gzip")b=compress.gzip(b);
      }
      await this.#sendHeaders(buffer.byteLength);
      await this.#writeChunk(b);
    }
    async close(data?: string | ArrayBuffer): Promise<void> {
      if(this.#isWebsocket)return;
      //await this.#sendHeaders(0);
      if (typeof data == "string") await this.writeText(data);
      if (typeof data == "object") await this.writeBuffer(data);
      await this.#tcp.write(this.#te.encode("0\r\n\r\n"));
      this.#tcp.close();
    }
    deny(){if(!this.#isWebsocket)this.#tcp.close()}

    #ws:WebSocket;
    async websocket():Promise<WebSocket|null>{
      if(this.#ws)return this.#ws;
      const args=[
        this.#engine,
        this.#td,
        this.#te,
        this.#tcp,
        this.#data,
        this,
      ];
      const ws:WebSocket=new this.#engine.WebSocket(...args)
      this.#ws=ws;
      let suc:boolean=await ws.ready;
      if(suc){
        this.#isWebsocket=true;
        return ws;
      }
      else return null;
    };
    get isWebSocket(){return this.#isWebsocket};
    //set isWebSocket(iws:boolean){if(iws)this.websocket();}
  };
  #WebSocket = class WebSocket{
    #engine; #tcp;
    #td; #te; #data;
    #socket; #isReady=false;
    #ready; #readyPro; #err=null;

    get err():Error|null{
      return this.#err;
    };

    get ready(): Promise<boolean>{
      return this.#readyPro;
    };
    get isReady(): boolean{
      return this.#isReady;
    }

    #readSize = 1024 * 10;
    set readSize(int:any){
      this.#readSize=parseInt(int);
    }
    get readSize():number{return this.#readSize};

    constructor(engine, td, te, tcp, data, socket){
      this.#td = td;
      this.#te = te;
      this.#tcp = tcp;
      this.#data = data;
      this.#engine = engine;
      this.#socket = socket;

      let resolve;
      this.#readyPro=new Promise(r=>resolve=r);
      this.#ready=resolve;

      this.#init();
    }

    #on = {};
    on(eventName: string, listener: (event: object) => void|Promise<void>):void {
      if (!this.#on[eventName]) this.#on[eventName] = [];
      this.#on[eventName].push(listener);
    }
    #emit(eventName: string, obj: object) {
      try{
        if (this.#on[eventName]) this.#on[eventName].forEach((e) => e(obj));
      } catch(err) {
        if (this.#on["emit-err"]) this.#on["emit-err"].forEach((e) => e(err));
      }
    }

    get#magicString(){return "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"}
    async#init(){
      try{
        let client:Client=this.#socket.client;
        if(client.isValid){
          let key=client.headers["sec-websocket-key"].trim();
          if(!key)throw new Error("client has no websocket key");
          
          const sha1 = createHash("sha1");
          sha1.update(key + this.#magicString);
          const wsKey=base64Encode(sha1.digest());

          let res=[
            "HTTP/1.1 101 Switching Protocols",
            "Upgrade: websocket",
            "Connection: Upgrade",
            `Sec-WebSocket-Accept: ${wsKey}`,
            "\r\n",
          ].join("\r\n");

          await this.#tcp.write(new TextEncoder().encode(res));

          this.#listener();

          this.#ready(this.#isReady=true);
        } else {
          throw new Error("client is not valid");
        }
      } catch(err) {
        this.#err=err;
        return this.#ready(false);
      }

    }

    #listening=false;
    get listening(): boolean{return this.#listening};
    async#listener(){
      this.#listening=true;
      try{
        const buff=new Uint8Array(this.readSize);
        while (this.#listening) {
          const read = await this.#tcp.read(buff);
          if (!read) throw new Error("could not read frame");
          
          const frameBuff = buff.subarray(0, read);
          const frame = this.#parseFrame(frameBuff);
          if (!frame) throw new Error("could not parse frame data");

          this.#emit("frame", frame);
        }
      } catch(err){
        this.#err=err;
        this.#emit("error", err);
      }
      this.#listening=false;
    }
    #parseFrame(data: Uint8Array): WsFrame | null {
      if (data.length < 2) return null;
    
      const fin = (data[0] & 0x80) !== 0; // Extract FIN bit
      const opcode = data[0] & 0x0F; // Extract opcode
      const mask = (data[1] & 0x80) !== 0; // Extract MASK bit
      let payloadLength = data[1] & 0x7F; // Extract initial payload length
      let offset = 2; // Offset to read further
    
      // Handle extended payload lengths
      if (payloadLength === 126) {
        if (data.length < offset + 2) return null; // Ensure we have 2 bytes
        payloadLength = (data[offset] << 8) | data[offset + 1];
        offset += 2;
      } else if (payloadLength === 127) {
        if (data.length < offset + 8) return null; // Ensure we have 8 bytes
        payloadLength = Number(
          (BigInt(data[offset]) << 56n) |
          (BigInt(data[offset + 1]) << 48n) |
          (BigInt(data[offset + 2]) << 40n) |
          (BigInt(data[offset + 3]) << 32n) |
          (BigInt(data[offset + 4]) << 24n) |
          (BigInt(data[offset + 5]) << 16n) |
          (BigInt(data[offset + 6]) << 8n) |
          BigInt(data[offset + 7])
        );
        offset += 8;
      }
    
      // Ensure the data length includes masking key and payload
      const maskLength = mask ? 4 : 0;
      if (data.length < offset + maskLength + payloadLength) return null;
    
      // Extract masking key if present
      let maskingKey: Uint8Array | undefined;
      if (mask) {
        maskingKey = data.subarray(offset, offset + 4);
        offset += 4;
      }
    
      // Extract and unmask the payload
      let payload = data.subarray(offset, offset + payloadLength);
      if (mask && maskingKey) {
        payload = payload.map((byte, index) => byte ^ maskingKey![index % 4]);
      }
    
      const frame={ fin, opcode, payload, opname:"unkown", close: {code: -1, message: new Uint8Array} };
      
      frame.opname=({
        0x1:"text",
        0x2:"binary",
        0x8:"close",
        0x9:"ping",
        0xA:"pong",
      })[opcode]||frame.opname;

      if(opcode==0x8&&payload.length>=2){
        let c=payload.subarray(0,2);
        frame.close.code=parseInt(c[0].toString(16)+c[1].toString(16),16);
        if(payload.length>2)frame.close.message=payload.slice(2);
      }

      
      Object.freeze(frame);
      Object.seal(frame);
      return frame;
    }    
    async#sendFrame(opcode: number, payload = new Uint8Array()) {
      let header: Uint8Array;
      const payloadLength = payload.byteLength;
    
      if (payloadLength <= 125) {
        header = new Uint8Array(2);
        header[1] = payloadLength;
      } else if (payloadLength <= 0xffff) {
        header = new Uint8Array(4);
        header[1] = 126;
        header[2] = (payloadLength >> 8) & 0xff;
        header[3] = payloadLength & 0xff;
      } else {
        header = new Uint8Array(10);
        header[1] = 127;
        const length = BigInt(payloadLength);
        for (let i = 0; i < 8; i++) {
          header[9 - i] = Number((length >> (BigInt(i) * 8n)) & 0xffn);
        }
      }
      
      header[0] = 0x80 | opcode;
      
      const frame = new Uint8Array(header.length + payload.byteLength);
      frame.set(header);
      frame.set(payload, header.length);
      
      await this.#tcp.write(frame);
    }    
    #uint(data:any):Uint8Array{
      let ret:Uint8Array;
      if(typeof data=="string")ret=this.#te.encode(data);
      else if(typeof data=="number")ret=this.#te.encode(data.toString());
      //else if(typeof data=="object"&&!(data instanceof Uint8Array)&&data instanceof ArrayBuffer)this.#te.encode(this.#td.decode(data));
      else if(typeof data=="object"&&!(data instanceof Uint8Array))ret=this.#te.encode(data.toString());
      else ret=data;
      return ret;
    }

    #closing=false;

    async end(){ 
      if(!this.#closing)await this.close(1001);
      this.#tcp.close();
    };
    async sendText(data:Uint8Array|string){
      let opcode=0x1;
      let payload=this.#uint(data);
      await this.#sendFrame(opcode, payload);
    };
    async sendBinary(data:Uint8Array|string){
      let opcode=0x2;
      let payload=this.#uint(data);
      await this.#sendFrame(opcode, payload);
    };
    async ping(data:Uint8Array|string){
      let opcode=0x9;
      let payload=this.#uint(data);
      await this.#sendFrame(opcode, payload);
    };
    async pong(data:Uint8Array|string){
      let opcode=0xA;
      let payload=this.#uint(data);
      await this.#sendFrame(opcode, payload);
    };
    async close(code: number=1001, message: Uint8Array|string=new Uint8Array){
      let opcode=0x8;
      let hex=code.toString(16);
      let nhex=("0000"+hex).substring(hex.length);
      let cb1=nhex.substring(0,2);
      let cb2=nhex.substring(2);
      let cbs=[parseInt(cb1,16),parseInt(cb2,16)];

      const frame=new Uint8Array(2+message.length);
      frame.set(cbs);
      frame.set(this.#uint(message),2)

      await this.#sendFrame(opcode,frame);
      this.#closing=true;
      this.#listening=false;
    };
  };

  async #listener(conn): Promise<void> {
    //conn.accept();
    const encoder = this.#te;
    const decoder = this.#td;
    let dat = new Uint8Array(this.readSize);
    //console.log('incoming connection',conn);
    const length = await conn.read(dat);
    const data = dat.slice(0, length);
    const socket = new this.#Socket(this,decoder, encoder, conn, data);
    this.#emit("connect", socket);
  };
  get Socket(){ return this.#Socket; };
  get WebSocket(){ return this.#WebSocket; };
  /*__getSocket(secid: SecureID){
    if(sec!=secid)return null;
    else return this.#WebSocket;
  };*/
}

export default Engine;

//console.log('data',data)
/*await conn.write(encoder.encode(`HTTP/2 200 OK\r
Content-Type: text/plain\r
\r
${decoder.decode(data)}`));
    conn.close(); */
/*
const server = Deno.listen({ port: 80 });
const encoder = new TextEncoder();
const decoder = new TextDecoder();

console.log("listening on 0.0.0.0:80");


for await (const conn of server) {
  //conn.readable.pipeTo(conn.writable);

}


function listener(conn): void{
  const dat=new Uint8Array(1024);
  conn.readable.read(dat);
  conn.writable.write(encoder.encode(`HTTP/2 200 OK\r
Content-Type: text/html\r
\r
${decoder.decode(dat)}`));
}
*/
