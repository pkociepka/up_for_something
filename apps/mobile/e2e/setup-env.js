const { config } = require('dotenv');
const { join } = require('path');
config({ path: join(__dirname, '.env.test') });

// @supabase/realtime-js requires a global WebSocket; Node < 22 doesn't have one.
if (typeof WebSocket === 'undefined') {
  global.WebSocket = require('ws');
}
