import {redis} from '../config/redis.js';


async function main() {
  console.log('--- SET ---');
  await redis.set('foo', 'bar');
  console.log('Set foo = bar');

  console.log('--- GET ---');
  const value = await redis.get('foo');
  console.log('Got foo =', value); // expect: bar

  console.log('--- SET with TTL (EX) ---');
  await redis.set('foo', 'bar', { ex: 5 }); // expires in 5 seconds
  console.log('Reset foo with a 5-second TTL');

  console.log('Waiting 6 seconds for it to expire...');
  await new Promise((r) => setTimeout(r, 6000));

  const afterExpiry = await redis.get('foo');
  console.log('Got foo after TTL expired =', afterExpiry); // expect: null

  console.log('--- DEL ---');
  await redis.set('baz', 'qux');
  await redis.del('baz');
  const afterDelete = await redis.get('baz');
  console.log('Got baz after DEL =', afterDelete); // expect: null
}

main();