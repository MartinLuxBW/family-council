import http from 'node:http';
import handler from './api/index.js';

const PORT = process.env.PORT || 3000;
const server = http.createServer(handler);
server.listen(PORT, () => {
  console.log(`🏠 Family Council running at http://localhost:${PORT}`);
});
