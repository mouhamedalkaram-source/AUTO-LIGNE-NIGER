const http = require("http");

const PORT = Number(process.env.PORT || 3000);
const handler = require("./server-core");

if (require.main === module) {
  http.createServer(handler).listen(PORT, () => {
    console.log(`Auto Ligne Niger: http://0.0.0.0:${PORT}`);
  });
}

module.exports = handler;
