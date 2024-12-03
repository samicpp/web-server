//import docs from "../../../docs.d.ts";


let del:Function;
let visits=0;
let ws:WebSocket;
let td=new TextDecoder;
let te=new TextEncoder;
let closing=false;

function handler(frame:WsFrame){
    console.log("ws.deno.ts frame",frame);
    if(frame.opname=="ping")ws.pong(frame.payload);
    else if(frame.opname=="pong")console.log("pong received");

    else if(frame.opname=="text"){
        console.log("ws.deno.ts sending something back")
        let text=td.decode(frame.payload);
        if(text=="!ping") ws.ping("crazy");
        else if(text=="!close") {
            ws.close(1001,"Closing because of close command");
            closing=true
        }
        else ws.sendText("client said: "+text);
    }
    else if(frame.opname=="close"&&!closing){
        console.log("ws.deno.ts client wants out because", td.decode(frame.close.message));
        if(frame.close.code==-1){
            console.log("client didnt send any closure data");
            ws.close(1002, "Client initiated closure. Cannot read closure code");
        }
        else ws.close(frame.close.code,"Client initiated closure");
    }
    else if(frame.opname=="close"&&closing){
        console.log("ws.deno.ts close acknowledgement received");
        ws.end();
    }
}

export default async function(socket: HTTPSocket, url, get){
    socket.close(); 
    del();
}
export async function init(socket: HTTPSocket, url: URL, get: string, dele: ()=> void, past: any|void){
    del=dele;
    const {client}=socket;
    console.log("ws.deno.ts",socket.client);

    if(client.headers["upgrade"]=="websocket"){
        console.log("ws.deno.ts websocket upgrade");
        let w=await socket.websocket();
        if(w)ws=w;
        else return console.log("ws.deno.ts couldnt upgrade");

        console.log("ws.deno.ts upgraded connection",ws);
        ws.on("frame",handler);

    }else{
        await socket.writeText("hello");
        socket.close(); 
    }

    dele();
}
