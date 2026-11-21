'use strict';
const { createGroupServer } = require('../electron/groups-server.cjs');
const service = createGroupServer({
  dataFile: process.argv[2],
  allowedOrigins: ['http://127.0.0.1:5173'],
  port: 0,
});
service
  .start()
  .then((result) => process.stdout.write(JSON.stringify(result) + '\n'))
  .catch(() => process.exit(1));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => service.close().finally(() => process.exit()));
