import {Router} from 'express';
import {db} from '../db/connection.js';
import { redis } from '../config/redis.js';

const productRouter = Router();

productRouter.get('/all', (req, res) => {
    console.log('Fetching all products from the database...');
  const products = db.prepare('SELECT * FROM products').all();
  res.json(products);
});


const NULL_SENTINEL = '__null__';

productRouter.get('/:id', async (req, res) => {
  const { id } = await req.params;
  console.log(`Fetching product with ID ${id} from the database...`);
  const cacheKey = `product:${id}`;
  const cachedProduct = await redis.get(cacheKey);
  console.log(`Cache key: ${cacheKey}, Cached product:`, cachedProduct);

  if (cachedProduct === null) {
    console.log(`Cache miss for product ID ${id}`);
  } 

  else if (cachedProduct === NULL_SENTINEL) {
    console.log(`Cache hit for product ID ${id}, but product is marked as not found.`);
    return res.status(404).json({ error: 'Product not found' });
  }
  
  else {
    console.log(`Cache hit for product ID ${id}`);
    console.log('Cached product:', cachedProduct);
    return res.json(cachedProduct);
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) {
    console.log(`Product with ID ${id} not found in the database.`, product);
    await redis.setex(cacheKey, 30, NULL_SENTINEL);
    return res.status(404).json({ error: 'Product not found' });
  }
  await redis.setex(cacheKey, 300, JSON.stringify(product)); // Cache for 1 hour
  res.json(product);
});

export default productRouter;