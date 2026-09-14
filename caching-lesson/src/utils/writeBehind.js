import {EventEmitter} from  'events';
import { redis } from '../config/redis.js';
import { db } from '../db/connection.js';

class WriteBehind extends EventEmitter {
    constructor(prefix = 'product:', options = {}) {
        super(); 
        this.prefix = prefix;
        this.ttl = options.ttl || 300; // default TTL of 5 minutes
        this.batchSize = options.batchSize || 10; // default batch size of 10
        this.flushInterval = options.flushInterval || 1000; // default flush interval of 1 second
        this.writeQueue = [];
        this.startBackgroundWriter();
    }

    cacheKey(id){
        return `${this.prefix}${id}`;
    }

    async get(id){
        const cacheKey = this.cacheKey(id);
        const cachedProduct = await redis.get(cacheKey);

        if(cachedProduct){
            
            return cachedProduct;
        }
        
        const product = await this.fetchFromDatabase(id);

        if(product){
            await redis.set(cacheKey, product, { ex: this.ttl });
        }

        return product;
    }

    async set(id, product){
        const cacheKey = this.cacheKey(id);

        await redis.set(cacheKey, product, { ex: this.ttl });

        this.writeQueue.push({operation: "set", id, product, timestamp: Date.now()});

        console.log('the queque is: ', this.writeQueue);

        return true;


    }

    startBackgroundWriter(){
        this.flushTimer = setInterval(async () => {
            //console.log('Checking if write queue has items to flush...');
            if(this.writeQueue.length > 0){
                await this.flushQueue();
            }
        }, this.flushInterval);
    }

    async flushQueue(){
        const batch = this.writeQueue.splice(0, this.batchSize);
        if(batch.length === 0) return;

        const sets = batch.filter(item => item.operation === "set");
        console.log('Flushing queue with sets:', sets);
        try{
            this.batchWriteToDatabase(sets);
            this.emit('flush', {sets: sets.length});
        } catch(error){ 
            console.error('Error flushing queue:', error);
            this.writeQueue.unshift(...batch);
            this.emit('flushError', error);
        }
    }

    async shutdown(){
        clearInterval(this.flushTimer);
        await this.flushQueue();
    }

    fetchFromDatabase(id){
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        return product;
    }

    batchWriteToDatabase(sets){
        const upsert = db.prepare(`
            INSERT INTO products (id, name, price) VALUES (@id, @name, @price) ON CONFLICT(id) DO UPDATE SET name = @name, price = @price
        `);

        const runMany = db.transaction((rows) => {
            for (const row of rows) upsert.run(row);
        });

        runMany(sets.map((item) => ({...item.product, id: item.id})));
    }
}


export {WriteBehind};