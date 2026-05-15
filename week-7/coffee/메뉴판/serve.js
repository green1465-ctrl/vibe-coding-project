const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const types = {'.html':'text/html;charset=utf-8','.css':'text/css','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p==='/') p='/menu.html';
  const fp = path.join(root, p);
  if(!fp.startsWith(root)){res.writeHead(403);return res.end();}
  fs.readFile(fp,(e,d)=>{
    if(e){res.writeHead(404);return res.end('404');}
    res.writeHead(200,{'Content-Type':types[path.extname(fp).toLowerCase()]||'application/octet-stream'});
    res.end(d);
  });
}).listen(8731,'127.0.0.1',()=>console.log('listening 8731'));
