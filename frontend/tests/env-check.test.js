
const test = require('node:test');
test('check env', () => {
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('SKIP_API_AUTH:', process.env.SKIP_API_AUTH);
  console.log('DISABLE_API_AUTH:', process.env.DISABLE_API_AUTH);
});
