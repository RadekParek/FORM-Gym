#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createGroupServer } = require('../electron/groups-server.cjs');
const { createSupabaseStore } = require('../electron/supabase-store.cjs');

async function main() {
  if (
    process.env.RENDER &&
    (!process.env.FORM_SUPABASE_URL || !process.env.FORM_SUPABASE_SERVICE_KEY)
  )
    throw new Error('Configure persistent storage before deploying the community service.');
  // Running this launcher is explicit hosting. Use a reverse proxy with HTTPS for internet access.
  const service = createGroupServer({
    storage: createSupabaseStore(
      process.env.FORM_SUPABASE_URL,
      process.env.FORM_SUPABASE_SERVICE_KEY,
    ),
    dataFile:
      process.env.FORM_GROUP_DATA_FILE ||
      path.resolve(__dirname, '../../group-server-data/groups.json'),
    host: process.env.FORM_GROUP_HOST || '127.0.0.1',
    port: Number(process.env.PORT || process.env.FORM_GROUP_PORT || 47831),
    allowedOrigins: (
      process.env.FORM_GROUP_ORIGINS || 'gym://app,https://localhost,http://localhost'
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      service.close().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
    });
  const { url } = await service.start();
  console.log(`FORM group server listening at ${url}`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
