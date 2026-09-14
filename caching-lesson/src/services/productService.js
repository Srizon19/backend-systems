import {Router} from 'express';
import {db} from '../db/connection.js';
import { redis } from '../config/redis.js';
import { WriteBehind } from '../utils/writeBehind.js';

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
  let cachedProduct;
  try {
    cachedProduct = await redis.get(cacheKey);
  } catch (error) {
    console.error(`Error fetching product with ID ${id} from Redis cache:`, error);
  }
  
  console.log(`Cache key: ${cacheKey}, Cached product:`, cachedProduct);

  if (cachedProduct === NULL_SENTINEL) {
    console.log(`Cache hit for product ID ${id}, but product is marked as not found.`);
    return res.status(404).json({ error: 'Product not found' });
  }

  else if (cachedProduct) {
    console.log(`Cache hit for product ID ${id}`);
    console.log('Cached product:', cachedProduct);
    return res.json(cachedProduct);
  } 
  
  else {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!product) {
      console.log(`Product with ID ${id} not found in the database.`, product);
      try {
        await redis.setex(cacheKey, 30, NULL_SENTINEL);
      } catch (error) {
        console.error(`Error occurred while fetching product with ID ${id} from the database:`, error);
      }
      
      return res.status(404).json({ error: 'Product not found' });
    }
    try {
      await redis.setex(cacheKey, 300, product); // Cache for 5 minutes
    } catch (error) {
      console.error(`Error occurred while caching product with ID ${id}:`, error);
    }
    return res.json(product);
  }

  
});


productRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, price } = req.body;

  //return res.json({ message: 'Product updated successfully', product: { id, name, price } });

  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const updatedName = name ?? current.name;
  const updatedPrice = price ?? current.price;

  const product = db.prepare('UPDATE products SET name = ?, price = ? WHERE id = ?').run(updatedName, updatedPrice, id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Invalidate the cache for this product
  const cacheKey = `product:${id}`;
  try {
    await redis.del(cacheKey);
  } catch (error) {
    console.error(`Error occurred while invalidating cache for product with ID ${id}:`, error);
  }

  return res.json({ message: 'Product updated successfully' , product});
});


// updates the database and the cache immediately after, so that the cache is always up-to-date with the database
productRouter.put('/write-through/:id', async (req, res) => {
  const { id } = req.params;
  const { name, price } = req.body;
  
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  
  
  if (!current) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const updatedName = name ?? current.name;
  const updatedPrice = price ?? current.price;

  //for write-through caching, we update the database and then update the cache immediately after
  const product = db.prepare('UPDATE products SET name = ?, price = ? WHERE id = ?').run(updatedName, updatedPrice, id);
  if (!product) {
    return res.status(404).json({ error: 'Product update not successful' });
  }

  // Update the cache for this product
  const cacheKey = `product:${id}`;
  try {
    await redis.setex(cacheKey, 300, {id, name: updatedName, price: updatedPrice}); // Cache for 5 minutes

    return res.json({ message: 'Product updated successfully with write-through caching', product: { id, name: updatedName, price: updatedPrice } });
  } catch (error) {
    console.error(`Error occurred while updating cache for product with ID ${id}:`, error);
  }
})

//write-behind caching, we update the cache and then update the database in the background

const productCache = new WriteBehind('product:',{
  ttl: 300, // 5 minutes
  batchSize: 5, // number of writes to batch before flushing to the database
  flushInterval: 1000, // flush every 1 second
})


productRouter.get('/write-behind/:id', async (req, res) =>{
  const { id } = req.params;
  const product = await productCache.get(id);

  if(!product){
    return res.status(404).json({ error: 'Product not found' });
  }

  return res.json(product);
})

productRouter.put('/write-behind/:id', async (req, res) => {
  const { id } = req.params;
  const { name, price } = req.body;

  const current = await productCache.get(id);

  if(!current){
    return res.status(404).json({ error: 'Product not found' });
  }


  const updatedProduct = {
    id,
    name: name ?? current.name,
    price: price ?? current.price,
  };


  const queueIsFull = await productCache.set(id, updatedProduct);

  if(queueIsFull){
    productCache.flushQueue().catch((error) => {
      console.error('Error flushing write-behind queue:', error);
    });
  }

  return res.json({
    message: 'Product update accepted (write-behind) — cache updated now, DB write deferred',
    product: updatedProduct,
  });
})



export default productRouter;